import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { solveBoundaries, longestPathBoundaries, tableColumnBoundaries } from "../src/render/layout.js"

const cells = (rows: [number, number, number][][]) => rows.flat().map(([a, n, size]) => ({ a, b: a + n, size }))

describe("render: 행마다 칸 너비 합이 다른 표의 열 경계", () => {
  it("칸을 이은 가장 긴 길이 표 너비에 닿으면 그 경계 — 전파식은 먼저 나온 칸 너비를 쓴다", () => {
    // 첫 행은 합 250 으로 낡았고 둘째 행이 표 너비 300 을 채운다(통계표: 머리 행 합 40,992, 표 47,883)
    const c = cells([[[0, 2, 150], [2, 1, 100]], [[0, 1, 100], [1, 1, 100], [2, 1, 100]]])
    assert.deepEqual(solveBoundaries(c, 3, 300), [0, 100, 150, 300])
    assert.deepEqual(tableColumnBoundaries(c, 3, 300), [0, 100, 200, 300])
  })
  it("가장 긴 길이 옮긴 경계가 표 너비에 닿는 길 위에 없으면 전파식 그대로", () => {
    // 경계 3 을 250 칸이 350 으로 밀지만 거기서 끝까지는 30 — 끝 400 은 다른 길(200 + 200)이 정한다
    const c = cells([[[0, 2, 200], [2, 2, 200]], [[0, 1, 100], [1, 1, 100], [2, 1, 120], [3, 1, 30]], [[1, 2, 250], [3, 1, 30]]])
    const lp = longestPathBoundaries(c, 4)!
    assert.deepEqual(lp.x, [0, 100, 200, 350, 400])
    assert.deepEqual(lp.tight, [true, true, true, false, true])
    assert.deepEqual(tableColumnBoundaries(c, 4, 400), solveBoundaries(c, 4, 400))
  })
  it("칸 너비 합이 표 너비와 같은 행이 없으면 길 위에 있지 않은 경계도 가장 긴 길 값", () => {
    // 서식 표: 머리 행 합 47,096·몸통 행 45,593 — 표 너비 47,664 는 가장 긴 길(끝 47,663)에서 나왔다. 경계 3·9 는 길 위가 아니다
    const c = cells([
      [[0, 2, 7086], [2, 2, 8213], [4, 1, 7653], [5, 2, 7420], [7, 1, 7653], [8, 2, 9071]],
      [[2, 1, 2834], [3, 1, 4251], [5, 1, 2834], [6, 1, 4586], [8, 1, 2834], [9, 1, 5567]],
      [[0, 1, 7653], [1, 2, 2834], [3, 1, 4251], [4, 1, 7653], [5, 1, 2834], [6, 1, 4586], [7, 1, 7653], [8, 1, 2834], [9, 1, 5295]],
    ])
    assert.deepEqual(tableColumnBoundaries(c, 10, 47664), solveBoundaries(c, 10, 47664))
    assert.deepEqual(tableColumnBoundaries(c, 10, 47664, true), [0, 7653, 7653, 10487, 15866, 23519, 26353, 30939, 38592, 41426, 47663])
  })
  it("전체 폭 칸은 끝만 정하므로 가장 긴 길에서 뺀다 — 안쪽 칸만으로 표 너비에 못 닿으면 전파식", () => {
    const c = cells([[[0, 2, 200]], [[0, 1, 50], [1, 1, 120]]])
    assert.deepEqual(longestPathBoundaries(c, 2)!.x, [0, 50, 170])
    assert.deepEqual(tableColumnBoundaries(c, 2, 200), [0, 50, 200])
  })
})
