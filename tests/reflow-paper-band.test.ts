/**
 * 용지 기준 위 정렬 위아래 배치 개체 — 같은 쪽 뒤 글이 겹치지 못하는 온 폭 띠.
 * 한컴 PDF: 용지 위 48283 에 놓인 높이 27084 그림(위아래 배치)에 닿는 문단이 그림 아래로 밀려 새 쪽 800 에서 시작했다
 * (법무부·우정사업본부 보도자료). 종전엔 용지·쪽 기준 위아래 개체를 글 흐름에서 빼 그림 자리에 글을 겹쳤다. 아래는 그 구조를 줄인 합성본이다.
 */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"

const NS = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
const head = `<hh:head ${NS}><hh:refList><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="바탕"/></hh:fontface></hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`

/** 본문 위 여백 5668 인 쪽 — 첫 문단에 용지 위 5668 + offset 에 놓인 높이 4000 그림, 뒤에 글 문단 넷 */
function firstLines(vertAlign: string, offset: number): number[] {
  const pic = `<hp:pic textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="4000"/><hp:pos treatAsChar="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="${vertAlign}" horzAlign="LEFT" vertOffset="${5668 + offset}" horzOffset="8504"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>`
  const para = (t: string) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run></hp:p>`
  const xml = `<hs:sec ${NS}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${pic}<hp:t>가</hp:t></hp:run></hp:p>${["나", "다", "라", "마"].map(para).join("")}</hs:sec>`
  const root = createXmlParser().parseFromString(xml, "text/xml").documentElement as unknown as Element
  reflowSection(root, parseRenderStyles(head), { BODY_W: 42000, BODY_H: 20000 })
  return Array.from(root.childNodes as unknown as Element[]).filter(c => c.nodeName === "hp:p").map(p => {
    const lsa = Array.from(p.childNodes as unknown as Element[]).find(c => c.nodeName === "hp:linesegarray")!
    return Number(lsa.getElementsByTagName("hp:lineseg")[0].getAttribute("vertpos"))
  })
}

describe("용지 기준 위 정렬 위아래 배치 개체는 온 폭 띠", () => {
  it("띠에 닿는 문단부터 띠 아래로 — 띠 위에서 끝나는 문단은 제자리", () => {
    const v = firstLines("TOP", 3000)
    // 띠 3000~7000: 띠 위 문단은 그대로, 띠에 닿는 셋째 문단부터 7000 아래
    assert.ok(v[1] + 1000 <= 3000, `둘째 문단 ${v[1]} 은 띠 위`)
    assert.equal(v[2], 7000)
    assert.ok(v[3] > 7000)
  })
  it("아래 정렬은 대상이 아니다(쪽 아래 직인 등) — 흐름을 밀지 않는다", () => {
    const v = firstLines("BOTTOM", 3000)
    assert.ok(v[2] < 7000)
  })
})
