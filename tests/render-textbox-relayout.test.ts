import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const secPr = `<hp:secPr><hp:pagePr width="20000" height="20000"><hp:margin header="0" footer="0" left="2000" right="2000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr>`
async function render(body: string, reflow = false): Promise<string> {
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", `<hs:sec ${ns}>${body}</hs:sec>`)
  return (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }), { reflow })).pageSvgs.get(1) ?? ""
}

describe("render: 글상자와 쓸 수 없는 조판 캐시", () => {
  it("글 영역 폭(lastWidth)도 줄 정보도 없는 글상자는 도형 폭으로 조판해 글을 그린다", async () => {
    const rect = `<hp:rect textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/>` +
      `<hc:pt0 x="0" y="0"/><hc:pt1 x="10000" y="0"/><hc:pt2 x="10000" y="3000"/><hc:pt3 x="0" y="3000"/>` +
      `<hp:drawText><hp:textMargin left="0" right="0" top="0" bottom="0"/><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>통보</hp:t></hp:run></hp:p></hp:subList></hp:drawText></hp:rect>`
    const svg = await render(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${secPr}${rect}<hp:t/></hp:run></hp:p>`, true)
    const m = svg.match(/<text x="([-\d.]+)" y="([-\d.]+)"[^>]*>통보<\/text>/)
    assert.ok(m, "글상자 글")
    assert.equal(Number(m[1]), 20)
  })
  it("쪽 기준 좌표로 적힌 캐시(줄이 왼 여백 자리에서 시작해 본문 폭을 넘음)는 버리고 다시 조판한다", async () => {
    // 본문 폭 16000 — 줄 시작 2340(= 왼 여백 2000 + 340), 줄 끝 2340 + 15000 > 16000
    const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="2340" horzsize="15000"/></hp:linesegarray>`
    const paras = ["가", "나", "다", "라"].map((t, i) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${i === 0 ? secPr : ""}<hp:t>${t}</hp:t></hp:run>${seg(1000 + i * 1600)}</hp:p>`).join("")
    const svg = await render(paras)
    const m = svg.match(/<text x="([-\d.]+)" y="[-\d.]+"[^>]*>가<\/text>/)
    assert.ok(m, "첫 문단 글")
    // 캐시를 그대로 쓰면 왼 여백 + 줄 시작 = 43.4pt
    assert.equal(Number(m[1]), 20)
  })
})
