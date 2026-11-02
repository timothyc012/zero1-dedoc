import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="CENTER"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (tp: number, v: number) => `<hp:lineseg textpos="${tp}" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="19000"/>`
// 가운데 정렬 문단의 첫 줄 "가나다" 뒤 공백 + 강제 줄바꿈
async function firstX(t: string): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>${t}<hp:lineBreak/>라</hp:t></hp:run>` +
    `<hp:linesegarray>${seg(0, 0)}${seg([...t].length + 1, 1600)}</hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  return Number(svg.match(/<text x="([-\d.]+)"[^>]*>가나다/)?.[1])
}

describe("render: 강제 줄바꿈 앞 줄 끝 공백", () => {
  it("가운데 정렬은 강제 줄바꿈 앞 공백을 빼고 맞춘다 — 공백 없는 줄과 같은 자리", async () => {
    assert.ok(Math.abs(await firstX("가나다 ") - await firstX("가나다")) < 0.05)
  })
})
