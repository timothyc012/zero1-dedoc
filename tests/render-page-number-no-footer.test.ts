import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
async function pageNumberY(footer: number): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="59528" height="84189"><hp:margin header="0" footer="${footer}" left="5669" right="5669" top="5669" bottom="2834"/></hp:pagePr></hp:secPr>` +
    `<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl><hp:t>가</hp:t></hp:run>${seg}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const m = svg.match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>- 1 -<\/text>/)
  assert.ok(m, "쪽 번호")
  return Number(m[1])
}

describe("render: 아래쪽 쪽 번호의 세로 자리", () => {
  it("꼬리말 영역이 있으면 아래 여백 위(꼬리말 영역 바닥), 꼬리말이 0 이면 아래 여백 가운데 위", async () => {
    // 쪽 841.89pt·아래 여백 28.34pt — 꼬리말 0: 한컴 PDF 기준선 825.3(쪽 바닥 − 16.6)
    assert.ok(Math.abs(await pageNumberY(0) - 825.3) < 0.1)
    assert.ok(Math.abs(await pageNumberY(1417) - (841.89 - 28.34 - 2.25)) < 0.1)
  })
})
