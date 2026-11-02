import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${ns}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"/></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
function wrapped(top: number, prefix = " ".repeat(34)) {
  const float = `<hp:pic textWrap="SQUARE" textFlow="BOTH_SIDES"><hp:sz width="17291" height="2834"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="COLUMN" vertAlign="TOP" horzAlign="LEFT" vertOffset="${top}" horzOffset="382"/></hp:pic>`
  const inline = '<hp:pic><hp:sz width="17552" height="2885"/><hp:pos treatAsChar="1"/></hp:pic>'
  const doc = createXmlParser().parseFromString(`<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${float}<hp:t>${prefix}</hp:t>${inline}</hp:run></hp:p></hs:sec>`, "text/xml")
  const root = doc.documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 48760, BODY_H: 70000 })
  return Array.from(root.getElementsByTagName("hp:lineseg")).map(s => Object.fromEntries(["textpos", "vertpos", "vertsize", "textheight", "horzpos", "horzsize"].map(a => [a, Number(s.getAttribute(a))])))
}

describe("인라인 그림 높이와 어울림 영역", () => {
  it("글자보다 아래서 시작한 영역도 큰 인라인 그림과 겹치면 줄을 좁힌다", () => {
    const lines = wrapped(1105)
    assert.equal(lines.length, 2)
    assert.deepEqual(lines.map(s => s.horzpos), [17673, 17673])
    assert.deepEqual(lines.map(s => s.horzsize), [31087, 31087])
    assert.equal(lines[0].vertsize, 2885)
    assert.equal(lines[0].textheight, 1000)
    assert.equal(lines[1].textheight, 2885)
    assert.deepEqual(lines.map(s => s.vertpos), [0, 1600])
  })
  it("그림 높이보다 아래인 영역은 한 줄을 불필요하게 나누지 않는다", () => {
    const lines = wrapped(4000)
    assert.equal(lines.length, 1)
    assert.equal(lines[0].horzsize, 48760)
  })
  it("뒤쪽 줄의 큰 그림은 앞줄의 충돌 높이를 늘리지 않는다", () => {
    const lines = wrapped(1105, "가".repeat(80))
    assert.equal(lines[0].horzpos, 0)
    assert.equal(lines[0].vertsize, 1000)
  })
})
