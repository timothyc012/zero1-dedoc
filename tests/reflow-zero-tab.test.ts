import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { DEFAULT_PARA_GEOM, parseRenderStyles } from "../src/render/head-styles.js"
import { buildPara, tabAdvance } from "../src/render/para-model.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = `xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"`
const para = (attr: string) => `<hp:p ${NS} paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가<hp:tab ${attr}/>나다</hp:t></hp:run></hp:p>`
const model = (attr: string) => buildPara(createXmlParser().parseFromString(para(attr), "text/xml").documentElement as unknown as Element)

describe("저장 폭이 0인 탭", () => {
  it("명시된 0폭과 폭 속성이 없는 탭을 구별하고 8슬롯은 유지한다", () => {
    assert.equal(model('width="0"').chars[1].tabW, 0)
    assert.equal(model("").chars[1].tabW, undefined)
    assert.equal(model('width="0"').chars.length, 11)
  })
  it("명시된 0폭을 기본 탭 정지점으로 늘리지 않는다", () => {
    // 실제 PDF: ○ 14.04pt + 공백 6.96pt 뒤 첫 본문까지 21pt, 추가 탭 폭은 0.
    assert.equal(tabAdvance(2100, true, undefined, 0), 0)
  })
  it("누락된 폭은 기본 정지점을 쓰고 양수 저장 폭은 유지한다", () => {
    assert.equal(tabAdvance(2100, true, undefined), 1900)
    assert.equal(tabAdvance(2100, true, undefined, 700), 700)
    assert.equal(tabAdvance(4000, false, undefined), 4000)
  })
  it("음수·잘못된 폭을 명시적 0폭으로 바꾸지 않는다", () => {
    for (const attr of ['width="-1"', 'width="bad"', 'width=""']) {
      assert.equal(tabAdvance(2100, true, undefined, model(attr).chars[1].tabW), 1900)
    }
  })
  it("오른쪽 탭의 저장 폭과 종류 표지를 함께 보존한다", () => {
    const c = model('width="0" type="2"').chars[1]
    assert.equal(c.tabRight, true)
    assert.equal(tabAdvance(2100, true, undefined, c.tabW), 0)
  })
  it("첫 줄의 내어쓰기 자동 탭 우선순위는 유지한다", () => {
    const geom = { ...DEFAULT_PARA_GEOM, marginIntent: -2250, autoTabLeft: true }
    assert.equal(tabAdvance(1500, true, geom, 0), 750)
    assert.equal(tabAdvance(1500, true, geom, 999), 750)
    assert.equal(tabAdvance(1500, false, geom, 0), 0)
  })
  it("0폭 탭이 차지하는 제어 슬롯 때문에 본문을 다음 줄로 밀지 않는다", () => {
    const head = `<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="명조"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:head>`
    const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${para('width="0"')}</hs:sec>`, "text/xml").documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 3000, BODY_H: 80000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg"), s => s.getAttribute("textpos"))
    assert.deepEqual(segs, ["0"])
  })
})
