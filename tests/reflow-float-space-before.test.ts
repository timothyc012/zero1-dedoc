import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"
const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
function lines(before = 1000, rel = "PARA", inCell = false) {
  const head = `<hh:head ${ns}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="굴림체"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:lineSpacing type="PERCENT" value="160"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:margin><hc:prev value="${before}" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
  const pic = `<hp:pic textWrap="SQUARE"><hp:sz width="5000" height="2000"/><hp:pos treatAsChar="0" vertRelTo="${rel}" horzRelTo="COLUMN" vertOffset="3000"/></hp:pic>`
  const para = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>${"가".repeat(30)}</hp:t></hp:run></hp:p>`
  const content = inCell ? `<hp:p><hp:run><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="10000" height="20000"/><hp:tr><hp:tc><hp:subList>${para}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="20000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl></hp:run></hp:p>` : para
  const root = createXmlParser().parseFromString(`<hs:sec ${ns}>${content}</hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 10000, BODY_H: 70000 })
  const target = inCell ? root.getElementsByTagName("hp:subList")[0] : root
  return Array.from(target.getElementsByTagName("hp:lineseg")).map(s => ["textpos", "vertpos", "horzpos", "horzsize"].map(a => Number(s.getAttribute(a))))
}
describe("어울림 개체와 문단 위 간격", () => {
  it("본문 문단 기준 그림은 위 간격 앞에서 오프셋을 잰다", () => {
    assert.deepEqual(lines(), [[0, 1000, 0, 10000], [18, 2600, 5000, 5000], [23, 4200, 5000, 5000], [28, 5800, 0, 10000]])
  })
  it("위 간격이 없는 문단은 기존 위치를 유지한다", () => {
    assert.deepEqual(lines(0), [[0, 0, 0, 10000], [18, 1600, 0, 10000], [28, 3200, 5000, 5000], [33, 4800, 5000, 5000]])
  })
  it("단 기준 개체는 문단 위 간격을 빼지 않는다", () => {
    assert.deepEqual(lines(1000, "COLUMN"), [[0, 1000, 0, 10000], [18, 2600, 0, 10000], [28, 4200, 5000, 5000], [33, 5800, 5000, 5000]])
  })
  it("표 칸 안 문단의 기존 개체 위치는 유지한다", () => {
    assert.deepEqual(lines(1000, "PARA", true), [[0, 1000, 0, 10000], [18, 2600, 0, 10000], [28, 4200, 5000, 5000], [33, 5800, 5000, 5000]])
  })
  it("쪽 기준 그림은 문단 어울림 영역에 참여하지 않는다", () => {
    assert.deepEqual(lines(1000, "PAGE"), [[0, 1000, 0, 10000], [18, 2600, 0, 10000], [28, 4200, 0, 10000]])
  })
})
