import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = `<hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
const row = (r: number) => `<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg}</hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr>`
const table = (pageBreak: string, vertRelTo = "PARA") => createXmlParser().parseFromString(
  `<hp:tbl ${hp} pageBreak="${pageBreak}" rowCnt="2" colCnt="1"><hp:sz width="10000" height="4000"/><hp:pos treatAsChar="0" vertRelTo="${vertRelTo}"/>${row(0)}${row(1)}</hp:tbl>`, "text/xml").documentElement as unknown as Element

describe("render: 쪽 바닥에서 첫 행을 못 놓는 흐르는 표", () => {
  it("쪽 위가 아닌 자리에서 첫 행이 안 들면 표째 다음 쪽 맨 위 — 쪽 위면 그대로, 용지 기준 표도 그대로", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    const plan = (t: Element, ty: number, bodyH = 7000) => planTableRows(t, collectCells(t), measureTableRowHeights(t), ty, 0, bodyH).map(ps => ps.map(p => [p.page, p.y, p.h]))
    // 표 위 6500, 쪽 7000: 첫 행(2000)의 칸 첫 줄(141 + 1000)도 남은 500 에 안 든다
    assert.deepEqual(plan(table("CELL"), 6500), [[[1, 0, 2000]], [[1, 2000, 2000]]])
    assert.deepEqual(plan(table("TABLE"), 6500), [[[1, 0, 2000]], [[1, 2000, 2000]]])
    // 쪽 맨 위 가까이(2000 안)에서 시작한 표는 옮겨도 들지 않으니 그 쪽에 둔다(쪽 2500, 첫 행이 넘친다) — 종전과 같다
    assert.deepEqual(plan(table("TABLE"), 1500, 2500).map(ps => ps.map(p => p[0])), [[0], [1]])
    // 용지·쪽 기준으로 놓은 표는 자리를 지킨다
    assert.deepEqual(plan(table("TABLE", "PAPER"), 6500).map(ps => ps.map(p => p[0])), [[0], [1]])
  })
})
