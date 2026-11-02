import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { glyphWidth } from "../src/render/reflow.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
// 자간 −20% 글자 모양, 가운데 정렬 문단
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="2000"><hh:fontRef hangul="0"/><hh:spacing hangul="-20" latin="-20" hanja="-20" japanese="-20" other="-20" symbol="-20" user="-20"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="CENTER"/></hh:paraPr></hh:paraProperties></hh:head>`

describe("render: 줄 끝 글자의 자간", () => {
  it("가운데 정렬 줄 폭은 마지막 글자 뒤 자간을 빼고 잰다 — 한컴은 줄 끝 글자 뒤에 자간을 두지 않는다", async () => {
    const seg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="2000" textheight="2000" baseline="1700" spacing="600" horzpos="0" horzsize="18000"/></hp:linesegarray>`
    const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="20000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr><hp:t>가나다</hp:t></hp:run>${seg}</hp:p></hs:sec>`
    const z = new JSZip()
    z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
    const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
    const m = svg.match(/<text x="([-\d.]+)"[^>]*>가나다<\/text>/)
    assert.ok(m, "가운데 정렬 줄")
    const st = parseRenderStyles(head).charPr.get("0")!
    const ws = [..."가나다"].map(ch => glyphWidth(ch, st))
    const w = ws.reduce((a, g) => a + g.w, 0) - ws[2].sp
    assert.ok(ws[2].sp < 0, "자간 몫")
    assert.ok(Math.abs(Number(m[1]) - (1000 + (18000 - w) / 2) / 100) < 0.02, `줄 시작 ${m[1]}`)
  })
})
