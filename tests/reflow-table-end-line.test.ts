import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
// 글자 모양 0 = 2600, 1 = 1500. 문단 줄 간격 90%
const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="2600"><hh:fontRef hangul="0"/></hh:charPr><hh:charPr id="1" height="1500"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="RIGHT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:lineSpacing type="PERCENT" value="90" unit="HWPUNIT"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" rowCnt="1" colCnt="1"><hp:sz width="10000" height="1848"/><hp:pos treatAsChar="1" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="283" right="283" top="283" bottom="283"/><hp:tr><hp:tc><hp:subList vertAlign="CENTER"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="1"><hp:t>배포</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1848"/><hp:cellMargin left="141" right="141" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
function hostLine(runs: string) {
  const root = createXmlParser().parseFromString(`<hs:sec ${NS}><hp:p paraPrIDRef="0">${runs}</hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 60000 })
  const seg = Array.from(root.getElementsByTagName("hp:lineseg")).find(s => s.parentNode?.parentNode === root.firstChild)!
  return ["vertsize", "baseline", "spacing"].map(a => Number(seg.getAttribute(a)))
}
describe("글 없이 표만 든 문단 끝 줄", () => {
  it("표를 담은 run 의 글자 크기는 줄 높이에 들지 않는다 — 문단 끝 빈 run 이 작으면 표 높이", () => {
    // 표 1848 + 위아래 바깥 여백 566 = 2414, 기준선 85%, 줄 간격 몫은 표 run 2600 × 90% − 2600
    assert.deepEqual(hostLine(`<hp:run charPrIDRef="0">${tbl}</hp:run><hp:run charPrIDRef="1"><hp:t/></hp:run>`), [2414, 2052, -260])
  })
  it("표와 빈 글이 한 run 이면 그 run 의 글자 크기가 줄 높이", () => {
    assert.deepEqual(hostLine(`<hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>`), [2600, 2210, -260])
  })
})
