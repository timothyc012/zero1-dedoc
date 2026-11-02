import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr><hh:charPr id="1" height="1000"><hh:fontRef hangul="0"/><hh:bold/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (tp: number, v: number, w: number) => `<hp:lineseg textpos="${tp}" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="${w}"/>`

// 양쪽 정렬 두 줄 문단의 첫 줄 "가나다라 마바사아|자차카타" — 함초롬바탕 한글 972·빈칸 500, 자연 폭 12,164. 둘째 run 의 x(pt)
async function secondRunX(width: number): Promise<number> {
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="40000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>머리</hp:t></hp:run><hp:linesegarray>${seg(0, 0, 30000)}</hp:linesegarray></hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다라 마바사아</hp:t></hp:run><hp:run charPrIDRef="1"><hp:t>자차카타</hp:t></hp:run><hp:run charPrIDRef="0"><hp:t>파하</hp:t></hp:run>` +
    `<hp:linesegarray>${seg(0, 1600, width)}${seg(13, 3200, width)}</hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = String((await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? "")
  return Number(svg.match(/<text x="([\d.]+)"[^>]*>자차카타<\/text>/)?.[1])
}

describe("render: 넘친 양쪽 정렬 줄 줄이기", () => {
  it("남는 폭은 빈칸에만 나눈다(+336)", async () => {
    assert.ok(Math.abs(await secondRunX(12500) - (5 + (8276 + 336) / 100)) < 0.01)
  })
  it("모자라면 빈칸은 제 폭의 20% 까지만, 나머지는 글자마다 똑같이(모자람 1164 → 빈칸 −100, 글자 12개 −88.67)", async () => {
    const x = await secondRunX(11000)
    assert.ok(Math.abs(x - (5 + (8276 - 100 - 8 * 1064 / 12) / 100)) < 0.01, String(x))
  })
})

describe("render: 넘친 가운데 정렬 줄", () => {
  it("빈칸 없는 가운데 정렬 마지막 줄도 모자람을 글자마다 똑같이 줄인다", async () => {
    const ns2 = ns
    const head2 = head.replace('<hh:align horizontal="JUSTIFY"/>', '<hh:align horizontal="CENTER"/>')
    const sec = `<hs:sec ${ns2}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="40000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>머리</hp:t></hp:run><hp:linesegarray>${seg(0, 0, 30000)}</hp:linesegarray></hp:p>` +
      `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가나다라</hp:t></hp:run><hp:run charPrIDRef="1"><hp:t>마바</hp:t></hp:run><hp:linesegarray>${seg(0, 1600, 5232)}</hp:linesegarray></hp:p></hs:sec>`
    const z = new JSZip()
    z.file("Contents/header.xml", head2); z.file("Contents/section0.xml", sec)
    const svg = String((await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? "")
    // 자연 폭 5832(972 × 6) 이 줄 폭 5232 를 600 넘친다 — 글자 6개 −100, 둘째 run 은 줄 시작 + (972 − 100) × 4
    const x = Number(svg.match(/<text x="([\d.]+)"[^>]*>마바<\/text>/)?.[1])
    assert.ok(Math.abs(x - (5 + (972 - 100) * 4 / 100)) < 0.01, String(x))
  })
})
