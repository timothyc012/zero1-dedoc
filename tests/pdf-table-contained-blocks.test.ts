import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mergeCrossPageTables } from "../src/pdf/table-parts.js"
import { CLIP_TABLES, ROW_RULES, TABLE_COLXS } from "../src/pdf/table-meta.js"
import type { IRBlock, IRTable } from "../src/types.js"

function blocks(variant = "inside"): IRBlock[] {
  const table = (text: string): IRTable => {
    const t: IRTable = { rows: 1, cols: 2, hasHeader: false,
      cells: [[{ text, rowSpan: 1, colSpan: 1 }, { text: "", rowSpan: 1, colSpan: 1 }]] }
    CLIP_TABLES.add(t)
    TABLE_COLXS.set(t, [50, 150, 450])
    ROW_RULES.set(t, { top: false, bottom: false, innerRuled: 0, innerOpen: 0 })
    return t
  }
  const label: IRBlock = { type: "paragraph", text: "이름표", pageNumber: 2,
    bbox: { page: 2, x: 60, y: 700, width: 25, height: 10 } }
  if (variant === "above") label.bbox!.y = 800
  if (variant === "overlap") { label.bbox!.x = 440; label.bbox!.width = 25 }
  if (variant === "other-page") { label.pageNumber = 1; label.bbox!.page = 1; label.bbox!.y = 800 }
  if (variant === "no-bbox") delete label.bbox
  return [
    { type: "table", table: table("앞 조각"), pageNumber: 1, bbox: { page: 1, x: 50, y: 40, width: 400, height: 700 } },
    label,
    { type: "table", table: table("뒤 조각"), pageNumber: 2, bbox: { page: 2, x: 50, y: 400, width: 400, height: 380 } },
  ]
}

describe("뒤쪽 표 안에 놓였지만 따로 추출된 글", () => {
  it("같은 쪽 표 안의 이름표는 표 연결을 막지 않고 보존된다", () => {
    const b = blocks()
    const label = b[1]
    mergeCrossPageTables(b, new Map([[1, 842], [2, 842]]))
    assert.equal(b.filter(v => v.type === "table").length, 1)
    assert.ok(b.includes(label))
    assert.equal(label.text, "이름표")
  })
  for (const variant of ["above", "overlap", "other-page", "no-bbox"]) {
    it(variant + "의 글은 두 표 사이의 본문으로 유지한다", () => {
      const b = blocks(variant)
      mergeCrossPageTables(b, new Map([[1, 842], [2, 842]]))
      assert.equal(b.filter(v => v.type === "table").length, 2)
      assert.equal(b[1].text, "이름표")
    })
  }
})
