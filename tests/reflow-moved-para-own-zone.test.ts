/**
 * 다음 쪽으로 옮기는 문단의 제 개체 영역 — 옛 자리에서 넣은 영역을 넘어간 개체로 들고 가지 않는다.
 * 한컴 PDF: 쪽 나누기 빈 문단의 어울림 표(55942, 세로 오프셋 −76437)가 새 쪽 맨 위, 빈 줄도 0(마약류대책협의회 보도자료 연락처 표).
 * 종전엔 옛 자리에서 쪽 바닥을 넘은 제 표가 새 쪽 위를 막아 줄이 표 아래(55942 + 바깥 아래 141)로 밀렸다. 아래는 그 구조를 줄인 합성본이다.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`

/** 글 다섯 문단 뒤 쪽 나누기 빈 문단 — 온 폭 어울림 표 6000 은 옛 자리(쪽 바닥 근처)에 안 든다 */
function hostLine(vertOffset: string): number[] {
  const cell = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>칸</hp:t></hp:run></hp:p>`
  const tbl = `<hp:tbl textWrap="SQUARE" pageBreak="CELL" rowCnt="1" colCnt="1"><hp:sz width="42000" height="6000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="${vertOffset}" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="141"/><hp:tr><hp:tc><hp:subList>${cell}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="42000" height="6000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc></hp:tr></hp:tbl>`
  const filler = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run></hp:p>`.repeat(5)
  const root = createXmlParser().parseFromString(`<hs:sec ${NS}>${filler}<hp:p paraPrIDRef="0" pageBreak="1"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run></hp:p></hs:sec>`, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 10000 })
  const ps = Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p")
  const own = Array.from(ps[5].childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
  return Array.from(own.getElementsByTagName("hp:lineseg"), s => Number(s.getAttribute("vertpos")))
}

describe("다음 쪽으로 옮기는 문단의 제 개체 영역", () => {
  it("쪽 나누기 빈 문단은 제 어울림 표와 함께 새 쪽 맨 위 — 줄을 표 아래로 밀지 않는다", () => {
    assert.deepEqual(hostLine("0"), [0])
  })
  it("위로 올린 표(세로 오프셋 음수, 부호 없는 32비트 저장)도 같다", () => {
    assert.deepEqual(hostLine("4294890859"), [0])
  })
})
