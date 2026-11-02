import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { IRBlock, IRCell, IRTable } from "../src/types.js"
import { mergeCrossPageTables } from "../src/pdf/table-parts.js"
import { IMAGE_CELLS, TABLE_COLXS } from "../src/pdf/table-meta.js"

type Entry = [number, number, string, number?, number?]
const grid = (rows: number, cols: number, entries: Entry[]): IRTable => {
  const cells: IRCell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ text: "", rowSpan: 1, colSpan: 1 })))
  for (const [r, c, text, colSpan = 1, rowSpan = 1] of entries) cells[r][c] = { text, colSpan, rowSpan }
  return { rows, cols, cells, hasHeader: true }
}
const merge = (tables: IRTable[]): IRBlock[] => {
  const blocks: IRBlock[] = tables.map((table, i) => {
    TABLE_COLXS.set(table, Array.from({ length: table.cols + 1 }, (_, c) => 50 + 150 * c))
    return { type: "table", table, pageNumber: i + 1, bbox: { page: i + 1, x: 50, y: 70, width: table.cols * 150, height: 630 } }
  })
  mergeCrossPageTables(blocks)
  return blocks
}
const h: Entry[] = [[0, 0, "구분"], [0, 1, "값"]]
const parts = (wide = false): IRTable[] => ["상위", "", ""].map((label, i) => wide
  ? grid(3, 3, [[0, 0, "분류", 2], [0, 2, "값"], [1, 0, label, 2, 2], [1, 2, String(i * 2 + 1)], [2, 2, String(i * 2 + 2)]])
  : grid(3, 2, [...h, [1, 0, label, 1, 2], [1, 1, String(i * 2 + 1)], [2, 1, String(i * 2 + 2)]]))
const h2: Entry[] = [[0, 0, "분류", 1, 2], [0, 1, "구급차", 2], [1, 1, "특수"], [1, 2, "일반"]]
const body = (name: string): Entry[] => [[2, 0, name], [2, 1, "1"], [2, 2, "2"]]

describe("선 격자 표의 다중 쪽 병합과 머리 보존", () => {
  for (const wide of [false, true]) it("세 쪽 상위 병합 칸을 6행으로 잇는다 (colspan " + (wide ? 2 : 1) + ")", () => {
    const b = merge(parts(wide)), t = b[0].table!
    assert.equal(b.length, 1)
    assert.equal(t.rows, 7)
    assert.equal(t.cells[1][0].rowSpan, 6)
    assert.equal(t.cells[1][0].colSpan, wide ? 2 : 1)
    assert.deepEqual(t.cells.slice(1).map(r => r[wide ? 2 : 1].text), ["1", "2", "3", "4", "5", "6"])
  })
  it("그림만 있는 뒤쪽 병합 칸은 이름표에 흡수하지 않고 곁정보를 보존한다", () => {
    const tables = parts().slice(0, 2), image = tables[1].cells[1][0]
    IMAGE_CELLS.add(image)
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 2)
    assert.equal(t.cells[3][0], image)
    assert.equal(image.rowSpan, 2)
    assert.ok(IMAGE_CELLS.has(t.cells[3][0]))
  })
  it("블록만 있는 뒤쪽 병합 칸도 독립 내용으로 보존한다", () => {
    const tables = parts().slice(0, 2), cell = tables[1].cells[1][0]
    cell.blocks = [{ type: "paragraph", text: "그림 설명" }]
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 2)
    assert.equal(t.cells[3][0], cell)
  })
  it("머리 없는 빈 상위 병합 칸을 새 머리로 오판하지 않는다", () => {
    const t = merge([grid(2, 2, [[0, 0, "상위", 1, 2], [0, 1, "가"], [1, 1, "나"]]),
      grid(2, 2, [[0, 0, "", 1, 2], [0, 1, "다"], [1, 1, "라"]])])
    assert.equal(t.length, 1)
    assert.equal(t[0].table!.cells[0][0].rowSpan, 4)
  })
  it("중첩된 병합으로 깊어진 세 행 머리를 모두 제거한다", () => {
    const h3: Entry[] = [[0, 0, "구분", 1, 2], [0, 1, "종류", 2], [1, 1, "분류", 1, 2], [1, 2, "값"], [2, 2, "하위값"]]
    const b = merge([grid(4, 3, [...h3, [3, 0, "기존"], [3, 1, "1"], [3, 2, "2"]]),
      grid(4, 3, [...h3, [3, 0, "다음"], [3, 1, "3"], [3, 2, "4"]])])
    assert.equal(b.length, 1)
    assert.equal(b[0].table!.rows, 5)
    assert.equal(b[0].table!.cells.filter(r => r.some(c => c.text === "하위값")).length, 1)
  })
  it("하위 머리가 다르면 별도 표의 첫 머리 행도 지우지 않는다", () => {
    const b = merge([grid(3, 3, [...h2, ...body("기존")]),
      grid(3, 3, [[0, 0, "분류", 1, 2], [0, 1, "구급차", 2], [1, 1, "대형"], [1, 2, "소형"], ...body("새")])])
    assert.equal(b.length, 2)
    assert.equal(b[1].table!.cells[0][0].text, "분류")
    assert.equal(b[1].table!.rows, 3)
  })
  it("머리 글이 같아도 앵커 병합 모양이 다르면 별도 표다", () => {
    const b = merge([grid(3, 3, [...h2, ...body("기존")]),
      grid(3, 3, [[0, 0, "분류"], [0, 1, "구급차", 2], [1, 1, "특수"], [1, 2, "일반"], ...body("새")])])
    assert.equal(b.length, 2)
    assert.equal(b[1].table!.cells[0][0].text, "분류")
  })
  it("뒤쪽에서 새 이름표가 시작하면 병합 사슬을 끊는다", () => {
    const tables = parts()
    tables[2].cells[1][0].text = "새 상위"
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 4)
    assert.equal(t.cells[5][0].text, "새 상위")
    assert.equal(t.cells[5][0].rowSpan, 2)
  })
  it("네 쪽의 빈 중간 조각도 실제 경계 사슬을 따라 8행으로 잇는다", () => {
    const tables = parts()
    tables.push(grid(3, 2, [...h, [1, 0, "", 1, 2], [1, 1, "7"], [2, 1, "8"]]))
    const b = merge(tables), t = b[0].table!
    assert.equal(b.length, 1)
    assert.equal(t.rows, 9)
    assert.equal(t.cells[1][0].rowSpan, 8)
    assert.equal(t.cells[8][1].text, "8")
  })
  it("단일 행 빈 칸은 병합 이어짐 증거로 쓰지 않는다", () => {
    const tables = parts().slice(0, 2)
    tables[1].cells[1][0].rowSpan = 1
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 2)
    assert.equal(t.cells[3][0].rowSpan, 1)
  })
  it("사슬 끝에 그림이 나오면 그 원점과 행 범위를 유지한다", () => {
    const tables = parts(), image = tables[2].cells[1][0]
    IMAGE_CELLS.add(image)
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 4)
    assert.equal(t.cells[5][0], image)
    assert.equal(image.rowSpan, 2)
    assert.ok(IMAGE_CELLS.has(image))
  })
  it("열 병합 폭이 달라진 빈 칸은 같은 병합 조각으로 잇지 않는다", () => {
    const tables = parts(true).slice(0, 2)
    tables[1].cells[1][0].colSpan = 1
    const t = merge(tables)[0].table!
    assert.equal(t.cells[1][0].rowSpan, 2)
    assert.equal(t.cells[3][0].rowSpan, 2)
  })
})
