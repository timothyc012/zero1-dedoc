import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { reflowSection } from "../src/render/reflow.js"
import { hasKoPubSubst, kopubSubstituted } from "../src/render/font-env.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const font = `<hh:font id="0" face="KoPub돋움체 Light" type="TTF" isEmbedded="0"><hh:substFont face="한컴바탕" type="TTF" isEmbedded="0" binaryItemIDRef=""/></hh:font>`
const head = `<hh:head ${ns}><hh:refList><hh:fontfaces>` + ["HANGUL", "LATIN", "HANJA", "JAPANESE", "OTHER", "SYMBOL", "USER"].map(l => `<hh:fontface lang="${l}" fontCnt="1">${font}</hh:fontface>`).join("") +
  `</hh:fontfaces><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr></hh:paraProperties></hh:refList></hh:head>`
const text = "대한민국 행정기관의 공문서는 정해진 서식과 표기 원칙에 따라 작성하여야 하며 누구나 쉽게 읽을 수 있도록 간결하게 쓴다"
const section = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="80000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000" gutter="0"/></hp:pagePr></hp:secPr></hp:run></hp:p>` +
  Array.from({ length: 30 }, (_, k) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${text.slice(k % 5)} ${k}</hp:t></hp:run></hp:p>`).join("") + `</hs:sec>`
const base = parseRenderStyles(head), alt = parseRenderStyles(head, { substKoPub: true })
/** 그 폭으로 꺾어 저장한 구역 XML */
function saved(styles: typeof base): string {
  const root = createXmlParser().parseFromString(section, "text/xml").documentElement as unknown as Element
  reflowSection(root, styles, { BODY_W: 18000, BODY_H: 78000 })
  return root.toString()
}

describe("render: KoPub 대체 글꼴 환경 추정", () => {
  it("KoPub 글꼴 항목의 대체 글꼴 표기를 찾는다", () => {
    assert.equal(hasKoPubSubst(head), true)
    assert.equal(hasKoPubSubst(head.replace(/<hh:substFont[^>]*\/>/g, "")), false)
  })
  it("대체 글꼴 폭으로 꺾어 저장된 문서는 대체 글꼴로 본다", () => {
    assert.equal(kopubSubstituted([saved(alt)], base, alt), true)
  })
  it("KoPub 폭으로 꺾어 저장된 문서는 그대로", () => {
    assert.equal(kopubSubstituted([saved(base)], base, alt), false)
  })
})
