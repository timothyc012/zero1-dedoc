import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const row = (r: number) => `<hp:tr><hp:tc><hp:subList vertAlign="TOP"><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>행${r}</hp:t></hp:run>${seg(0)}</hp:p></hp:subList>` +
  `<hp:cellAddr colAddr="0" rowAddr="${r}"/><hp:cellSpan colSpan="1" rowSpan="1"/><hp:cellSz width="10000" height="3000"/><hp:cellMargin left="0" right="0" top="0" bottom="0"/></hp:tc></hp:tr>`

// 본문 0~39000, 표는 쪽 맨 위에서 칸 안 나눔 6행(3000씩 18000) + 넘치게 할 뒤 행들. 표 위는 본문 위 21200 — 남은 17800 에
// 여섯째 행까지(18000)는 안 들고 다섯째 행 바닥 15000 + 바깥 아래 omB 가 남은 자리 안인지로 가른다
async function pageOfRow5(omB: number): Promise<number> {
  const tbl = `<hp:tbl rowCnt="8" colCnt="1" textWrap="TOP_AND_BOTTOM" pageBreak="CELL"><hp:sz width="10000" height="24000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="${omB}"/>${[0, 1, 2, 3, 4, 5, 6, 7].map(row).join("")}</hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(19600)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${seg(21200 + 24000 + omB - 39000)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  return [...r.pageSvgs].find(([, svg]) => String(svg).includes(">행4</text>"))?.[0] ?? -1
}

describe("render: 칸 안 나눔 표의 쪽 바닥 행과 바깥 아래 여백", () => {
  it("행 바닥은 들어도 바깥 아래 여백까지 넘으면 그 행부터 다음 쪽", async () => {
    // 표 위 21200 + 다섯 행 15000 = 36200, + omB 3000 = 39200 > 39000
    assert.equal(await pageOfRow5(3000), 2)
  })
  it("바깥 아래 여백까지 들면 그 쪽", async () => {
    assert.equal(await pageOfRow5(500), 1)
  })
})
