import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock, IRCell, IRTable } from "../src/types.js"
import { joinSplitParts } from "../src/pdf/table-parts.js"
import { markContinuedText, markJoinedPages, splitPageTables } from "../src/pdf/table-pages.js"
import { partialAlignedLabelCells } from "../src/pdf/split-row-pattern.js"
import { CELL_LINES, FILLER_CELLS, ROW_RULES } from "../src/pdf/table-meta.js"
import { CELL_EDGES, CELL_PAGES } from "../src/table/layout-frames.js"

const xs = [0, 50, 100, 150, 350, 400]
const keys = "가:\n나:\n다:"
function cell(text = "", ys: number[] = [], c = 0, rowSpan = 1): IRCell {
  const out = { text, rowSpan, colSpan: 1 }
  CELL_EDGES.set(out, { t: true, b: true, l: true, r: true })
  if (ys.length) CELL_LINES.set(out, ys.map(y => ({ y, l: xs[c] + 10, r: xs[c] + 35, h: 10 })))
  return out
}
function table(cells: IRCell[][]): IRTable {
  const out = { rows: cells.length, cols: 5, cells, hasHeader: false }
  ROW_RULES.set(out, { top: true, bottom: true, innerRuled: cells.length - 1, innerOpen: 0 })
  return out
}
function fixture() {
  const peer = (name: string) => [cell(), cell(name, [90], 1), cell(keys, [100, 80, 60], 2), cell("첫값\n둘째값\n셋째값", [100, 80, 60], 3), cell()]
  const upper = [cell(), cell("위", [50], 1), cell("가:", [60], 2), cell("상단 값\n계속되는"), cell()]
  CELL_LINES.set(upper[1], [{ y: 50, l: 70, r: 80, h: 10 }])
  CELL_LINES.set(upper[3], [{ y: 60, l: 155, r: 200, h: 10 }, { y: 50, l: 155, r: 345, h: 10 }])
  const lower = [cell(), cell("아래", [750], 1), cell("나:\n다:", [750, 730], 2), cell("내용\n하단 값\n마지막 값"), cell()]
  CELL_LINES.set(lower[1], [{ y: 750, l: 65, r: 85, h: 10 }])
  CELL_LINES.set(lower[3], [{ y: 770, l: 155, r: 200, h: 10 }, { y: 750, l: 155, r: 220, h: 10 }, { y: 730, l: 155, r: 210, h: 10 }])
  FILLER_CELLS.add(lower[0]); FILLER_CELLS.add(lower[4])
  const shared = peer("별도 항목1")
  shared[2].rowSpan = shared[3].rowSpan = 2
  const prev = table([peer("완성 항목1"), peer("완성 항목2"), upper])
  const curr = table([lower, shared, [cell(), cell("별도 항목2", [70], 1), cell(), cell(), cell()]])
  return { prev, curr }
}
const block = (table: IRTable, pageNumber: number): IRBlock => ({ type: "table", table, pageNumber })
function candidate(f: ReturnType<typeof fixture>) {
  const t = table([...f.prev.cells, ...f.curr.cells])
  t.cells[2][0].rowSpan = t.cells[2][4].rowSpan = 2
  type Owner = { r: number; c: number; rs: number; cs: number }
  const owner: (Owner | null)[][] = Array.from({ length: t.rows }, () => Array(t.cols).fill(null))
  for (let r = 0; r < t.rows; r++) for (let c = 0; c < t.cols; c++) {
    if (owner[r][c]) continue
    const x = t.cells[r][c], a = { r, c, rs: x.rowSpan, cs: x.colSpan }
    for (let dr = 0; dr < a.rs; dr++) for (let dc = 0; dc < a.cs; dc++) if (owner[r + dr] && c + dc < t.cols) owner[r + dr][c + dc] = a
  }
  return partialAlignedLabelCells(t, owner, 3)
}

describe("독립 문맥행 옆에서 쪽을 넘는 라벨·값 셀", () => {
  it("문맥 두 행을 보존하고 오른쪽 두 셀만 이어 세로 병합한다", () => {
    const { prev, curr } = fixture()
    const joined = joinSplitParts(prev, xs, curr, xs, 0, 0)!
    assert.equal(joined.split, false)
    assert.equal(joined.table.rows, 6)
    assert.equal(joined.table.cells[2][1].text, "위")
    assert.equal(joined.table.cells[3][1].text, "아래")
    assert.equal(joined.table.cells[2][1].rowSpan, 1)
    assert.equal(joined.table.cells[3][1].rowSpan, 1)
    assert.equal(joined.table.cells[2][2].text, keys)
    assert.equal(joined.table.cells[2][2].rowSpan, 2)
    assert.equal(joined.table.cells[2][3].text, "상단 값\n계속되는\n내용\n하단 값\n마지막 값")
    assert.equal(joined.table.cells[2][3].rowSpan, 2)
    assert.deepEqual(CELL_LINES.get(joined.table.cells[2][3]), CELL_LINES.get(prev.cells[2][3]))
  })
  it("쪽별 출력에서도 뒤 쪽 문맥과 이어진 셀의 꼬리가 같은 행에 놓인다", () => {
    const { prev, curr } = fixture()
    const joined = joinSplitParts(prev, xs, curr, xs, 0, 0)!.table
    markJoinedPages(joined, block(prev, 8), block(curr, 9))
    const pages = splitPageTables([block(joined, 8)])
    assert.deepEqual(pages.map(p => [p.pageNumber, p.table!.rows]), [[8, 3], [9, 3]])
    assert.equal(pages[0].table!.cells[2][2].text, "가:")
    assert.equal(pages[0].table!.cells[2][3].text, "상단 값\n계속되는")
    assert.equal(pages[1].table!.cells[0][1].text, "아래")
    assert.equal(pages[1].table!.cells[0][2].text, "나:\n다:")
    assert.equal(pages[1].table!.cells[0][3].text, "내용\n하단 값\n마지막 값")
    assert.equal(joined.rows, 6)
  })
  it("세 쪽을 이어도 앞선 셀의 쪽별 꼬리와 독립 행을 보존한다", () => {
    const { prev, curr } = fixture()
    const first = joinSplitParts(prev, xs, curr, xs, 0, 0)!.table
    markJoinedPages(first, block(prev, 8), block(curr, 9))
    const third = table([[cell(), cell("끝"), cell("새 목록"), cell("다음 값"), cell()]])
    const full = joinSplitParts(first, xs, third, xs, 0, 0)!.table
    markJoinedPages(full, block(first, 8), block(third, 10))
    const pages = splitPageTables([block(full, 8)])
    assert.deepEqual(pages.map(p => [p.pageNumber, p.table!.rows]), [[8, 3], [9, 3], [10, 1]])
    assert.equal(pages[1].table!.cells[0][3].text, "내용\n하단 값\n마지막 값")
    assert.equal(pages[2].table!.cells[0][3].text, "다음 값")
  })
  it("단순 연결의 다른 열에 같은 접두사가 있어도 쪽 안 글을 가르지 않는다", () => {
    const prev = table([[cell("가"), cell("가나다"), cell(), cell(), cell()]])
    const curr = table([[cell("다"), cell("라"), cell(), cell(), cell()]])
    const full = table([...prev.cells, ...curr.cells].map(row => row.map(c => ({ ...c }))))
    markJoinedPages(full, block(prev, 8), block(curr, 9))
    const pages = splitPageTables([block(full, 8)])
    assert.deepEqual(pages.map(p => [p.pageNumber, p.table!.rows]), [[8, 1], [9, 1]])
    assert.equal(pages[0].table!.cells[0][1].text, "가나다")
  })
  it("문서 셀의 원래 공백은 보존하고 쪽 사영의 기존 끝 공백 정리 규칙을 따른다", () => {
    const { prev, curr } = fixture()
    prev.cells[2][3].text = " 상단 값\n계속되는  "
    curr.cells[0][3].text = "  내용\n하단 값\n마지막 값  "
    const full = joinSplitParts(prev, xs, curr, xs, 0, 0)!.table
    assert.equal(full.cells[2][3].text, `${prev.cells[2][3].text}\n${curr.cells[0][3].text}`)
    markJoinedPages(full, block(prev, 8), block(curr, 9))
    const pages = splitPageTables([block(full, 8)])
    assert.equal(pages[0].table!.cells[2][3].text, prev.cells[2][3].text.trimEnd())
    assert.equal(pages[1].table!.cells[0][3].text, curr.cells[0][3].text.trim())
  })
  it("뒤 셀에 이미 있는 세 번째 쪽 경계도 앞 공백을 정리한 뒤 정확히 옮긴다", () => {
    const prev = table([[cell(), cell("위"), cell(), cell("앞 쪽"), cell()]])
    const tail = cell("  둘째 쪽  "), third = cell("   셋째 쪽  ")
    markContinuedText(tail, third, 10)
    tail.text += "\n" + third.text
    const curr = table([[cell(), cell("아래"), cell(), tail, cell()]])
    const full = table([...prev.cells, ...curr.cells].map(row => row.map(c => ({ ...c }))))
    full.cells[0][3] = { text: prev.cells[0][3].text + "\n" + tail.text, colSpan: 1, rowSpan: 2 }
    full.cells[1][3] = cell()
    const raw = full.cells[0][3].text
    markJoinedPages(full, block(prev, 8), block(curr, 9))
    const pages = splitPageTables([block(full, 8)])
    assert.deepEqual(pages.map(p => [p.pageNumber, p.table!.rows]), [[8, 1], [9, 1], [10, 1]])
    assert.deepEqual(pages.map(p => p.table!.cells.at(-1)![3].text), ["앞 쪽", "둘째 쪽", "셋째 쪽"])
    assert.equal(full.cells[0][3].text, raw)
  })
  it("공유 셀의 다른 라벨 목록도 같은 열의 병합 짜임을 증명한다", () => {
    const f = fixture(); f.curr.cells[1][2].text = "정규:\n보조:\n전문:"
    assert.ok(candidate(f))
  })
  it("다음 쪽까지 이은 공유 목록에서도 같은 쪽에 보이는 독립 문맥행을 근거로 쓴다", () => {
    const f = fixture()
    f.curr.cells[1][2].text += "\n라:"
    f.curr.cells[1][3].text += "\n다음 쪽 값"
    f.curr.cells[1][2].rowSpan = f.curr.cells[1][3].rowSpan = 3
    f.curr.cells.push([cell(), cell(), cell(), cell(), cell()]); f.curr.rows++
    assert.ok(candidate(f))
  })
  it("라벨 이름을 고정하지 않고 영문·숫자·전각 콜론도 정렬과 짜임으로 확인한다", () => {
    const f = fixture()
    for (const r of [0, 1]) f.prev.cells[r][2].text = "A1：\nB2：\nC3："
    f.prev.cells[2][2].text = "A1："; f.curr.cells[0][2].text = "B2：\nC3："
    assert.ok(candidate(f))
  })
  const negatives: Array<[string, (f: ReturnType<typeof fixture>) => void]> = [
    ["뒤 문맥이 비어 있음", f => { f.curr.cells[0][1].text = "" }],
    ["같은 문맥의 반복", f => { f.curr.cells[0][1].text = f.prev.cells[2][1].text }],
    ["라벨 순서 변경", f => { f.curr.cells[0][2].text = "다:\n나:" }],
    ["라벨 중복", f => { f.curr.cells[0][2].text = "나:\n가:" }],
    ["값 선행 줄 없음", f => { CELL_LINES.set(f.curr.cells[0][3], CELL_LINES.get(f.curr.cells[0][3])!.slice(1)) }],
    ["값 기준선 누락", f => { CELL_LINES.set(f.curr.cells[0][3], CELL_LINES.get(f.curr.cells[0][3])!.slice(0, 2)) }],
    ["값 한 줄 중복 사용", f => {
      CELL_LINES.set(f.curr.cells[0][2], [750, 748].map(y => ({ y, l: 110, r: 135, h: 1 })))
      CELL_LINES.set(f.curr.cells[0][3], [770, 749, 500].map(y => ({ y, l: 155, r: 220, h: 1 })))
    }],
    ["완성 목록 부족", f => { f.prev.cells[0][2].text = "다른:\n목록:" }],
    ["공유 병합 짜임 없음", f => { f.curr.cells[1][2].rowSpan = f.curr.cells[1][3].rowSpan = 1 }],
    ["공유 목록의 보이는 라벨이 세 줄 미만", f => { CELL_LINES.set(f.curr.cells[1][2], CELL_LINES.get(f.curr.cells[1][2])!.slice(0, 2)) }],
    ["공유 목록과 다른 쪽의 문맥 기준선", f => { CELL_LINES.set(f.curr.cells[2][1], [{ y: 700, l: 60, r: 80, h: 10 }]) }],
    ["y 범위가 같아도 서로 다른 쪽의 문맥", f => {
      CELL_PAGES.set(f.curr.cells[1][2], 9); CELL_PAGES.set(f.curr.cells[1][3], 9)
      CELL_PAGES.set(f.curr.cells[1][1], 9); CELL_PAGES.set(f.curr.cells[2][1], 10)
    }],
    ["라벨과 값 줄의 쪽 불일치", f => { CELL_PAGES.set(f.curr.cells[1][3], 10) }],
    ["열 범위 불일치", f => { f.curr.cells[0][2].colSpan = 2 }],
    ["문맥 가로선 없음", f => { CELL_EDGES.set(f.curr.cells[0][1], { t: false, b: true, l: true, r: true }) }],
    ["중첩 블록 포함", f => { f.curr.cells[0][3].blocks = [{ type: "paragraph", text: "별도 문단" }] }],
  ]
  for (const [name, change] of negatives) it(`${name}이면 부분 셀 병합 증거로 쓰지 않는다`, () => {
    const f = fixture(); change(f); assert.equal(candidate(f), undefined)
  })
})
