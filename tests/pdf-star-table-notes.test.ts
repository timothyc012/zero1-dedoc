import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { removeHeaderFooterBlocks } from "../src/pdf/block-detect.js"
import type { IRBlock } from "../src/types.js"
const heights = new Map([[14, 841], [15, 841], [16, 841]])
function repeated({ gap = 6.646, x = 57, width = 310, text = "* 행정구역 개편 이전 실적 합계 집계", table = true } = {}): IRBlock[] {
  return [14, 15, 16].flatMap(page => [
    ...(table ? [{ type: "table" as const, pageNumber: page, bbox: { page, x: 58.049, y: 104.646, width: 480.222, height: 606.776 } }] : []),
    { type: "paragraph" as const, text, pageNumber: page, bbox: { page, x, y: 104.646 - gap - 12, width, height: 12 } },
  ])
}
describe("반복되는 표 아래 별표 주석", () => {
  it("원본처럼 표 바로 아래에서 왼쪽으로 1.049pt 나온 주석을 보존한다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated(), heights, []), [])
  })
  it("한 줄 높이보다 멀리 떨어진 별표 footer는 제거한다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated({ gap: 20 }), heights, []), [1, 3, 5])
  })
  it("표 왼쪽의 허용 오차를 넘긴 반복 글은 제거한다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated({ x: 55 }), heights, []), [1, 3, 5])
  })
  it("표 오른쪽 너비를 벗어난 반복 글도 제거한다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated({ width: 500 }), heights, []), [1, 3, 5])
  })
  it("같은 쪽에 본표가 없으면 별표만으로 보호하지 않는다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated({ table: false }), heights, []), [0, 1, 2])
  })
  it("주석 표지가 없는 footer는 표 가까이 있어도 제거한다", () => {
    assert.deepEqual(removeHeaderFooterBlocks(repeated({ text: "통계 보고서" }), heights, []), [1, 3, 5])
  })
})
