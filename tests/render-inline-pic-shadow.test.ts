import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`

// 글자처럼 취급한 10000 사진 하나뿐인 줄 — 줄 높이 11000, 기준선 9350(= 0.85 × 11000). 사진 바이너리는 없어 자리 상자로 그린다
async function picY(shadow: boolean): Promise<number> {
  const fx = shadow ? `<hp:effects><hp:shadow style="OUTSIDE" alpha="0.5" radius="300" direction="90" distance="300"/></hp:effects>` : ""
  const pic = `<hp:pic textWrap="TOP_AND_BOTTOM">${fx}<hp:sz width="10000" height="10000"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hc:img binaryItemIDRef="none"/></hp:pic>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr>${pic}<hp:t/></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="11000" textheight="11000" baseline="9350" spacing="600" horzpos="0" horzsize="19000"/></hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = String((await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? "")
  return Number(svg.match(/<rect x="[-\d.]+" y="([-\d.]+)" width="100" height="100" fill="#eee"/)?.[1])
}

describe("render: 그림자 있는 인라인 사진", () => {
  it("줄이 그림자까지 든 높이로 짜였으면(기준선 = 줄 높이 85%) 사진은 줄 맨 위", async () => {
    assert.equal(await picY(true), 5)
  })
  it("그림자가 없으면 종전대로 기준선 위에 사진 높이 85% 를 얹는다", async () => {
    assert.equal(await picY(false), 13.5)
  })
})
