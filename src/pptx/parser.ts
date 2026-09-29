/**
 * Minimal PPTX text/table parser.
 *
 * PPTX is an OOXML ZIP package. We follow presentation.xml relationship order
 * and emit slide-local IR blocks so pageNumber remains the slide locator.
 */

import JSZip from "jszip"
import { DOMParser } from "@xmldom/xmldom"
import type { DocumentMetadata, IRBlock, ParseOptions, ParseWarning } from "../types.js"
import { blocksToMarkdown } from "../table/builder.js"
import { KordocError } from "../utils.js"

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

function local(el: Element): string {
  return el.localName || el.tagName.replace(/^[^:]+:/, "")
}

function children(el: Element, name?: string): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]
    if (node.nodeType !== 1) continue
    const child = node as Element
    if (!name || local(child) === name) out.push(child)
  }
  return out
}

function descendants(el: Element, name: string): Element[] {
  const out: Element[] = []
  const walk = (node: Element) => {
    for (const child of children(node)) {
      if (local(child) === name) out.push(child)
      walk(child)
    }
  }
  walk(el)
  return out
}

function textOf(el: Element): string {
  return descendants(el, "t").map(t => t.textContent ?? "").join("").trim()
}

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, "text/xml") as unknown as Document
}

function relationshipMap(xml: string): Map<string, { type: string; target: string }> {
  const root = parseXml(xml).documentElement
  const map = new Map<string, { type: string; target: string }>()
  for (const rel of descendants(root, "Relationship")) {
    const id = rel.getAttribute("Id")
    const type = rel.getAttribute("Type")
    const target = rel.getAttribute("Target")
    if (id && type && target) map.set(id, { type, target })
  }
  return map
}

function resolvePart(base: string, target: string): string {
  const parts = base.split("/")
  parts.pop()
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") parts.pop()
    else parts.push(segment)
  }
  return parts.join("/")
}

function slideOrder(presentation: Document, rels: Map<string, { type: string; target: string }>): string[] {
  const list = descendants(presentation.documentElement, "sldIdLst")[0]
  if (!list) return []
  const out: string[] = []
  for (const id of children(list, "sldId")) {
    const relId = id.getAttribute("r:id") || id.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")
    const relation = relId ? rels.get(relId) : undefined
    if (relation?.target) out.push(resolvePart("ppt/presentation.xml", relation.target))
  }
  return out
}

function tableBlock(frame: Element, pageNumber: number): IRBlock | null {
  const table = descendants(frame, "tbl")[0]
  if (!table) return null
  const rows = children(table, "tr").map(row => children(row, "tc").map(cell => ({
    text: textOf(cell), colSpan: 1, rowSpan: 1,
  })))
  if (!rows.length) return null
  const cols = Math.max(...rows.map(row => row.length), 0)
  return { type: "table", pageNumber, table: {
    rows: rows.length, cols, cells: rows.map(row => Array.from({ length: cols }, (_, i) => row[i] ?? { text: "", colSpan: 1, rowSpan: 1 })),
    hasHeader: rows.length > 1,
  } }
}

function shapeBlock(shape: Element, pageNumber: number): IRBlock | null {
  const text = textOf(shape)
  if (!text) return null
  const placeholder = descendants(shape, "ph")[0]
  const type = placeholder?.getAttribute("type")
  if (type === "title" || type === "ctrTitle") return { type: "heading", level: 1, text, pageNumber }
  if (type === "subTitle") return { type: "heading", level: 2, text, pageNumber }
  return { type: "paragraph", text, pageNumber }
}

async function slideNotes(zip: JSZip, slidePath: string): Promise<string | undefined> {
  const relsPath = resolvePart(slidePath, `_rels/${slidePath.split("/").at(-1)}.rels`)
  const relsFile = zip.file(relsPath)
  if (!relsFile) return undefined
  const rels = relationshipMap(await relsFile.async("text"))
  const note = [...rels.values()].find(value => value.type.endsWith("/notesSlide"))
  if (!note) return undefined
  const notesPath = resolvePart(slidePath, note.target)
  const notesFile = zip.file(notesPath)
  if (!notesFile) return undefined
  const text = textOf(parseXml(await notesFile.async("text")).documentElement)
  return text || undefined
}

export async function parsePptxDocument(buffer: ArrayBuffer, _options?: ParseOptions): Promise<{
  markdown: string
  blocks: IRBlock[]
  metadata?: DocumentMetadata
  warnings: ParseWarning[]
}> {
  const zip = await JSZip.loadAsync(buffer)
  const presentationFile = zip.file("ppt/presentation.xml")
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels")
  if (!presentationFile || !relsFile) throw new KordocError("PPTX presentation parts are missing")
  const order = slideOrder(parseXml(await presentationFile.async("text")), relationshipMap(await relsFile.async("text")))
  const blocks: IRBlock[] = []
  const warnings: ParseWarning[] = []
  for (let index = 0; index < order.length; index++) {
    const slidePath = order[index]
    const file = zip.file(slidePath)
    if (!file) { warnings.push({ code: "PARTIAL_PARSE", message: `Missing slide part: ${slidePath}` }); continue }
    const root = parseXml(await file.async("text")).documentElement
    const tree = descendants(root, "spTree")[0]
    if (tree) {
      for (const shape of children(tree)) {
        const table = local(shape) === "graphicFrame" ? tableBlock(shape, index + 1) : null
        if (table) blocks.push(table)
        else if (local(shape) === "sp") {
          const block = shapeBlock(shape, index + 1)
          if (block) blocks.push(block)
        }
      }
    }
    const notes = await slideNotes(zip, slidePath)
    if (notes) blocks.push({ type: "paragraph", text: notes, pageNumber: index + 1 })
  }
  const titleFile = zip.file("docProps/core.xml")
  const title = titleFile ? textOf(parseXml(await titleFile.async("text")).documentElement) : ""
  return {
    markdown: blocksToMarkdown(blocks),
    blocks,
    metadata: { ...(title ? { title } : {}), pageCount: order.length },
    warnings,
  }
}
