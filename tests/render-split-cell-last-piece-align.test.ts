import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
// 쪽 본문 9000 — 표 sz 5000 = 첫 쪽 조각, 칸 저장 높이 10000, 셋째 줄 뒤에서 갈라 저장(0·1600·3200 | 0·1600)
async function lastPieceY(vertAlign: string): Promise<number> {
  const lines = [["일", 0], ["이", 1600], ["삼", 3200], ["사", 0], ["오", 1600]] as const
  const cell = `<hp:tc><hp:subList vertAlign="${vertAlign}">${lines.map(([t, v]) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run>${seg(v)}</hp:p>`).join("")}</hp:subList>` +
    `<hp:cellAddr colAddr="0" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="10000"/><hp:cellMargin left="0" right="0" top="141" bottom="141"/></hp:tc>`
  const tbl = `<hp:tbl pageBreak="CELL" rowCnt="1" colCnt="1" textWrap="TOP_AND_BOTTOM"><hp:sz width="10000" height="5000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/><hp:tr>${cell}</hp:tr></hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="10000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr>${tbl}<hp:t/></hp:run>${seg(0)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  const page2 = r.pageSvgs.get(2) ?? ""
  const m = page2.match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>사<\/text>/)
  assert.ok(m, "둘째 쪽 첫 줄")
  return Number(m[1])
}

describe("render: 두 쪽에 갈린 가운데 칸의 마지막 조각", () => {
  it("칸 저장 몫으로 남는 높이 안에서 맞춘다 — 가운데는 남는 몫의 절반, 아래는 전부 아래", async () => {
    // 마지막 조각 = 저장 10000 − 첫 조각 5000 = 5000, 내용 2600 + 칸 여백 282 → 남는 몫 2118
    const top = await lastPieceY("TOP")
    assert.ok(Math.abs(await lastPieceY("CENTER") - top - 10.59) < 0.05)
    assert.ok(Math.abs(await lastPieceY("BOTTOM") - top - 21.18) < 0.05)
  })
})
