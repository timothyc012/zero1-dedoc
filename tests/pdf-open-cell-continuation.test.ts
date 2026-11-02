import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { CELL_EDGES, type Edges } from "../src/table/layout-frames.js"
import { FILLER_CELLS, recordCellLines } from "../src/pdf/table-meta.js"
import type { IRCell, IRTable } from "../src/types.js"

const upper: Edges = { t: true, b: false, l: true, r: true }
const lower: Edges = { t: false, b: true, l: true, r: true }
const cell = (text: string, colSpan = 1, rowSpan = 1): IRCell => ({ text, colSpan, rowSpan })
const table = (cells: IRCell[][]): IRTable => ({ rows: cells.length, cols: cells[0].length, cells, hasHeader: false })

/** 그림 영역의 가로 분할이 달라 행은 두 개지만, 이름표·설명은 쪽 경계만 열린 한 칸이다. */
function fixture(a: Edges | undefined = upper, b: Edges | undefined = lower) {
  const prev = table([[cell("분"), cell("앞 그림", 2), cell(""), cell("설명 첫 부분")]])
  const curr = table([[cell("류"), cell("뒤 그림 왼쪽"), cell("뒤 그림 오른쪽"), cell("설명 나머지")]])
  for (const c of [0, 3]) {
    if (a) CELL_EDGES.set(prev.cells[0][c], a)
    if (b) CELL_EDGES.set(curr.cells[0][c], b)
  }
  recordCellLines(prev.cells[0][0], [{ x: 7, y: 180, w: 12, h: 12, fontSize: 12 }])
  return { prev, curr, join: () => joinSplitParts(prev, [0, 25, 100, 150, 300], curr, [0, 25, 100, 150, 300], 0, 30)! }
}

describe("쪽 경계만 열린 셀의 세로 병합", () => {
  it("그림 행은 유지하고 열린 이름표·설명 셀만 잇는다", () => {
    const result = fixture().join()
    assert.equal(result.split, false)
    assert.equal(result.table.rows, 2)
    assert.equal(result.table.cells[0][0].text, "분\n류")
    assert.equal(result.table.cells[0][0].rowSpan, 2)
    assert.equal(result.table.cells[0][3].text, "설명 첫 부분\n설명 나머지")
    assert.equal(result.table.cells[0][3].rowSpan, 2)
    assert.equal(result.table.cells[0][1].colSpan, 2)
    assert.equal(result.table.cells[1][1].text, "뒤 그림 왼쪽")
    assert.equal(result.table.cells[1][2].text, "뒤 그림 오른쪽")
    assert.deepEqual(CELL_EDGES.get(result.table.cells[0][0]), { t: true, b: true, l: true, r: true })
  })

  it("글이 쪽 바닥에서 멀어도 다른 열과 함께 이어진 여러 행 이름표를 잇는다", () => {
    const prev = table([[cell("분", 1, 2), cell("첫 행"), cell("공통", 1, 2)], [cell(""), cell("둘째 행"), cell("")]])
    const curr = table([[cell("류", 1, 2), cell("셋째 행"), cell("")], [cell(""), cell("넷째 행"), cell("")]])
    CELL_EDGES.set(prev.cells[0][0], upper)
    CELL_EDGES.set(curr.cells[0][0], lower)
    for (const row of curr.cells) FILLER_CELLS.add(row[2])
    recordCellLines(prev.cells[0][0], [{ x: 7, y: 180, w: 12, h: 12, fontSize: 12 }])
    const result = joinSplitParts(prev, [0, 25, 150, 300], curr, [0, 25, 150, 300], 0, 30)!
    assert.equal(result.table.rows, 4)
    assert.equal(result.table.cells[0][0].text, "분\n류")
    assert.equal(result.table.cells[0][0].rowSpan, 4)
    assert.equal(result.table.cells[0][2].rowSpan, 4)
  })

  for (const [name, a, b] of [
    ["앞 조각 밑변이 닫힘", { ...upper, b: true }, lower],
    ["뒤 조각 윗변이 닫힘", upper, { ...lower, t: true }],
    ["바깥 윗변도 없는 무괘선 칸", { ...upper, t: false }, lower],
    ["바깥 밑변도 없는 무괘선 칸", upper, { ...lower, b: false }],
    ["앞 왼변 없음", { ...upper, l: false }, lower],
    ["뒤 오른변 없음", upper, { ...lower, r: false }],
  ] as const) it(`${name}이면 셀을 임의로 잇지 않는다`, () => {
    const result = fixture(a, b).join()
    assert.equal(result.table.cells[0][0].rowSpan, 1)
    assert.equal(result.table.cells[1][0].text, "류")
  })

  it("변 곁정보가 없는 셀은 기존 판정을 유지한다", () => {
    const { prev, curr, join } = fixture()
    for (const row of [...prev.cells, ...curr.cells]) for (const c of row) CELL_EDGES.delete(c)
    const result = join()
    assert.equal(result.table.cells[0][0].rowSpan, 1)
    assert.equal(result.table.cells[1][0].text, "류")
  })

  it("같은 열에서 원래 가로선 없이 구분한 제목·목록 칸을 쪽 경계에서 합치지 않는다", () => {
    const prev = table([
      [cell("위반행위"), cell("근거"), cell("금액")],
      [cell("가. 신고하지 않은 경우"), cell("제1조"), cell("")],
      [cell("1) 첫 위반\n2) 다음 위반"), cell(""), cell("100\n200")],
      [cell("나. 기록하지 않은 경우"), cell("제2조"), cell("")],
    ])
    const curr = table([[cell("1) 첫 위반\n2) 다음 위반"), cell(""), cell("100\n200")]])
    CELL_EDGES.set(prev.cells[0][0], { t: true, b: true, l: true, r: true })
    CELL_EDGES.set(prev.cells[1][0], upper)
    CELL_EDGES.set(prev.cells[2][0], lower)
    CELL_EDGES.set(prev.cells[3][0], upper)
    CELL_EDGES.set(curr.cells[0][0], lower)
    const result = joinSplitParts(prev, [0, 200, 250, 300], curr, [0, 200, 250, 300], 0, 30)!
    assert.equal(result.table.rows, 5)
    assert.equal(result.table.cells[3][0].rowSpan, 1)
    assert.equal(result.table.cells[4][0].text, "1) 첫 위반\n2) 다음 위반")
  })

  it("다른 내부 경계는 한쪽 셀의 변만 보여도 닫힌 것으로 본다", () => {
    const { prev, join } = fixture()
    const heading = [cell("구분"), cell("그림", 2), cell(""), cell("내용")]
    CELL_EDGES.set(heading[0], upper)
    prev.cells.unshift(heading)
    prev.rows++
    const result = join()
    assert.equal(result.table.cells[1][0].text, "분\n류")
    assert.equal(result.table.cells[1][0].rowSpan, 2)
  })
})
