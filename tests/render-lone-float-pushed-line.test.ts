import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
// 글 없는 문단의 위아래 표(sz 30000) — 앞 문단은 1600 에서 끝난다
async function cellTextY(lineV: number): Promise<number> {
  const cell = `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run>${seg(0)}</hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="30000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
  const tbl = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="30000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${seg(lineV)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  const m = (r.pageSvgs.get(1) ?? "").match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>표<\/text>/)
  assert.ok(m, "첫 쪽의 표 칸 글")
  return Number(m[1])
}

describe("render: 글 없는 문단의 떠 있는 개체와 개체에 밀려 저장된 줄", () => {
  it("줄이 앞 문단 끝 + 개체 높이에 저장됐으면 개체는 줄 위(앞 문단 끝)에 놓인다 — 제자리 줄과 같은 자리", async () => {
    const stay = await cellTextY(1600)
    // 줄 31600 = 앞 문단 끝 1600 + 표 30000. 줄 자리에 두면 표가 300pt 아래로 밀린다
    assert.ok(Math.abs(await cellTextY(31600) - stay) < 0.05)
    assert.ok(stay < 40, `표 칸 글 ${stay} 이 앞 문단 바로 아래`)
  })
})
