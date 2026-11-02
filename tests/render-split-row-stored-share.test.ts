import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
// 한컴이 셋째 줄 뒤에서 갈라 저장한 칸(0·1600·3200 | 0·1600), 칸 저장 높이 9000, 표 sz 5000 = 첫 쪽 조각
const table = (vertAlign: string) => {
  const ls = [0, 1600, 3200, 0, 1600].map(v => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`).join("")
  return createXmlParser().parseFromString(`<hp:tbl ${hp} pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5000"/><hp:tr><hp:tc><hp:subList vertAlign="${vertAlign}"><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${ls}</hp:linesegarray></hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="9000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element
}

describe("render: 두 쪽에 갈린 행의 다음 쪽 조각", () => {
  it("가운데·아래 정렬 칸은 칸 저장 높이에서 첫 쪽 조각을 뺀 만큼, 위 정렬 칸은 남은 글만", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    const plan = (t: Element) => planTableRows(t, collectCells(t), measureTableRowHeights(t), 2000, 0, 7000).map(ps => ps.map(p => [p.page, p.y, p.h]))
    assert.deepEqual(plan(table("CENTER")), [[[0, 2000, 5000], [1, 0, 4000]]]) // 9000 − 5000
    assert.deepEqual(plan(table("BOTTOM")), [[[0, 2000, 5000], [1, 0, 4000]]])
    assert.deepEqual(plan(table("TOP")), [[[0, 2000, 5000], [1, 0, 2882]]]) // 둘째 줄 바닥 2600 + 칸 여백
  })
})
