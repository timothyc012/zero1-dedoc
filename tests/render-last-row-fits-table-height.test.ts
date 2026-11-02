import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { solveRowHeights } from "../src/render/layout.js"

// 칸 16425 세 행 — 표 높이(sz) 48016 은 행 합 49275 보다 1259 작다
const rows = (lastContent: number) => solveRowHeights([0, 1, 2].map(r => ({ rowAddr: r, rowSpan: 1, height: 16425, contentH: r === 2 ? lastContent : 15000 })), 3, 48016, true)

describe("render: 칸 저장 높이 합이 표 높이를 넘는 표의 마지막 행", () => {
  it("마지막 행 칸 내용이 들면 표 높이에 맞게 줄인다", () => {
    assert.deepEqual(rows(14885), [16425, 16425, 15166])
  })
  it("줄인 행에 내용이 안 들면(쪽을 넘는 표의 첫 쪽 sz) 그대로", () => {
    assert.deepEqual(rows(15500), [16425, 16425, 16425])
  })
  it("마지막 행까지 내려오는 여러 행 칸은 그 칸 내용이 줄인 행 합에 들면 줄인다", () => {
    // 세 행(2000씩)에 걸친 칸(내용 1100) + 행마다 한 행 칸 — 표 높이 5600 은 행 합 6000 보다 400 작다
    const cells = (spanContent: number) => [{ rowAddr: 0, rowSpan: 3, height: 6000, contentH: spanContent }, ...[0, 1, 2].map(r => ({ rowAddr: r, rowSpan: 1, height: 2000, contentH: 1300 }))]
    assert.deepEqual(solveRowHeights(cells(1100), 3, 5600, true), [2000, 2000, 1600])
    assert.deepEqual(solveRowHeights(cells(5800), 3, 5600, true), [2000, 2000, 2000])
  })
})
