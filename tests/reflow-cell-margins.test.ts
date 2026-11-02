import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"
import { collectCells } from "../src/render/para-model.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
function layout(margin: string, hasMargin = "1") {
  const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:tbl rowCnt="1" colCnt="1"><hp:sz width="10000" height="2000"/><hp:pos treatAsChar="1"/><hp:inMargin left="300" right="500" top="100" bottom="200"/><hp:tr><hp:tc hasMargin="${hasMargin}"><hp:subList><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다라마</hp:t></hp:run></hp:p></hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="2000"/>${margin}</hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>`
  const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 80000 })
  const cell = collectCells(root.getElementsByTagName("hp:tbl")[0])[0]
  return { margins: [cell.marginL, cell.marginR, cell.marginT, cell.marginB], lines: Array.from(cell.sub!.getElementsByTagName("hp:lineseg")).map(s => [Number(s.getAttribute("textpos")), Number(s.getAttribute("horzsize"))]) }
}

describe("표 칸 기본 여백", () => {
  for (const value of [32768, 65535]) it(`기본값 표지 ${value}는 표 여백으로 조판한다`, () => {
    assert.deepEqual(layout(`<hp:cellMargin left="${value}" right="${value}" top="${value}" bottom="${value}"/>`), { margins: [300, 500, 100, 200], lines: [[0, 9200]] })
  })
  it("부호 있는 -1 여백은 기본값으로 바꾸지 않는다", () => {
    assert.deepEqual(layout('<hp:cellMargin left="4294967295" right="850" top="4294967295" bottom="4294967295"/>'), { margins: [-1, 850, -1, -1], lines: [[0, 9148]] })
  })
  it("명시하지 않은 변은 표 여백을 사용하고 0은 그대로 둔다", () => {
    assert.deepEqual(layout('<hp:cellMargin left="0" top="0"/>'), { margins: [0, 500, 0, 200], lines: [[0, 9500]] })
  })
  it("hasMargin=0이면 칸 여백을 무시한다", () => {
    assert.deepEqual(layout('<hp:cellMargin left="800" right="900" top="600" bottom="700"/>', "0"), { margins: [300, 500, 100, 200], lines: [[0, 9200]] })
  })
  it("명시한 칸 여백은 유지한다", () => {
    assert.deepEqual(layout('<hp:cellMargin left="800" right="900" top="600" bottom="700"/>'), { margins: [800, 900, 600, 700], lines: [[0, 8300]] })
  })
})
