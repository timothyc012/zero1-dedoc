import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
const cell = (r: number, h: number, segs: number[]) => `<hp:tr><hp:tc><hp:subList vertAlign="TOP">` +
  segs.map(v => `<hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg(v)}</hp:linesegarray></hp:p>`).join("") +
  `</hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
// 두 행 표(본문 0~6000) — 둘째 행 칸은 쪽에서 갈라 저장됐다(줄 0·1600·3200 | 0·1600, 첫 조각 4200)
const plan = async (firstRowH: number) => {
  const { planTableRows } = await import("../src/render/table-pages.js")
  const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
  const t = createXmlParser().parseFromString(`<hp:tbl ${hp} pageBreak="CELL" rowCnt="2" colCnt="1"><hp:sz width="10000" height="7000"/>${cell(0, firstRowH, [0])}${cell(1, 2000, [0, 1600, 3200, 0, 1600])}</hp:tbl>`, "text/xml").documentElement as unknown as Element
  return planTableRows(t, collectCells(t), measureTableRowHeights(t), 0, 0, 6000)[1]
}

describe("render: 쪽에서 갈라 저장한 행의 첫 조각과 남은 자리", () => {
  it("첫 줄(1000)도 남은 500 에 안 들면 행째 다음 쪽에서 시작한다 — 갈린 둘째 조각은 그다음 쪽", async () => {
    const pcs = await plan(5500)
    assert.deepEqual(pcs.map(p => p.page), [1, 2])
    assert.equal(pcs[0].y, 0)
  })
  it("첫 줄이 들면 첫 조각이 남은 자리(1500)보다 길어도 이 쪽에서 가른다 — 저장 줄이 낡은 문서(한컴 PDF 도 그 자리)", async () => {
    assert.deepEqual((await plan(4500)).map(p => p.page), [0, 1])
  })
})
