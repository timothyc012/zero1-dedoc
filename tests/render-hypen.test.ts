import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { buildPara, prepareDeletedRanges } from "../src/render/para-model.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="굴림체"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
function root(text: string) {
  return createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
}
describe("선택 하이픈의 hypen 표기", () => {
  for (const tag of ["hypen", "hyphen"]) it(`${tag}은 폭 없이 한 슬롯을 차지하며 다음 줄의 문자 위치를 유지한다`, () => {
    const r = root(`가<hp:${tag}/>나다`), p = r.getElementsByTagName("hp:p")[0]
    assert.deepEqual(buildPara(p).chars.map(c => c.ch), ["가", "", "나", "다"])
    reflowSection(r, parseRenderStyles(head), { BODY_W: 2000, BODY_H: 70000 })
    assert.deepEqual(Array.from(p.getElementsByTagName("hp:lineseg")).map(s => Number(s.getAttribute("textpos"))), [0, 3])
  })
  it("삭제된 선택 하이픈도 저장 좌표와 맞도록 슬롯을 남긴다", () => {
    const r = root('가<hp:deleteBegin/><hp:hypen/><hp:deleteEnd/>나')
    prepareDeletedRanges(r)
    assert.deepEqual(buildPara(r.getElementsByTagName("hp:p")[0]).chars.map(c => c.ch), ["가", "", "나"])
  })
  it("일반 하이픈 문자는 표시 글자로 유지한다", () => {
    const r = root("가-나")
    assert.deepEqual(buildPara(r.getElementsByTagName("hp:p")[0]).chars.map(c => c.ch), ["가", "-", "나"])
  })
})
