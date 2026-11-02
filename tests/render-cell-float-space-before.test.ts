import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr>` +
  `<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="500" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const tc = (body: string, w: number, h: number) => `<hp:tc><hp:subList vertAlign="TOP">${body}</hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="${w}" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`

// 바깥 칸 첫 문단(위 간격 500, 줄 500)에 앵커한 vertOffset 0 글 뒤 표 — 표 글과 문단 글의 세로 차
async function dy(): Promise<number> {
  const inner = `<hp:tbl rowCnt="1" colCnt="1" textWrap="BEHIND_TEXT"><hp:sz width="3000" height="1000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="5000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:tr>${tc(`<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run>${seg(0)}</hp:p>`, 3000, 1000)}</hp:tr></hp:tbl>`
  const outer = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="3000"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
    `<hp:tr>${tc(`<hp:p paraPrIDRef="1"><hp:run charPrIDRef="0">${inner}<hp:t>가</hp:t></hp:run>${seg(500)}</hp:p>`, 10000, 3000)}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr>${outer}<hp:t/></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="3000" textheight="3000" baseline="2550" spacing="600" horzpos="0" horzsize="19000"/></hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const y = (t: string) => Number(svg.match(new RegExp(`<text x="[-\\d.]+" y="([-\\d.]+)"[^>]*>${t}</text>`))?.[1])
  return y("표") - y("가")
}

describe("render: 칸 안 문단에 앵커한 글 뒤 개체의 원점", () => {
  it("위 간격 앞(칸 안 문단 영역 위)에서 잰다 — 줄(위 간격 뒤)보다 5pt 위", async () => {
    const d = await dy()
    assert.ok(Math.abs(d + 5) < 0.05, String(d))
  })
})
