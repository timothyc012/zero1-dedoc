import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mergeOcrImageRegions } from "../src/pdf/ocr-region-merge.js"
import type { IRBlock, IRCell } from "../src/types.js"

const region = { x1: 100, y1: 100, x2: 500, y2: 500 }
const cell = (text: string, colSpan = 1): IRCell => ({ text, colSpan, rowSpan: 1 })
const table = (rows: IRCell[][]): IRBlock => ({
  type: "table", pageNumber: 1, bbox: { page: 1, x: 120, y: 120, width: 360, height: 360 },
  table: { rows: rows.length, cols: 3, cells: rows, hasHeader: true },
})
const lone = (text: string) => [cell(text, 3), cell(""), cell("")]

describe("그림 영역 OCR 표 — 행 대부분이 전폭 한 칸이면 표가 아니다", () => {
  it("격자 도로 지도의 길 이름은 행마다 문단으로 (ODL 098)", () => {
    const blocks: IRBlock[] = []
    const map = table([[cell("NTS"), cell("THE AVENUES"), cell("Chevron")], lone("Utah State"),
      [cell("AIRPARK"), cell(""), cell("Capitol Building")], lone("Maverik"), lone("Sinclair"), lone("Chevron Salt Lake City")])
    mergeOcrImageRegions(blocks, 1, [region], [map])
    assert.ok(blocks.every(b => b.type === "paragraph"), JSON.stringify(blocks.map(b => b.type)))
    assert.ok(blocks.some(b => b.text === "Utah State"))
  })
  it("칸이 고루 찬 그림 속 표는 표로 받는다", () => {
    const blocks: IRBlock[] = []
    mergeOcrImageRegions(blocks, 1, [region], [table([[cell("Temperature"), cell("Viscosity"), cell("Density")],
      [cell("0"), cell("1.793"), cell("999.8")], [cell("5"), cell("1.519"), cell("1000.0")], lone("Source: lab")])])
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, "table")
  })
})
