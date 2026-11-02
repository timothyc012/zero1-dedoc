import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const para = (t: string, v: number) => `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>${t}</hp:t></hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="4000"/></hp:linesegarray></hp:p>`
const tc = (body: string, c: number, r: number, rs: number, h: number) => `<hp:tc><hp:subList vertAlign="TOP">${body}</hp:subList>` +
  `<hp:cellAddr colAddr="${c}" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="${rs}"/><hp:cellSz width="5000" height="${h}"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc>`

// 본문 11000 을 넘치는 4행 표(12000). 세 행 칸(왼쪽)의 둘째 문단 vertpos 가 0 으로 되돌아간다 — 한컴이 그 칸을 첫 행 뒤에서 쪽을 갈라 저장했다
// (종전엔 세 행이 다 첫 쪽에 들어 넷째 행만 다음 쪽)
async function pages(): Promise<Record<string, number>> {
  const rows = [
    `<hp:tr>${tc(para("가", 0) + para("나", 0), 0, 0, 3, 7000)}${tc(para("일", 0), 1, 0, 1, 3000)}</hp:tr>`,
    `<hp:tr>${tc(para("이", 0), 1, 1, 1, 2000)}</hp:tr>`,
    `<hp:tr>${tc(para("삼", 0), 1, 2, 1, 2000)}</hp:tr>`,
    `<hp:tr>${tc(para("사", 0), 0, 3, 1, 5000)}${tc(para("오", 0), 1, 3, 1, 5000)}</hp:tr>`,
  ]
  const tbl = `<hp:tbl rowCnt="4" colCnt="2" textWrap="TOP_AND_BOTTOM" pageBreak="CELL"><hp:sz width="10000" height="12000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${rows.join("")}</hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="12000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr>${tbl}<hp:t/></hp:run>` +
    `<hp:linesegarray><hp:lineseg textpos="0" vertpos="12000" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="19000"/></hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  const out: Record<string, number> = {}
  for (const t of ["가", "나", "일", "이", "삼", "사"]) out[t] = [...r.pageSvgs].find(([, svg]) => String(svg).includes(`>${t}</text>`))?.[0] ?? -1
  return out
}

describe("render: 한컴이 쪽에서 갈라 저장한 여러 행 칸", () => {
  it("다음 부분이 시작하는 행부터 다음 쪽 — 칸 글도 부분마다 그 쪽에", async () => {
    assert.deepEqual(await pages(), { 가: 1, 나: 2, 일: 1, 이: 2, 삼: 2, 사: 2 })
  })
})
