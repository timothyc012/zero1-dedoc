import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const tc = (r: number, sub: string, h: number) => `<hp:tc><hp:subList vertAlign="TOP">${sub}</hp:subList><hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="8000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`

describe("render: 갈라 저장되지 않은 칸 안의 쪽을 넘는 표", () => {
  it("칸 줄에 앵커한 떠 있는 표(행 20개 × 3000, 저장 sz 는 첫 쪽 조각 30000)가 쪽을 넘으면 칸과 표가 다음 쪽으로 이어진다", async () => {
    const rows = [...Array(20).keys()].map(r => `<hp:tr>${tc(r, `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>행${r}번</hp:t></hp:run>${seg(0)}</hp:p>`, 3000)}</hp:tr>`).join("")
    const inner = `<hp:tbl rowCnt="20" colCnt="1" pageBreak="CELL" textWrap="TOP_AND_BOTTOM"><hp:sz width="8000" height="30000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${rows}</hp:tbl>`
    // 바깥 칸: 제목 줄(0) + 빈 문단 줄(1600, 표에 밀리지 않음) — 한컴은 이 칸을 갈라 저장하지 않았다
    const sub = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>제목</hp:t></hp:run>${seg(0)}</hp:p><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${inner}<hp:t/></hp:run>${seg(1600)}</hp:p>`
    const outer = `<hp:tbl rowCnt="1" colCnt="1" pageBreak="CELL" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="31600"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>` +
      `<hp:tr><hp:tc><hp:subList vertAlign="TOP">${sub}</hp:subList><hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="31600"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr></hp:tbl>`
    const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr>${outer}<hp:t/></hp:run>${seg(0)}</hp:p></hs:sec>`
    const z = new JSZip()
    z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
    const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
    assert.equal(r.pageSvgs.size, 2)
    const m = (r.pageSvgs.get(2) ?? "").match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>행19번<\/text>/)
    assert.ok(m, "둘째 쪽의 안쪽 표 마지막 행")
  })
})
