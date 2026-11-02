import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
// 셋째 줄 뒤에서 갈라 저장한 칸 — 둘째 쪽 첫 줄(0)에 높이 3000 인 위아래 배치 표를 앵커했다
const table = (withFloat: boolean) => {
  const float = withFloat ? `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="5000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:tbl>` : ""
  return createXmlParser().parseFromString(`<hp:tbl ${hp} pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5000"/><hp:tr><hp:tc><hp:subList vertAlign="TOP">` +
    `<hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${[0, 1600, 3200].map(seg).join("")}</hp:linesegarray></hp:p>` +
    `<hp:p><hp:run>${float}<hp:t/></hp:run><hp:linesegarray>${seg(0)}</hp:linesegarray></hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element
}

describe("render: 갈린 행 마지막 조각의 앵커 개체", () => {
  it("마지막 조각 줄에 앵커한 위아래 배치 개체 바닥까지 조각이 선다", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    const plan = (t: Element) => planTableRows(t, collectCells(t), measureTableRowHeights(t), 2000, 0, 7000).map(ps => ps.map(p => [p.page, p.y, p.h]))
    assert.deepEqual(plan(table(true))[0][1], [1, 0, 3282]) // 개체 3000 + 칸 여백
    assert.deepEqual(plan(table(false))[0][1], [1, 0, 1282]) // 줄 1000 + 칸 여백
  })
})
