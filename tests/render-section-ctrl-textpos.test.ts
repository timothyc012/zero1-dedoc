import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"

const hp = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
const seg = (tp: number) => `<hp:lineseg textpos="${tp}" vertpos="0" vertsize="40000" textheight="40000" baseline="34000" spacing="600" horzpos="0" horzsize="48000"/>`
const tbl = `<hp:tbl rowCnt="1" colCnt="1"><hp:sz width="47000" height="40000"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA"/><hp:outMargin left="141" right="141" top="141" bottom="141"/>` +
  `<hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>표</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="47000" height="40000"/></hp:tc></hp:tr></hp:tbl>`
const head = `<hp:secPr/><hp:ctrl><hp:colPr colCount="1"/></hp:ctrl>`
const para = (body: string, segs: number[]) => createXmlParser().parseFromString(
  `<hp:p ${hp}><hp:run>${head}</hp:run><hp:run>${body}</hp:run><hp:linesegarray>${segs.map(seg).join("")}</hp:linesegarray></hp:p>`, "text/xml").documentElement as unknown as Element

describe("render: 구역 첫 문단 줄 시작 — 구역·단 정의 칸", () => {
  it("둘째 줄 textpos 가 구역·단 정의 칸 안(8)이면 그 칸(16)을 더해 둘째 표(24)부터 둘째 줄", async () => {
    const { buildPara } = await import("../src/render/para-model.js")
    const m = buildPara(para(tbl + tbl, [0, 8]))
    assert.deepEqual(m.objs.map(o => o.index), [16, 24])
    assert.deepEqual(m.segs.map(s => s.textpos), [0, 24])
  })
  it("둘째 줄이 첫 글 뒤면 그대로 둔다", async () => {
    const { buildPara } = await import("../src/render/para-model.js")
    const m = buildPara(para(`<hp:t>가나다라마바</hp:t>`, [0, 19]))
    assert.deepEqual(m.segs.map(s => s.textpos), [0, 19])
  })
})
