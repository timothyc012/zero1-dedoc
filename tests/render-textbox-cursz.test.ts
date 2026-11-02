import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (v: number, vs: number, bl: number) => `<hp:linesegarray><hp:lineseg textpos="0" vertpos="${v}" vertsize="${vs}" textheight="${vs}" baseline="${bl}" spacing="600" horzpos="0" horzsize="18000"/></hp:linesegarray>`

// 글자처럼 취급한 글상자 — sz 높이 1249(낡은 값)·curSz 20000, 저장 줄 높이 20000
async function boxTextY(angle: number): Promise<number> {
  const inner = `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:t>상자글</hp:t></hp:run>${seg(0, 1000, 850)}</hp:p>`
  const rect = `<hp:rect textWrap="IN_FRONT_OF_TEXT"><hp:orgSz width="10000" height="20000"/><hp:curSz width="10000" height="20000"/>` +
    `<hp:rotationInfo angle="${angle}" centerX="5000" centerY="10000" rotateimage="1"/>` +
    `<hp:drawText lastWidth="10000"><hp:subList vertAlign="TOP">${inner}</hp:subList><hp:textMargin left="0" right="0" top="0" bottom="0"/></hp:drawText>` +
    `<hc:pt0 x="0" y="0"/><hc:pt1 x="10000" y="0"/><hc:pt2 x="10000" y="20000"/><hc:pt3 x="0" y="20000"/>` +
    `<hp:sz width="10000" height="1249"/><hp:pos treatAsChar="1" vertRelTo="PARA" horzRelTo="PARA" vertOffset="0" horzOffset="0"/><hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:rect>`
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="1000" right="1000" top="1000" bottom="1000"/></hp:pagePr></hp:secPr>${rect}<hp:t/></hp:run>${seg(0, 20000, 17000)}</hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? ""
  const m = svg.match(/<text x="[-\d.]+" y="([-\d.]+)"[^>]*>상자글<\/text>/)
  assert.ok(m, "글상자 글")
  return Number(m[1])
}

describe("render: 글자처럼 취급한 글상자의 크기", () => {
  it("돌리지 않은 글상자는 curSz 로 놓는다 — 저장 줄 높이(curSz)를 꽉 채워 글이 줄 위에서 시작한다", async () => {
    // 줄 위 10pt + 안 글 기준선 8.5pt. sz(1249)로 놓으면 상자가 기준선 근처로 내려가 글이 160pt 아래
    assert.ok(await boxTextY(0) < 25)
  })
})
