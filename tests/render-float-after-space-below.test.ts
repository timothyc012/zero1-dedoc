import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
// 문단 모양 1 = 아래 간격 600
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr>` +
  `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:next value="600" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
// 앞 문단(아래 간격 600)은 1600 에서 끝나고 다음 문단 줄은 2200. 그 문단의 위아래 표(vertOffset 3000)는 줄을 밀지 않는다
async function cellTextY(prevPr: number, lineV: number): Promise<number> {
  const cell = `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run>${seg(0)}</hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="5000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
  const tbl = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="3000" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="${prevPr}"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t>나</hp:t></hp:run>${seg(lineV)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  const m = (r.pageSvgs.get(1) ?? "").match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>표<\/text>/)
  assert.ok(m, "첫 쪽의 표 칸 글")
  return Number(m[1])
}

describe("render: 앞 문단 아래 간격 뒤 문단의 떠 있는 표", () => {
  it("문단 영역 위는 앞 문단 끝 + 앞 문단 아래 간격 — 표는 그 자리 + vertOffset", async () => {
    // 아래 간격 없는 앞 문단(줄 1600) 의 표와 같은 자리여야 한다: 1600 + 600 = 2200 기준
    const withSA = await cellTextY(1, 2200), plain = await cellTextY(0, 1600)
    assert.ok(Math.abs(withSA - (plain + 6)) < 0.05, `아래 간격 600 = 6pt 아래 (${withSA} vs ${plain})`)
  })
})
