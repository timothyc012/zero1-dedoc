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
import { KordocError, precheckZipSize, unzipLimitBytes } from "../utils.js"
import { parsePageRange } from "../page-range.js"

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
const MAX_PPTX_UNCOMPRESSED = unzipLimitBytes(100 * 1024 * 1024)
const MAX_SLIDES = 1000

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
  const paragraphs = descendants(el, "p")
  if (paragraphs.length) return paragraphs
    .map(paragraph => descendants(paragraph, "t").map(t => t.textContent ?? "").join("").trim())
    .filter(Boolean).join("\n")
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
  const sourceRows = children(table, "tr").map(row => children(row, "tc"))
  if (!sourceRows.length) return null
  const prop = (cell: Element, name: string): string | null =>
    children(cell, "tcPr")[0]?.getAttribute(name) ?? cell.getAttribute(name)
  const span = (cell: Element, name: string): number => {
    const raw = prop(cell, name)
    const value = raw ? Number.parseInt(raw, 10) : 1
    return Number.isFinite(value) && value > 0 ? value : 1
  }
  const continuation = (cell: Element): boolean =>
    prop(cell, "hMerge") === "1" || prop(cell, "hMerge") === "true" ||
    prop(cell, "vMerge") === "1" || prop(cell, "vMerge") === "true"
  const grid = children(table, "tblGrid")[0]
  const physicalCols = grid ? children(grid, "gridCol").length : 0
  if (physicalCols > 0 || sourceRows.some(row => row.some(continuation))) {
    // DrawingML records one <a:tc> per physical grid column. hMerge/vMerge
    // cells are continuation markers, not new cells following the span anchor.
    const cols = physicalCols || Math.max(...sourceRows.map(row => row.length))
    const empty = () => ({ text: "", colSpan: 1, rowSpan: 1 })
    const cells = Array.from({ length: sourceRows.length }, () => Array.from({ length: cols }, empty))
    for (let r = 0; r < sourceRows.length; r++) for (let c = 0; c < Math.min(sourceRows[r].length, cols); c++) {
      const source = sourceRows[r][c]
      if (continuation(source)) continue
      const colSpan = Math.min(span(source, "gridSpan"), cols - c)
      const rowSpan = Math.min(span(source, "rowSpan"), sourceRows.length - r)
      cells[r][c] = { text: textOf(source), colSpan, rowSpan }
    }
    return { type: "table", pageNumber, table: { rows: cells.length, cols, cells, hasHeader: cells.length > 1 } }
  }
  const placed: Array<Array<{ text: string; colSpan: number; rowSpan: number }>> = []
  let maxCols = 0
  for (let r = 0; r < sourceRows.length; r++) {
    const row = placed[r] ?? (placed[r] = [])
    let cursor = 0
    for (const cell of sourceRows[r]) {
      while (row[cursor]) cursor++
      const colSpan = span(cell, "gridSpan")
      const rowSpan = span(cell, "rowSpan")
      const value = { text: textOf(cell), colSpan, rowSpan }
      for (let dr = 0; dr < rowSpan; dr++) {
        const target = placed[r + dr] ?? (placed[r + dr] = [])
        for (let dc = 0; dc < colSpan; dc++) target[cursor + dc] = dr === 0 && dc === 0 ? value : { text: "", colSpan: 1, rowSpan: 1 }
      }
      cursor += colSpan
      maxCols = Math.max(maxCols, cursor)
    }
  }
  const cells = placed.map(row => Array.from({ length: maxCols }, (_, i) => row[i] ?? { text: "", colSpan: 1, rowSpan: 1 }))
  return { type: "table", pageNumber, table: {
    rows: cells.length, cols: maxCols, cells,
    hasHeader: cells.length > 1,
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
  const root = parseXml(await notesFile.async("text")).documentElement
  const tree = descendants(root, "spTree")[0]
  const text = tree ? children(tree, "sp")
    .filter(shape => !["sldNum", "dt", "hdr", "ftr"].includes(descendants(shape, "ph")[0]?.getAttribute("type") ?? ""))
    .map(textOf).filter(Boolean).join("\n") : ""
  return text || undefined
}

type Point = { x: number; y: number }
type PointTransform = (point: Point) => Point

function directTransform(shape: Element): Element | undefined {
  const kind = local(shape)
  const parent = kind === "grpSp" ? children(shape, "grpSpPr")[0]
    : kind === "graphicFrame" ? shape : children(shape, "spPr")[0]
  return parent ? children(parent, "xfrm")[0] : undefined
}

function visualCenter(shape: Element): Point | null {
  const transform = directTransform(shape)
  const off = transform ? children(transform, "off")[0] : undefined
  const ext = transform ? children(transform, "ext")[0] : undefined
  if (!off || !ext) return null
  const x = Number(off.getAttribute("x")), y = Number(off.getAttribute("y"))
  const width = Number(ext.getAttribute("cx")), height = Number(ext.getAttribute("cy"))
  return [x, y, width, height].every(Number.isFinite) ? { x: x + width / 2, y: y + height / 2 } : null
}

function groupToParent(group: Element): PointTransform {
  const transform = directTransform(group)
  const off = transform ? children(transform, "off")[0] : undefined
  const ext = transform ? children(transform, "ext")[0] : undefined
  const childOff = transform ? children(transform, "chOff")[0] : undefined
  const childExt = transform ? children(transform, "chExt")[0] : undefined
  if (!transform || !off || !ext || !childOff || !childExt) return point => point
  const ox = Number(off.getAttribute("x")), oy = Number(off.getAttribute("y"))
  const width = Number(ext.getAttribute("cx")), height = Number(ext.getAttribute("cy"))
  const cx = Number(childOff.getAttribute("x")), cy = Number(childOff.getAttribute("y"))
  const cw = Number(childExt.getAttribute("cx")), ch = Number(childExt.getAttribute("cy"))
  const degrees = Number(transform.getAttribute("rot") ?? 0) / 60000
  if (![ox, oy, width, height, cx, cy, cw, ch, degrees].every(Number.isFinite) || cw <= 0 || ch <= 0) return point => point
  const angle = degrees * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  return point => {
    let x = ox + (point.x - cx) * width / cw
    let y = oy + (point.y - cy) * height / ch
    if (["1", "true"].includes(transform.getAttribute("flipH") ?? "")) x = 2 * ox + width - x
    if (["1", "true"].includes(transform.getAttribute("flipV") ?? "")) y = 2 * oy + height - y
    const dx = x - (ox + width / 2), dy = y - (oy + height / 2)
    return { x: ox + width / 2 + dx * cos - dy * sin, y: oy + height / 2 + dx * sin + dy * cos }
  }
}

function groupChildrenInVisualOrder(group: Element, toSlide: PointTransform): Element[] {
  const visible = children(group).filter(child => ["sp", "graphicFrame", "grpSp", "pic", "cxnSp"].includes(local(child)))
  const positioned = visible.map((shape, index) => ({ shape, index, point: visualCenter(shape) }))
  if (positioned.some(item => !item.point)) return visible // preserve source order when geometry is incomplete
  return positioned.sort((a, b) => {
    const pa = toSlide(a.point!), pb = toSlide(b.point!)
    const rowA = Math.floor(pa.y / 50000), rowB = Math.floor(pb.y / 50000)
    return rowA - rowB || pa.x - pb.x || a.index - b.index
  }).map(item => item.shape)
}

function slideShapeBlocks(root: Element, pageNumber: number, warnings: ParseWarning[], toSlide: PointTransform = point => point): IRBlock[] {
  const blocks: IRBlock[] = []
  const shapes = local(root) === "grpSp" ? groupChildrenInVisualOrder(root, toSlide) : children(root)
  for (const shape of shapes) {
    const kind = local(shape)
    if (kind === "sp") {
      const block = shapeBlock(shape, pageNumber)
      if (block) blocks.push(block)
    } else if (kind === "graphicFrame") {
      const table = tableBlock(shape, pageNumber)
      if (table) blocks.push(table)
      else warnings.push({ page: pageNumber, code: "UNSUPPORTED_ELEMENT", message: "PPTX graphic frame is not a table (chart/SmartArt data was not extracted)" })
    } else if (kind === "grpSp") {
      const fromGroup = groupToParent(shape)
      blocks.push(...slideShapeBlocks(shape, pageNumber, warnings, point => toSlide(fromGroup(point))))
    } else if (kind === "pic") {
      const name = descendants(shape, "cNvPr")[0]?.getAttribute("descr") || descendants(shape, "cNvPr")[0]?.getAttribute("name") || "image"
      warnings.push({ page: pageNumber, code: "UNSUPPORTED_ELEMENT", message: `PPTX image content was not OCR-parsed: ${name}` })
    } else if (kind === "cxnSp") {
      warnings.push({ page: pageNumber, code: "UNSUPPORTED_ELEMENT", message: "PPTX connector shape has no text payload" })
    }
  }
  return blocks
}

export async function parsePptxDocument(buffer: ArrayBuffer, options?: ParseOptions): Promise<{
  markdown: string
  blocks: IRBlock[]
  metadata?: DocumentMetadata
  warnings: ParseWarning[]
}> {
  precheckZipSize(buffer, MAX_PPTX_UNCOMPRESSED)
  const zip = await JSZip.loadAsync(buffer)
  const presentationFile = zip.file("ppt/presentation.xml")
  const relsFile = zip.file("ppt/_rels/presentation.xml.rels")
  if (!presentationFile || !relsFile) throw new KordocError("PPTX presentation parts are missing")
  const order = slideOrder(parseXml(await presentationFile.async("text")), relationshipMap(await relsFile.async("text")))
  if (order.length > MAX_SLIDES) throw new KordocError(`PPTX slide count exceeds ${MAX_SLIDES}`)
  const pageFilter = options?.pages ? parsePageRange(options.pages, order.length) : null
  const blocks: IRBlock[] = []
  const warnings: ParseWarning[] = []
  for (let index = 0; index < order.length; index++) {
    if (pageFilter && !pageFilter.has(index + 1)) continue
    const slidePath = order[index]
    const file = zip.file(slidePath)
    if (!file) { warnings.push({ code: "PARTIAL_PARSE", message: `Missing slide part: ${slidePath}` }); continue }
    const root = parseXml(await file.async("text")).documentElement
    const tree = descendants(root, "spTree")[0]
    if (tree) blocks.push(...slideShapeBlocks(tree, index + 1, warnings))
    const notes = await slideNotes(zip, slidePath)
    if (notes) blocks.push({ type: "paragraph", text: notes, pageNumber: index + 1 })
  }
  const titleFile = zip.file("docProps/core.xml")
  const title = titleFile
    ? descendants(parseXml(await titleFile.async("text")).documentElement, "title")[0]?.textContent?.trim() ?? ""
    : ""
  return {
    markdown: blocksToMarkdown(blocks),
    blocks,
    metadata: { ...(title ? { title } : {}), pageCount: order.length },
    warnings,
  }
}
