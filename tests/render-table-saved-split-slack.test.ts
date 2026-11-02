import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
// 한 칸 표 — 칸 줄 0·1600·3200 | 0·1600(넷째 줄에서 되돌아감 = 한컴이 쪽에서 갈라 저장)
const table = (segs: number[]) => createXmlParser().parseFromString(
  `<hp:tbl ${hp} pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="2000"/><hp:tr><hp:tc><hp:subList vertAlign="TOP">` +
  segs.map(v => `<hp:p><hp:run><hp:t>가</hp:t></hp:run><hp:linesegarray>${seg(v)}</hp:linesegarray></hp:p>`).join("") +
  `</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element

describe("render: 아래 여백 안에서 끝나는 표와 쪽에서 갈라 저장한 칸", () => {
  it("칸 줄이 되돌아간 표는 아래 여백으로 넘치지 않고 가른다 — 되돌아가지 않은 표는 종전대로 한 쪽", async () => {
    const { planTableRows } = await import("../src/render/table-pages.js")
    const { collectCells, measureTableRowHeights } = await import("../src/render/para-model.js")
    // 쪽 본문 0~6000, 아래 여백 넘침 여유 5000. 표 위 3000 — 두 표 모두 여유(11000) 안에서 끝난다(갈린 칸은 이어 잰 내용 7400)
    const split = table([0, 1600, 3200, 0, 1600]), flat = table([0, 1600, 3200, 4800])
    const pages = (t: Element) => new Set(planTableRows(t, collectCells(t), measureTableRowHeights(t), 3000, 0, 6000, 5000).flat().map(p => p.page)).size
    assert.equal(pages(flat), 1)
    assert.equal(pages(split), 2)
  })
})
