import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
const cell = (col: number, row: number, rs: number, h: number, lines: number[]) => `<hp:tc><hp:subList vertAlign="CENTER"><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${lines.map(seg).join("")}</hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
// 두 행(1724씩) 표, 첫 칸은 두 행에 걸친다. 표 위 4500·본문 바닥 6000 — 첫 행 쪽 조각에 남은 1500 에는 한 행 칸 글(1000)은 들고
// 두 행 칸 글(두 줄 2600)이 안 든다
const firstRowPage = async (spanLines: number[]) => {
  const { planTableRows } = await import("../src/render/table-pages.js")
  const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
  const xml = `<hp:tbl ${hp} pageBreak="CELL" rowCnt="2" colCnt="2"><hp:sz width="10000" height="3448"/>` +
    `<hp:tr>${cell(0, 0, 2, 3448, spanLines)}${cell(1, 0, 1, 1724, [0])}</hp:tr><hp:tr>${cell(1, 1, 1, 1724, [0])}</hp:tr></hp:tbl>`
  const t = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  return planTableRows(t, collectCells(t), measureTableRowHeights(t), 4500, 0, 6000, 500)[0][0].page
}

describe("render: 쪽 바닥에서 시작하는 표의 첫 행과 여러 행 칸", () => {
  it("그 행에서 시작하는 여러 행 칸의 글이 남은 자리에 안 들면 표째 다음 쪽", async () => {
    assert.equal(await firstRowPage([0, 1600]), 1)
  })
  it("여러 행 칸 글도 들면 종전대로 이 쪽에서 시작", async () => {
    assert.equal(await firstRowPage([0]), 0)
  })
})
