import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = (condense: number) => `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0" condense="${condense}"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`

// 왼쪽 정렬 한 줄 "가 나 다 라" — 저장 줄 폭이 자연 폭보다 150 좁다(공백 셋을 50 씩 줄여 한 줄에 넣은 저장본). 줄 글 폭 차(pt)
async function shrink(condense: number): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="40000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가 나 다 라</hp:t></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="WIDTH"/></hp:linesegarray></hp:p></hs:sec>`
  const render = async (w: number) => {
    const z = new JSZip()
    z.file("Contents/header.xml", head(condense)); z.file("Contents/section0.xml", sec.replace("WIDTH", String(w)))
    const svg = String((await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? "")
    return Number(svg.match(/textLength="([\d.]+)"[^>]*>가 나 다 라<\/text>/)?.[1] ?? NaN)
  }
  const wide = await render(39000)
  return (await render(Math.round(wide * 100) - 150)) - wide
}

describe("render: 늘이지 않는 줄이 넘칠 때", () => {
  it("왼쪽 정렬 줄도 자연 폭이 줄 폭을 넘으면 공백을 줄여 맞춘다(줄 글 1.5pt 좁게)", async () => {
    assert.ok(Math.abs(await shrink(25) + 1.5) < 0.05, String(await shrink(25)))
  })
  it("공백 최소값(condense)과 상관없이 같은 규칙 — 공백 최소값 0 문단도 넘치면 줄인다", async () => {
    assert.ok(Math.abs(await shrink(0) + 1.5) < 0.05, String(await shrink(0)))
  })
})
