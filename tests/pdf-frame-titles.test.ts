import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { recordFrameTitle } from "../src/pdf/frame-cell-blocks.js"
import { sanitizeBlockControlChars, splitSingleCellTables } from "../src/pdf/text-clean.js"
import { blocksToMarkdown } from "../src/table/builder.js"
import { CLIP_TABLES, FRAME_TITLE_BLOCKS, TABLE_COLXS } from "../src/pdf/table-meta.js"
import { CELL_EDGES } from "../src/table/layout-frames.js"
import type { IRBlock, IRTable } from "../src/types.js"
import type { NormItem } from "../src/pdf/text-line.js"

function fixture() {
  const table: IRTable = { rows: 1, cols: 3, hasHeader: false,
    cells: [["붙임 16", "", "교육기관 현황 및 이수증 발급"].map(text => ({ text, rowSpan: 1, colSpan: 1 }))] }
  CLIP_TABLES.add(table)
  TABLE_COLXS.set(table, [70, 114, 124, 400])
  for (const cell of table.cells[0]) CELL_EDGES.set(cell, { t: false, b: false, l: false, r: false })
  const source: NormItem[] = [
    { text: "붙임 16", x: 85, y: 570, w: 32, h: 10, fontSize: 10, fontName: "Bold", isHidden: false },
    { text: "교육기관 현황 및 이수증 발급", x: 133, y: 569, w: 177, h: 11, fontSize: 11, fontName: "Bold", isHidden: false },
  ]
  return { table, source }
}

describe("PDF decorative annex title frame", () => {
  it("unwraps only the confirmed one-line chip/spacer/title layout with source style and bbox", () => {
    const { table, source } = fixture()
    recordFrameTitle(table, source, 139)
    const original: IRBlock = { type: "table", table, pageNumber: 139 }
    const out = splitSingleCellTables([original])
    assert.deepEqual(out.map(b => [b.type, b.text]), [["paragraph", "붙임 16 교육기관 현황 및 이수증 발급"]])
    assert.deepEqual(out[0].bbox, { page: 139, x: 85, y: 569, width: 225, height: 11 })
    assert.deepEqual(out[0].style, { fontSize: 11, fontName: "Bold" })
    assert.equal(original.type, "table", "source IR remains available to keep layout")
  })

  for (const [raw, clean] of [["안내\u0000\u0001 내용", "안내 내용"], ["안내\uF000 내용", "안내 내용"],
    ["안내 ᄋ ᆞ 내용", "안내 ㅇ ㆍ 내용"]]) {
    it(`reads the sanitized current title cells instead of stale metadata: ${JSON.stringify(raw)}`, () => {
      const {table, source} = fixture()
      table.cells[0][2].text = source[1].text = raw
      recordFrameTitle(table, source, 139)
      const original: IRBlock = {type: "table", table, pageNumber: 139}
      sanitizeBlockControlChars([original])
      assert.equal(table.cells[0][2].text, clean)
      const out = splitSingleCellTables([original])
      assert.equal(out[0].text, `붙임 16 ${clean}`)
      assert.equal(blocksToMarkdown(out), `붙임 16 ${clean}`)
      assert.deepEqual(out[0].bbox, {page: 139, x: 85, y: 569, width: 225, height: 11})
      assert.equal(original.table!.cells[0][2].text, clean, "keep source and flattened IR share sanitized text")
    })
  }

  for (const variant of ["data", "no-spacer", "ruled", "multi-line", "other-label", "other-face", "non-clip", "wide-gap"]) {
    it(`retains a ${variant} one-row table`, () => {
      const { table, source } = fixture()
      if (variant === "data") table.cells[0][0].text = source[0].text = "운행시간"
      if (variant === "no-spacer") table.cells[0][1].text = "데이터"
      if (variant === "ruled") CELL_EDGES.set(table.cells[0][0], { t: true, b: true, l: true, r: true })
      if (variant === "multi-line") source.push({ ...source[1], y: 550, text: "둘째 줄" })
      if (variant === "other-label") table.cells[0][0].text = source[0].text = "Table 16"
      if (variant === "other-face") source[1].fontName = "Body"
      if (variant === "non-clip") CLIP_TABLES.delete(table)
      if (variant === "wide-gap") TABLE_COLXS.set(table, [70, 114, 184, 400])
      recordFrameTitle(table, source, 1)
      assert.equal(FRAME_TITLE_BLOCKS.has(table), false)
      const block: IRBlock = { type: "table", table }
      assert.equal(splitSingleCellTables([block])[0], block)
    })
  }
})
