import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { renderHwpxToSvg } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:tabProperties><hh:tabPr id="1" autoTabLeft="1" autoTabRight="0"/></hh:tabProperties>` +
  `<hh:paraProperties><hh:paraPr id="0" tabPrIDRef="1"><hh:align horizontal="LEFT"/><hh:margin><hc:intent value="-4000" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties></hh:head>`
const rect = `<hp:rect><hp:sz width="1000" height="900"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:rect>`
async function tabbedX(withRect: boolean): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="10000"><hp:margin left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr>${withRect ? rect : ""}<hp:t>가<hp:tab width="500"/>나다</hp:t></hp:run></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const { svg } = await renderHwpxToSvg(await z.generateAsync({ type: "uint8array" }), { reflow: true })
  const doc = createXmlParser().parseFromString(svg, "image/svg+xml")
  const t = Array.from(doc.getElementsByTagName("text")).find(e => e.textContent?.includes("나"))
  assert.ok(t, "탭 뒤 글")
  return Number(t.getAttribute("x"))
}
describe("글자처럼 취급하는 개체 뒤 내어쓰기 자동 탭", () => {
  it("탭 앞 x 에 개체 폭을 넣어 탭 뒤 글이 내어쓰기 위치에서 시작한다", async () => {
    // 개체 1000 + "가" 1000 뒤 탭은 내어쓰기 4000 까지 2000 — 개체 없는 줄의 탭 뒤 글과 같은 자리
    assert.equal(await tabbedX(true), await tabbedX(false))
  })
})
