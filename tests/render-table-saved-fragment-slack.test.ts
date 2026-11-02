import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (th: number) => `<hp:lineseg textpos="0" vertpos="0" vertsize="${th}" textheight="${th}" baseline="${th * 0.85}" spacing="600" horzpos="0" horzsize="9000"/>`
const row = (r: number, h: number, th = 1000) => `<hp:tr><hp:tc><hp:subList vertAlign="TOP"><hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg(th)}</hp:linesegarray></hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
// 세 행(1000·1000·3000) 표 — 표 위 2000, 본문 0~6000, 아래 여백 넘침 여유 2000(표 바닥 7000 은 여유 안).
// 마지막 행의 줄(높이 2500)은 남은 2000 에 안 든다
const lastRowPage = async (declared: number) => {
  const { planTableRows } = await import("../src/render/table-pages.js")
  const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
  const t = createXmlParser().parseFromString(`<hp:tbl ${hp} pageBreak="CELL" rowCnt="3" colCnt="1"><hp:sz width="10000" height="${declared}"/>${row(0, 1000)}${row(1, 1000)}${row(2, 3000, 2500)}</hp:tbl>`, "text/xml").documentElement as unknown as Element
  return planTableRows(t, collectCells(t), measureTableRowHeights(t), 2000, 0, 6000, 2000)[2][0].page
}

describe("render: 저장 표 높이가 첫 쪽 조각인 표와 아래 여백 넘침 여유", () => {
  it("sz 가 안쪽 행 경계(2000 = 둘째 행까지)면 한컴이 가른 표 — 넘침 여유 없이 마지막 행이 다음 쪽", async () => {
    assert.equal(await lastRowPage(2000), 1)
  })
  it("sz 가 표 전체 높이(5000)면 종전대로 아래 여백 안에서 한 쪽", async () => {
    assert.equal(await lastRowPage(5000), 0)
  })
})
