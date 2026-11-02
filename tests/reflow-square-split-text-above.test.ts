import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/><hh:lineSpacing type="PERCENT" value="100" unit="HWPUNIT"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`

/** 글 두 문단 뒤 앵커 글 한 줄 문단 — 온 폭 어울림 칸 안 나눔 표(4행 × 3000)가 쪽(10000)을 넘는다. [앵커 줄, 다음 문단] vertpos */
function place(vertOffset: string): string[] {
  const row = (r: number) => `<hp:tr><hp:tc><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸${r}</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="42000" height="3000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr>`
  const tbl = `<hp:tbl textWrap="SQUARE" pageBreak="CELL" rowCnt="4" colCnt="1"><hp:sz width="42000" height="12000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="${vertOffset}" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${[0, 1, 2, 3].map(row).join("")}</hp:tbl>`
  const filler = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`.repeat(2)
  const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${filler}<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t>앵커</hp:t></hp:run></hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>다음</hp:t></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 10000 })
  const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
  return [ps[2], ps[3]].map(p => Array.from(p.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!.getElementsByTagName("hp:lineseg")[0].getAttribute("vertpos")!)
}
describe("쪽을 넘는 온 폭 어울림 표와 앵커 글", () => {
  it("표가 글 줄 아래에 붙으면(세로 오프셋 1500) 글은 제자리, 다음 문단만 다음 쪽 표 나머지 아래", () => {
    assert.deepEqual(place("1500"), ["2000", "6000"])
  })
  it("표가 문단 위에 붙으면(오프셋 0) 글은 마지막 쪽 표 나머지 아래로", () => {
    assert.deepEqual(place("0"), ["3000", "4000"])
  })
})
