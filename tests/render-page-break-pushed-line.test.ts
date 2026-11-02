import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`

describe("render: 쪽 나누기 문단의 위아래 표에 밀린 첫 줄", () => {
  it("본문 아래쪽에 저장된 쪽 나누기 문단도 첫 줄이 제 표에 밀린 자리(바깥 위 + 높이 + 바깥 아래)면 새 쪽 — 표는 다음 쪽 맨 위", async () => {
    // 본문 높이 38000, 표 30000 + 바깥 여백 141×2 → 줄 30282(본문 절반 아래)
    // 행 10개 × 3000 — 옛 판정(같은 쪽 줄 자리)이면 첫 두 행이 첫 쪽 바닥에 남는다
    const row = (r: number) => `<hp:tr><hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>표${r}</hp:t></hp:run>${seg(0)}</hp:p></hp:subList>` +
      `<hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`
    const tbl = `<hp:tbl rowCnt="10" colCnt="1" pageBreak="CELL" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="30000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="141" right="141" top="141" bottom="141"/>${[...Array(10).keys()].map(row).join("")}</hp:tbl>`
    const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(0)}</hp:p>` +
      `<hp:p paraPrIDRef="0" pageBreak="1"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${seg(30282)}</hp:p></hs:sec>`
    const z = new JSZip()
    z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
    const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
    assert.equal(r.pageSvgs.size, 2)
    const m = (r.pageSvgs.get(2) ?? "").match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>표0<\/text>/)
    assert.ok(m, "둘째 쪽의 표 첫 행")
    assert.ok(Number(m[1]) < 25, `표 칸 글 ${m[1]} 이 둘째 쪽 맨 위`)
  })
})
