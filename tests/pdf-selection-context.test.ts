import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { removeHeaderFooterBlocks } from "../src/pdf/block-detect.js"
import { selectionContextPages } from "../src/pdf/selection-context.js"
import type { IRBlock, ParseWarning } from "../src/types.js"
import { parsePdfDocument } from "../src/pdf/parser.js"

function pdf(pages: string[]): ArrayBuffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
  const kids: string[] = []
  for (const text of pages) {
    const id = objects.length + 1
    kids.push(id + " 0 R")
    objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents " + (id + 1) + " 0 R >>")
    objects.push("<< /Length " + text.length + " >>\nstream\n" + text + "\nendstream")
  }
  objects[1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pages.length + " >>"
  let data = "%PDF-1.4\n"
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(data.length)
    data += (i + 1) + " 0 obj\n" + objects[i] + "\nendobj\n"
  }
  const start = data.length
  data += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n"
  for (const offset of offsets) data += String(offset).padStart(10, "0") + " 00000 n \n"
  data += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + start + "\n%%EOF"
  return new TextEncoder().encode(data).buffer
}
const line = (text: string, y: number, size = 10, x = 72) => "BT /F1 " + size + " Tf " + x + " " + y + " Td (" + text + ") Tj ET"
const fixture = () => pdf(Array.from({ length: 7 }, (_, i) => [
  line(i % 2 ? "Even handbook" : "Odd handbook", 750, 8),
  line("Chapter " + (i + 1), 620, 14),
  line("Actual body content on page " + (i + 1) + ".", 580),
  line("Body content continues without losing a word.", 560),
  line((i + 1) + " |", 35, 8),
].join("\n")))

describe("PDF selected-page running header context", () => {
  it("removes repeated margins from a single selected page", async () => {
    const result = await parsePdfDocument(fixture(), { pages: "3", ocr: false, images: false })
    assert.doesNotMatch(result.markdown, /Odd handbook/)
    assert.ok(result.blocks.every(b => b.text !== "3 |"))
    assert.match(result.markdown, /Actual body content on page 3/)
    assert.ok(result.blocks.every(b => b.pageNumber === 3))
  })
  it("uses the nearest pages at the document edge", async () => {
    const result = await parsePdfDocument(fixture(), { pages: "1", ocr: false, images: false })
    assert.doesNotMatch(result.markdown, /Odd handbook/)
    assert.ok(result.blocks.every(b => b.text !== "1 |"))
    assert.match(result.markdown, /Chapter 1/)
  })
  it("retains margins when explicitly disabled", async () => {
    const result = await parsePdfDocument(fixture(), { pages: "3", removeHeaderFooter: false, ocr: false, images: false })
    assert.match(result.markdown, /Odd handbook/)
    assert.ok(result.blocks.some(b => b.text === "3 |"))
  })
  it("does not report context pages as parsed progress or page results", async () => {
    const progress: number[] = []
    const result = await parsePdfDocument(fixture(), { pages: "2,3", ocr: false, images: false, onProgress: e => progress.push(e) })
    assert.deepEqual(progress, [1, 2])
    assert.ok(result.blocks.every(b => b.pageNumber === 2 || b.pageNumber === 3))
    assert.equal(result.metadata.pageCount, 7)
    assert.doesNotMatch(result.markdown, /Even handbook|Odd handbook/)
    assert.ok(result.blocks.every(b => b.text !== "2 |" && b.text !== "3 |"))
  })
  it("keeps a unique margin title without repetition proof", async () => {
    const result = await parsePdfDocument(pdf([line("Unique title", 750, 14), line("Other title", 750, 14), line("Third title", 750, 14)]), { pages: "2", ocr: false, images: false })
    assert.match(result.markdown, /Other title/)
  })
})

const margin = (text: string, page: number, x = 72): IRBlock => ({ type: "paragraph", text, pageNumber: page,
  bbox: { page, x, y: 750, width: 70, height: 10 }, style: { fontSize: 10, fontName: "Body" } })

describe("bounded PDF margin context", () => {
  it("reads at most four pages on either side and excludes selected pages", () => {
    assert.deepEqual(selectionContextPages(new Set([10]), 1000), [6, 7, 8, 9, 11, 12, 13, 14])
    assert.deepEqual(selectionContextPages(new Set([1]), 3), [2, 3])
    assert.deepEqual(selectionContextPages(new Set([1, 2, 3]), 3), [])
  })
  it("removes only selected margin indices, leaving context immutable", () => {
    const blocks = [margin("Guide", 3)]
    const context = [margin("Guide", 2), margin("Guide", 4)]
    const before = JSON.stringify(context)
    const warnings: ParseWarning[] = []
    assert.deepEqual(removeHeaderFooterBlocks(blocks, new Map([[2, 792], [3, 792], [4, 792]]), warnings, undefined, false, context), [0])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0].message, /^1개/)
    assert.equal(JSON.stringify(context), before)
  })
  it("retains a repeated attachment label sharing its line with the actual title", () => {
    const blocks = [margin("Appendix 3", 3), margin("Actual attachment title", 3, 150)]
    const context = [margin("Appendix 2", 2), margin("Appendix 4", 4)]
    assert.deepEqual(removeHeaderFooterBlocks(blocks, new Map([[2, 792], [3, 792], [4, 792]]), [], undefined, false, context), [])
  })
  it("keeps repeated source notes immediately below a table", () => {
    const note = (page: number): IRBlock => ({ ...margin("출처: Example", page), bbox: { page, x: 72, y: 35, width: 100, height: 10 } })
    const blocks: IRBlock[] = [{ type: "table", pageNumber: 3, bbox: { page: 3, x: 72, y: 50, width: 400, height: 100 } }, note(3)]
    assert.deepEqual(removeHeaderFooterBlocks(blocks, new Map([[2, 792], [3, 792], [4, 792]]), [], undefined, false, [note(2), note(4)]), [])
  })
})
