/** Source-side Office gold. Reads OOXML bytes without calling a Zero1 parser. */
import JSZip from "jszip"
import { DOMParser } from "@xmldom/xmldom"
import { posix as path } from "node:path"

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
const A = "http://schemas.openxmlformats.org/drawingml/2006/main"
const P = "http://schemas.openxmlformats.org/presentationml/2006/main"
const S = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

const descendants = (element, ns, name) => Array.from(element.getElementsByTagNameNS(ns, name))
const nodeText = (element, ns, name) => descendants(element, ns, name).map(node => node.textContent ?? "").join("")
const directChild = (element, ns, name) => Array.from(element.childNodes).find(node =>
  node.nodeType === 1 && node.namespaceURI === ns && node.localName === name)

async function xmlPart(zip, name) {
  const file = zip.file(name)
  if (!file) throw new Error(`OOXML part missing: ${name}`)
  const xml = await file.async("string")
  const parsed = new DOMParser({ onError: (level, message) => {
    if (level !== "warning") throw new Error(message)
  } })
    .parseFromString(xml, "application/xml")
  if (descendants(parsed, "*", "parsererror").length) throw new Error(`Invalid OOXML part: ${name}`)
  return parsed
}

function relationshipTargets(document) {
  const map = new Map()
  for (const rel of descendants(document, PACKAGE_REL, "Relationship")) {
    if (rel.getAttribute("TargetMode") === "External") continue
    map.set(rel.getAttribute("Id"), rel.getAttribute("Target"))
  }
  return map
}

function partPath(base, target) {
  if (!target) throw new Error("OOXML relationship has no target")
  const resolved = target.startsWith("/") ? target.slice(1) : path.join(base, target)
  if (resolved.startsWith("../") || path.isAbsolute(resolved)) throw new Error(`Invalid OOXML target: ${target}`)
  return path.normalize(resolved)
}

export async function docxParagraphs(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const document = await xmlPart(zip, "word/document.xml")
  const body = descendants(document, W, "body")[0]
  if (!body) throw new Error("DOCX body missing")
  return descendants(body, W, "p")
    .map(paragraph => nodeText(paragraph, W, "t").trim())
    .filter(Boolean)
}

export async function pptxParagraphs(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const presentation = await xmlPart(zip, "ppt/presentation.xml")
  const rels = relationshipTargets(await xmlPart(zip, "ppt/_rels/presentation.xml.rels"))
  const slides = []
  for (const [index, slide] of descendants(presentation, P, "sldId").entries()) {
    const id = slide.getAttributeNS(R, "id") || slide.getAttribute("r:id")
    const source = partPath("ppt", rels.get(id))
    const document = await xmlPart(zip, source)
    slides.push({
      number: index + 1,
      source,
      paragraphs: descendants(document, A, "p")
        .map(paragraph => nodeText(paragraph, A, "t").trim())
        .filter(Boolean),
    })
  }
  return slides
}

export async function xlsxSourceCells(bytes) {
  const zip = await JSZip.loadAsync(bytes)
  const workbook = await xmlPart(zip, "xl/workbook.xml")
  const rels = relationshipTargets(await xmlPart(zip, "xl/_rels/workbook.xml.rels"))
  const stringsFile = zip.file("xl/sharedStrings.xml")
  const strings = stringsFile
    ? descendants(await xmlPart(zip, "xl/sharedStrings.xml"), S, "si").map(item => nodeText(item, S, "t"))
    : []
  const sheets = []
  for (const [index, sheet] of descendants(workbook, S, "sheet").entries()) {
    const name = sheet.getAttribute("name")
    const id = sheet.getAttributeNS(R, "id") || sheet.getAttribute("r:id")
    const source = partPath("xl", rels.get(id))
    const document = await xmlPart(zip, source)
    const cells = []
    for (const cell of descendants(document, S, "c")) {
      const address = cell.getAttribute("r")
      if (!/^[A-Z]+[1-9]\d*$/.test(address)) throw new Error(`Invalid XLSX cell address: ${address}`)
      const storedType = cell.getAttribute("t") || "n"
      const formula = directChild(cell, S, "f")
      const raw = directChild(cell, S, "v")?.textContent ?? ""
      let value = raw
      let type = "number"
      if (storedType === "s") {
        value = strings[Number(raw)]
        if (value === undefined) throw new Error(`Invalid XLSX shared string index: ${raw}`)
        type = "string"
      } else if (storedType === "inlineStr") {
        value = nodeText(directChild(cell, S, "is") ?? cell, S, "t")
        type = "string"
      } else if (storedType === "str") type = "string"
      else if (storedType === "b") type = "boolean"
      else if (storedType === "e") type = "error"
      if (formula) type = "formula"
      if (value !== "" || formula) cells.push({ address, type, value, storedType, hasCachedValue: !!formula && raw !== "" })
    }
    sheets.push({
      number: index + 1,
      name,
      source,
      cells,
      merges: descendants(document, S, "mergeCell").map(item => item.getAttribute("ref")),
    })
  }
  return sheets
}

export function normalizeUnit(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")
}

export function scoreUnits(sourceUnits, outputText) {
  const output = normalizeUnit(outputText)
  const units = sourceUnits.map(normalizeUnit).filter(Boolean)
  const counts = new Map()
  for (const unit of units) counts.set(unit, (counts.get(unit) ?? 0) + 1)
  let presentUnits = 0
  let presentChars = 0
  for (const [unit, expected] of counts) {
    let found = 0, cursor = 0
    while (found < expected) {
      const at = output.indexOf(unit, cursor)
      if (at < 0) break
      found++
      cursor = at + unit.length
    }
    presentUnits += found
    presentChars += found * unit.length
  }
  let orderedUnits = 0, cursor = 0
  for (const unit of units) {
    const at = output.indexOf(unit, cursor)
    if (at < 0) continue
    orderedUnits++
    cursor = at + unit.length
  }
  const totalChars = units.reduce((sum, unit) => sum + unit.length, 0)
  return {
    totalUnits: units.length,
    presentUnits,
    orderedUnits,
    exactUnitRecallWeighted: totalChars ? presentChars / totalChars : 1,
  }
}
