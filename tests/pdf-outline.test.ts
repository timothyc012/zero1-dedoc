import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { collectPdfOutline } from "../src/pdf/outline.js"
import { sanitizeBlockControlChars, splitSingleCellTables } from "../src/pdf/text-clean.js"
import type { IRBlock } from "../src/types.js"

const heading = (text: string, level = 2): IRBlock => ({ type: "heading", text, level, pageNumber: 3 })
const frame = (blocks: IRBlock[]): IRBlock => ({ type: "table", pageNumber: 3,
  table: { rows: 1, cols: 1, hasHeader: false, cells: [[{ text: blocks.map(b => b.text ?? "").join("\n"), rowSpan: 1, colSpan: 1, blocks }]] } })

describe("PDF outline from final reading order", () => {
  it("includes headings exposed from nested title frames in both layout modes", () => {
    const blocks = [heading("Start", 1), frame([frame([heading("Title")])]), heading("End")]
    const expected = [{ level: 1, text: "Start", pageNumber: 3 }, { level: 2, text: "Title", pageNumber: 3 }, { level: 2, text: "End", pageNumber: 3 }]
    assert.deepEqual(collectPdfOutline(blocks), expected)
    assert.deepEqual(collectPdfOutline(splitSingleCellTables(blocks)), expected)
  })
  it("uses sanitized title text, never a duplicate flattened cell label", () => {
    const blocks = [frame([heading("Title\u0000")])]
    sanitizeBlockControlChars(blocks)
    assert.deepEqual(collectPdfOutline(splitSingleCellTables(blocks)), [{ level: 2, text: "Title", pageNumber: 3 }])
  })
  it("retains repeated titles on distinct pages and ignores paragraphs", () => {
    assert.deepEqual(collectPdfOutline([heading("Title"), { ...heading("Title"), pageNumber: 4 }, { type: "paragraph", text: "Body" }]),
      [{ level: 2, text: "Title", pageNumber: 3 }, { level: 2, text: "Title", pageNumber: 4 }])
  })
})
