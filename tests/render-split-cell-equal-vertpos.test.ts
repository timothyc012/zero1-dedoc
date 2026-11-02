import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
const row = (r: number, segs: number[], cellH: number) =>
  `<hp:tr><hp:tc><hp:subList vertAlign="CENTER">${segs.map(v => `<hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg(v)}</hp:linesegarray></hp:p>`).join("")}</hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${cellH}"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr>`
// 행 0: 한 줄(칸 높이 2000), 행 1: 첫 줄만 앞 쪽에 남기고 가른 칸 — 둘째 줄도 vertpos 0 으로 저장된다(칸 높이 1500)
const table = () => createXmlParser().parseFromString(
  `<hp:tbl ${hp} pageBreak="CELL" rowCnt="2" colCnt="1"><hp:sz width="10000" height="4882"/>${row(0, [0], 2000)}${row(1, [0, 0], 1500)}</hp:tbl>`, "text/xml").documentElement as unknown as Element

describe("render: 첫 줄 뒤에서 갈라 저장한 칸 (같은 vertpos 0 으로 다시 시작)", () => {
  it("둘째 줄을 다음 쪽 조각으로 보고, 첫 쪽 조각 높이는 칸 저장 높이와 그 쪽 내용 중 큰 것", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    const t = table()
    // 둘째 줄은 앞 줄 끝(1000 + 간격 600)에 이어 잰다 — 행 높이 = 2600 + 칸 여백 282
    assert.deepEqual(measureTableRowHeights(t), [2000, 2882])
    // 표 위 3000, 쪽 7000: 행 1 은 5000 에서 쪽을 넘는다. 첫 쪽 조각 = max(칸 높이 1500, 첫 줄 + 칸 여백 1282) — 쪽 바닥(2000)까지가 아니다,
    // 다음 쪽 조각 = 둘째 줄 + 칸 여백
    const plan = planTableRows(t, collectCells(t), measureTableRowHeights(t), 3000, 0, 7000).map(ps => ps.map(p => [p.page, p.y, p.h]))
    assert.deepEqual(plan, [[[0, 3000, 2000]], [[0, 5000, 1500], [1, 0, 1282]]])
  })
})
