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

// 본문 0~39000. 앞 문단은 1쪽 32500 에서 끝나고, 다음 문단(새 쪽 첫 줄)에 앵커한 4행(3000씩) 위아래 표 —
// 1쪽 남은 6500 에 두 행, 2쪽에 두 행이면 표 끝은 2쪽 6000 이고 한컴은 앵커 줄을 거기(6000)에 저장한다
async function rowPages(lineV: number): Promise<number[]> {
  const tbl = `<hp:tbl rowCnt="4" colCnt="1" textWrap="TOP_AND_BOTTOM" pageBreak="CELL"><hp:sz width="10000" height="6000"/><hp:pos treatAsChar="0" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/>${[0, 1, 2, 3].map(row).join("")}</hp:tbl>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가</hp:t></hp:run>${seg(30900)}</hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${tbl}<hp:t/></hp:run>${seg(lineV)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  return [0, 1, 2, 3].map(k => [...r.pageSvgs].find(([, svg]) => String(svg).includes(`>행${k}</text>`))?.[0] ?? -1)
}

describe("render: 앞 쪽 끝에서 시작해 앵커 줄 쪽으로 넘어온 떠 있는 표", () => {
  it("앵커 줄이 새 쪽 6000(= 넘어온 두 행)이면 표는 앞 쪽 끝에서 시작해 두 행씩 나뉜다", async () => {
    assert.deepEqual(await rowPages(6000), [1, 1, 2, 2])
  })
  it("앵커 줄이 넘어온 행 끝과 맞지 않으면 종전대로 앵커 줄 쪽에 그린다", async () => {
    assert.deepEqual(await rowPages(15000), [2, 2, 2, 2])
  })
})
