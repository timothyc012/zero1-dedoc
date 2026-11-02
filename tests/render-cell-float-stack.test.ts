import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const tc = (body: string, h: number) => `<hp:tc><hp:subList vertAlign="TOP">${body}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
const float = (t: string, vo: number, ho: number) => `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="4000" height="2000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="${vo}" horzOffset="${ho}"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
  `<hp:tr>${tc(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run>${seg(0)}</hp:p>`, 2000)}</hp:tr></hp:tbl>`
// 본문 둘째 문단의 인라인 표(칸 위 = 1600) — 칸 첫 문단에 위아래 표 둘(세로 오프셋 1000·5000, 높이 2000)과 그 아래로 밀린 줄 7000
async function ys(second: string): Promise<[number, number]> {
  const cellPara = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${float("위표", 1000, 0)}${second}<hp:t/></hp:run>${seg(7000)}</hp:p>`
  const outer = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="8600"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${tc(cellPara, 8600)}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${outer}<hp:t/></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="1600" vertsize="8600" textheight="8600" baseline="7310" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const y = (t: string) => Number(svg.match(new RegExp(`<text x="[-\\d.]+" y="([-\\d.]+)"[^>]*>${t}</text>`))?.[1])
  return [y("위표") - y("가"), y("아래표") - y("가")]
}

describe("render: 칸 안 한 문단의 위아래 개체 여럿", () => {
  it("가로로 겹치면 칸 위 + 제 세로 오프셋 자리에 차례로 쌓인다(16 + 10 = 26pt, 16 + 50 = 66pt)", async () => {
    const [a, b] = await ys(float("아래표", 5000, 0))
    assert.ok(Math.abs(a - 26) < 0.05 && Math.abs(b - 66) < 0.05, `${a} ${b}`)
  })
})
