import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`

describe("render: 칸 높이 — 밀리지 않은 줄의 위아래 배치 표", () => {
  it("빈 문단 줄이 앞 문단 끝(20000)에 그대로면 표(5000)는 그 줄에서 시작한다 — 칸 내용은 25000 까지", async () => {
    const { collectCells, cellContentExtent } = await import("../src/render/para-model.js")
    const inner = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="8000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
      `<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>표</hp:t></hp:run>${seg(0)}</hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="8000" height="5000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    // 앞 문단 줄 18400(끝 20000) — 표 위에 두면(줄 − 표 = 15000) 앞 문단과 겹친다
    const sub = `<hp:subList vertAlign="TOP"><hp:p><hp:run><hp:t>가</hp:t></hp:run>${seg(18400)}</hp:p><hp:p><hp:run>${inner}<hp:t/></hp:run>${seg(20000)}</hp:p></hp:subList>`
    const t = createXmlParser().parseFromString(`<hp:tbl ${hp} rowCnt="1" colCnt="1"><hp:sz width="10000" height="2000"/><hp:tr><hp:tc>${sub}<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`, "text/xml").documentElement as unknown as Element
    const outer = collectCells(t).find(c => c.ra === 0)!
    assert.equal(cellContentExtent(outer), 25000)
  })
})
