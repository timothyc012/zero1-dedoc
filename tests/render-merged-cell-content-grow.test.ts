import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
const tc = (r: number, c: number, rs: number, h: number, lines: number[]) =>
  `<hp:tc><hp:subList vertAlign="CENTER"><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${lines.map(seg).join("")}</hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc>`
// 2행 병합 칸에 두 줄(내용 2600 + 칸 여백 = 2882)이 들었는데 저장 높이는 2564, 옆 칸은 한 줄짜리 행 둘
const table = (szH: number) => createXmlParser().parseFromString(
  `<hp:tbl ${hp} rowCnt="2" colCnt="2"><hp:sz width="10000" height="${szH}"/><hp:tr>${tc(0, 0, 2, 2564, [0, 1600])}${tc(0, 1, 1, 1282, [0])}</hp:tr><hp:tr>${tc(1, 1, 1, 0, [0])}</hp:tr></hp:tbl>`,
  "text/xml").documentElement as unknown as Element

describe("render: 여러 행 칸 내용이 저장 높이보다 크면 마지막 행이 자란다", () => {
  it("모자란 318 만큼 둘째 행이 자라고 첫 행은 그대로 — 표 저장 높이를 넘지는 않는다", async () => {
    const { measureTableRowHeights } = await import("../src/render/para-model.js")
    assert.deepEqual(measureTableRowHeights(table(2882)), [1282, 1600])
    assert.deepEqual(measureTableRowHeights(table(2700)), [1282, 1418]) // 표 sz 2700 에서 멈춘다
  })
})
