import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
// 아래 가운데 쪽 번호 — 왼 여백 2000·오른 여백 4000 쪽
async function numberCenter(left: number, right: number): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="${left}" right="${right}" top="500" bottom="500"/></hp:pagePr></hp:secPr>` +
    `<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar=""/></hp:ctrl><hp:t>가</hp:t></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  return Number(svg.match(/<text x="([-\d.]+)"[^>]*>1<\/text>/)?.[1])
}

describe("render: 아래 가운데 쪽 번호", () => {
  it("본문 영역 가운데 — 오른 여백이 2000 크면 용지 가운데보다 10pt 왼쪽", async () => {
    assert.ok(Math.abs(await numberCenter(2000, 2000) - await numberCenter(2000, 4000) - 10) < 0.05)
  })
})
