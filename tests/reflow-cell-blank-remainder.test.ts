import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { splitFloatTableRemainder, splitMovedLast } from "../src/render/reflow-tables.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"'
function host(lines: number[], mode = "CELL", extra = "", margins = 0) {
  const segs = lines.map(v => `<hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600"/>`).join("")
  const xml = `<hp:p ${ns}><hp:run><hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="${mode}" rowCnt="1" colCnt="1"><hp:sz width="10000" height="5904"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList><hp:p><hp:run>${extra}<hp:t>본문</hp:t></hp:run><hp:linesegarray>${segs}</hp:linesegarray></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5904"/><hp:cellMargin left="0" right="0" top="${margins}" bottom="${margins}"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>`
  return createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
}
describe("칸 나눔 표의 빈 높이와 실제 남은 내용", () => {
  it("글이 모두 앞쪽에 들면 저장된 빈 행 높이를 다음 쪽으로 넘기지 않는다 — 표는 그 쪽에서 끝난다", () => {
    const p = host([0, 1600])
    assert.equal(splitFloatTableRemainder(p, 3000, 6000, 10000), 3000 + 5904)
    assert.equal(splitMovedLast, false)
    assert.deepEqual(Array.from(p.getElementsByTagName("hp:lineseg"), s => Number(s.getAttribute("vertpos"))), [0, 1600])
  })
  it("다음 쪽에 바깥 여백만 남긴 조각을 두지 않는다 — 뒤 문단은 새 쪽 0", () => {
    // 칸 줄 둘(바닥 2600) + 칸 여백 141×2 는 쪽에 들지만, 저장된 행 높이 8000 + 바깥 아래 283 이 본문 7000 을 넘는다(종전: 뒤 문단 283)
    const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
    const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
    const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`.repeat(2)
    const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="8000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="283"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="8000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 7000 })
    const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
    assert.equal(Number(ps[1].getElementsByTagName("hp:lineseg")[0].getAttribute("vertpos")), 0)
  })
  it("실제로 남은 줄은 다음 쪽 첫 줄부터 배치한다", () => {
    const p = host([0, 1600, 3200])
    assert.equal(splitFloatTableRemainder(p, 3000, 6000, 10000), 1000)
    assert.deepEqual(Array.from(p.getElementsByTagName("hp:lineseg"), s => Number(s.getAttribute("vertpos"))), [0, 1600, 0])
  })
  it("한 줄도 못 넣거나 조판된 줄이 없으면 행째 옮긴다", () => {
    assert.equal(splitFloatTableRemainder(host([0]), 5500, 6000, 10000), 5904)
    assert.equal(splitFloatTableRemainder(host([]), 3000, 6000, 10000), 5904)
  })
  it("행 단위 나눔은 내용이 짧아도 저장 높이를 유지한다", () => {
    assert.equal(splitFloatTableRemainder(host([0, 1600], "TABLE"), 3000, 6000, 10000), 5904)
  })
  it("칸 위아래 여백 때문에 줄이 안 들면 실제 남은 높이에 포함한다", () => {
    assert.equal(splitFloatTableRemainder(host([0, 1600], "CELL", "", 300), 3000, 6000, 10000), 1600)
  })
  it("줄은 들어도 다음 쪽으로 옮긴 그림 높이는 남긴다", () => {
    const pic = '<hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="1000" height="4000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin top="0" bottom="0"/></hp:pic>'
    assert.equal(splitFloatTableRemainder(host([0], "CELL", pic), 3000, 6000, 10000), 4000)
  })
})
