import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"
import { appendNarrowLineFragments } from "../src/render/reflow-fragments.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
describe("어울림 줄의 좁은 앞 조각", () => {
  it("공백을 왼쪽에 놓고 여러 물리줄의 비어 있는 왼쪽 조각을 보존한다", () => {
    const head = `<hh:head ${ns}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="굴림체"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="2800"/><hh:charPr id="1" height="1000"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
    const pic = '<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="700" height="20000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" horzOffset="2000"/></hp:pic>'
    const doc = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="1">${pic}<hp:t> </hp:t></hp:run><hp:run charPrIDRef="0"><hp:t>우리나라</hp:t></hp:run></hp:p></hs:sec>`, "text/xml")
    const root = doc.documentElement as unknown as Element
    reflowSection(root, parseRenderStyles(head), { BODY_W: 6200, BODY_H: 70000 })
    const segs = Array.from(root.getElementsByTagName("hp:lineseg"))
    assert.deepEqual(segs.map(s => Number(s.getAttribute("textpos"))), [0, 9, 10, 10, 11, 11, 12, 12])
    assert.deepEqual(segs.map(s => Number(s.getAttribute("horzpos"))), [0, 2700, 0, 2700, 0, 2700, 0, 2700])
    assert.deepEqual(segs.map(s => Number(s.getAttribute("vertpos"))), [0, 0, 4480, 4480, 8960, 8960, 13440, 13440])
  })
  for (const [name, text, widths, end] of [
    ["NBSP", "\u00a0가나", [500, 2800, 2800], 2],
    ["탭", "\t가나", [500, 2800, 2800], 2],
    ["인라인 개체", " \ufffc나", [500, 2800, 2800], 2],
    ["왼쪽에도 들어가는 글자", " 가나", [500, 1500, 2800], 2],
    ["다음 줄 글자가 추가로 들어감", " 가나", [500, 2800, 500], 2],
    ["압축이 필요한 글", " 가나", [500, 3600, 2800], 2],
  ] as const) it(`${name}은 기존 줄 배치를 유지한다`, () => {
    const doc = createXmlParser().parseFromString('<hp:linesegarray xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"/>', "text/xml")
    const seg = doc.createElement("hp:lineseg"); seg.setAttribute("textpos", "0")
    assert.equal(appendNarrowLineFragments(doc.documentElement as unknown as Element, seg as unknown as Element, [[0, 2000], [2700, 6200]], [2700, 3500],
      { text, widths: [...widths], spacings: [0, 0, 0], slots: [0, 1, 2], start: 0, end }), false)
    assert.equal(doc.documentElement!.childNodes.length, 0)
  })
})
