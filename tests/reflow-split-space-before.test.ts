import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = (prev: number) => `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr><hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:margin><hc:prev value="${prev}" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`

// 앞 문단 한 줄 뒤, 위 여백 있는 문단의 칸 안 나눔 표(칸 줄 6개)가 쪽 바닥을 넘는다 — 표 뒤 문단이 다음 쪽 어디서 시작하는지
function nextParaTop(prev: number): number {
  const paras = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`.repeat(6)
  const tbl = `<hp:tbl textWrap="TOP_AND_BOTTOM" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="10000" height="10000"/><hp:pos treatAsChar="0" vertRelTo="PARA" vertOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr><hp:tc><hp:subList>${paras}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="10000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
  const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>앞</hp:t></hp:run></hp:p><hp:p paraPrIDRef="1"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`
  const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head(prev)), { BODY_W: 42000, BODY_H: 8000 })
  const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
  return Number(ps[2].getElementsByTagName("hp:lineseg")[0].getAttribute("vertpos"))
}
describe("문단 위 여백과 쪽에서 갈리는 떠 있는 표", () => {
  it("표는 문단 위 여백 앞에서 가른다 — 위 여백이 있어도 다음 쪽 몫이 같다", () => {
    const base = nextParaTop(0)
    assert.ok(base > 0, `표 뒤 문단은 다음 쪽 남은 칸 줄 아래(${base})`)
    assert.equal(nextParaTop(1500), base)
  })
})
