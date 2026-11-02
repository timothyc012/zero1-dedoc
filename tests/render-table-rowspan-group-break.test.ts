import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = `<hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="4000"/>`
const cell = (col: number, row: number, rs: number, h: number) => `<hp:tc><hp:subList vertAlign="CENTER"><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg}</hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
// 세 행(2000씩), 1·2행은 첫 칸이 두 행에 걸친다. 표 위 1000·본문 바닥 6000 — 1행 바닥 5000 은 들고 2행 바닥 7000 은 안 든다
const pagesOf = async (mode: string) => {
  const { planTableRows } = await import("../src/render/table-pages.js")
  const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
  const xml = `<hp:tbl ${hp} pageBreak="${mode}" rowCnt="3" colCnt="2"><hp:sz width="10000" height="6000"/>` +
    `<hp:tr>${cell(0, 0, 1, 2000)}${cell(1, 0, 1, 2000)}</hp:tr><hp:tr>${cell(0, 1, 2, 4000)}${cell(1, 1, 1, 2000)}</hp:tr><hp:tr>${cell(1, 2, 1, 2000)}</hp:tr></hp:tbl>`
  const t = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  return planTableRows(t, collectCells(t), measureTableRowHeights(t), 1000, 0, 6000).map(ps => ps[0].page)
}

describe("render: 칸을 쪼개지 않는 표(나눔 TABLE)의 여러 행 칸 묶음", () => {
  it("묶음 전체가 이 쪽에 안 들면 묶음째 다음 쪽", async () => {
    assert.deepEqual(await pagesOf("TABLE"), [0, 1, 1])
  })
})
