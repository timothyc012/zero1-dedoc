import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
// 앞 문단 끝 1600. 글 없는 다음 문단의 위아래 표(vertOffset 750, 바깥 위·아래 283, 높이 3000) — 표에 밀린 줄은 1600 + 750 + 283 + 3000 + 283 = 5916
async function gap(lineV: number): Promise<number> {
  const cell = `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run>${seg(0)}</hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
  const tbl = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="3000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="750" horzOffset="0"/><hp:outMargin left="0" right="0" top="283" bottom="283"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${seg(lineV)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const y = (t: string) => Number(svg.match(new RegExp(`<text x="[-\\d.]+" y="([-\\d.]+)"[^>]*>${t}</text>`))?.[1])
  return y("표") - y("가")
}

describe("render: 아래 오프셋 있는 표에 밀린 빈 문단 줄", () => {
  it("밀린 줄(5916)이면 표는 앞 문단 끝 + 오프셋 + 바깥 위(1600 + 750 + 283 = 26.33pt) — 줄 자리에 두지 않는다", async () => {
    assert.ok(Math.abs(await gap(5916) - 26.33) < 0.05, String(await gap(5916)))
  })
  it("제자리 줄(1600)이면 종전대로 줄 위치 + 오프셋", async () => {
    assert.ok(Math.abs(await gap(1600) - 26.33) < 0.05, String(await gap(1600)))
  })
})
