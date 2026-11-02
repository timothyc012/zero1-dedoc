import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (tp: number, v: number, hs = 9000) => `<hp:lineseg textpos="${tp}" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="${hs}"/>`
// 셋째 줄(4000) 글 "다" 뒤에 앵커한 어울림 표(세로 오프셋 2000) — 칸 글 위치
async function cellY(before = "가나다", after = "", vo = 2000, firstW = 9000): Promise<number> {
  const cell = `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run><hp:linesegarray>${seg(0, 0)}</hp:linesegarray></hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="4000" height="2000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
  const tbl = `<hp:tbl rowCnt="1" colCnt="1" textWrap="SQUARE"><hp:sz width="4000" height="2000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="${vo}" horzOffset="14000"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>${before}</hp:t>${tbl}<hp:t>${after}</hp:t></hp:run>` +
    `<hp:linesegarray>${seg(0, 0, firstW)}${seg(1, 2000, firstW)}${seg(2, 4000)}</hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const y = (t: string) => Number(svg.match(new RegExp(`<text x="[-\\d.]+" y="([-\\d.]+)"[^>]*>${t}</text>`))?.[1])
  return y("표") - y("가")
}

describe("render: 첫 줄 뒤 줄에 앵커한 어울림 개체", () => {
  it("앵커 줄 위 + 세로 오프셋(4000 + 2000 = 첫 줄보다 60pt 아래)", async () => {
    assert.ok(Math.abs(await cellY() - 60) < 0.05, String(await cellY()))
  })
  it("문단 중간 글자 앵커에 첫 줄부터 앵커 줄만큼 좁게 저장됐으면 문단 위 + 세로 오프셋(10pt)", async () => {
    // 셋째 줄(4000) 글자 사이에 앵커, vertOffset 1000 — 종전엔 앵커 줄 40pt
    assert.ok(Math.abs(await cellY("가나", "다", 1000) - 10) < 0.05, String(await cellY("가나", "다", 1000)))
  })
  it("앞 줄이 넓으면(개체가 앵커 줄부터) 앵커 줄보다 위로 가지 않는다(40pt)", async () => {
    assert.ok(Math.abs(await cellY("가나", "다", 1000, 18000) - 40) < 0.05, String(await cellY("가나", "다", 1000, 18000)))
  })
})
