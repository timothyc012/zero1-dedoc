import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const tc = (sub: string, h: number) => `<hp:tc><hp:subList vertAlign="TOP">${sub}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
// 바깥 칸: 글 문단(줄 0, 끝 1600) + 빈 문단(위아래 배치 표 3000, 저장 줄 = 1600 + 3000 = 4600)
async function innerTextY(lineV: number): Promise<number> {
  const inner = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="8000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:tr>${tc(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>안쪽표</hp:t></hp:run>${seg(0)}</hp:p>`, 3000)}</hp:tr></hp:tbl>`
  const sub = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t/></hp:run>${seg(lineV)}</hp:p>`
  const outer = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="6000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${tc(sub, 6000)}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr>${outer}<hp:t/></hp:run>${seg(0)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const m = svg.match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>안쪽표<\/text>/)
  assert.ok(m, "안쪽 표 글")
  return Number(m[1])
}

describe("render: 칸 안 빈 문단의 위아래 표와 표에 밀려 저장된 줄", () => {
  it("줄이 칸 안 앞 문단 끝 + 표 높이에 저장됐으면 표는 줄 위(앞 문단 끝)에 놓인다 — 제자리 줄과 같은 자리", async () => {
    const stay = await innerTextY(1600)
    // 줄 4600 = 앞 문단 끝 1600 + 표 3000. 줄 자리에 두면 표가 30pt 아래로 밀린다
    assert.ok(Math.abs(await innerTextY(4600) - stay) < 0.05)
  })
})
