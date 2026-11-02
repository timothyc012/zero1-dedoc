import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
async function drawnWidth(text: string): Promise<number> {
  const seg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="18000"/></hp:linesegarray>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="20000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr><hp:t>${text}</hp:t></hp:run>${seg}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const m = svg.match(/<text [^>]*textLength="([\d.]+)"[^>]*>/)
  assert.ok(m, "글 줄")
  return Number(m[1])
}

describe("render: 옛한글 자모 폭", () => {
  it("첫소리 뒤 가운뎃소리·끝소리 자모는 한 글자로 합쳐 잰다 — 조판(reflow)과 같은 폭", async () => {
    // ᄒ+ᆞ+ᆫ = 한 글자 몫: 종전엔 자모 셋을 따로 재 두 글자 몫만큼 넓게 그렸다
    assert.equal(await drawnWidth("ᄒᆞᆫ글"), await drawnWidth("ᄒ글"))
  })
})
