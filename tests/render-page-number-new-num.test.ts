import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const para = (body: string, pageBreak = 0) => `<hp:p paraPrIDRef="0" pageBreak="${pageBreak}"><hp:run charPrIDRef="0">${body}</hp:run>${seg}</hp:p>`

describe("render: 쪽 번호 새로 시작(hp:newNum)", () => {
  it("새 번호 컨트롤이 든 쪽부터 그 번호로 다시 센다", async () => {
    const sec = `<hs:sec ${ns}>` +
      para(`<hp:secPr><hp:pagePr width="59528" height="84189"><hp:margin header="0" footer="0" left="5669" right="5669" top="5669" bottom="2834"/></hp:pagePr></hp:secPr>` +
        `<hp:ctrl><hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/></hp:ctrl><hp:t>표지</hp:t>`) +
      para(`<hp:t>목차</hp:t>`, 1) +
      para(`<hp:ctrl><hp:newNum num="1" numType="PAGE"/></hp:ctrl><hp:t>본문</hp:t>`, 1) +
      para(`<hp:t>본문 둘째 쪽</hp:t>`, 1) + `</hs:sec>`
    const z = new JSZip()
    z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
    const pages = (await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs
    const label = (n: number) => pages.get(n)?.match(/>(- \d+ -)<\/text>/)?.[1]
    assert.deepEqual([1, 2, 3, 4].map(label), ["- 1 -", "- 2 -", "- 1 -", "- 2 -"])
  })
})
