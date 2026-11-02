import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const line = (pos: number, v: number) => `<hp:lineseg textpos="${pos}" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/>`
// 둘째 문단 첫 줄 30000(쪽 바닥 근처) 뒤 둘째 줄이 다음 쪽(저장 vertpos 0)으로 넘어갔고, 그 줄 첫 글자에 위아래 표가 앵커돼 있다
async function place(): Promise<{ p1: string; p2: string }> {
  const cell = `<hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표</hp:t></hp:run><hp:linesegarray>${line(0, 0)}</hp:linesegarray></hp:p></hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="1000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`
  const tbl = `<hp:tbl rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="1000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run><hp:linesegarray>${line(0, 0)}</hp:linesegarray></hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>나</hp:t>${tbl}<hp:t>다</hp:t></hp:run><hp:linesegarray>${line(0, 30000)}${line(1, 0)}</hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const pages = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs
  return { p1: String(pages.get(1) ?? ""), p2: String(pages.get(2) ?? "") }
}
const y = (svg: string, t: string) => Number(svg.match(new RegExp(`<text x="[-\\d.]+" y="([-\\d.]+)"[^>]*>${t}</text>`))?.[1])

describe("render: 다음 쪽 첫 줄로 넘어간 줄에 앵커한 위아래 개체", () => {
  it("앞 쪽, 그 줄이 이어졌을 자리(앞 줄 30000 + 줄 1000 + 간격 600)에 놓인다 — 다음 쪽 줄 자리(0)를 앞 쪽에 쓰지 않는다", async () => {
    const { p1, p2 } = await place()
    assert.ok(Math.abs(y(p1, "표") - y(p1, "가") - 316) < 0.05, `${y(p1, "표")} ${y(p1, "가")}`)
    assert.ok(!/>표</.test(p2))
    assert.ok(/>다</.test(p2))
  })
})
