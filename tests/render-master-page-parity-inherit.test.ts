import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = `<hp:linesegarray><hp:lineseg textpos="0" vertpos="0" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="9000"/></hp:linesegarray>`
const para = (t: string, pb = false, sec = "") => `<hp:p paraPrIDRef="0"${pb ? ' pageBreak="1"' : ""}><hp:run charPrIDRef="0">${sec}<hp:t>${t}</hp:t></hp:run>${seg}</hp:p>`
const secPr = (refs: string[]) => `<hp:secPr><hp:pagePr width="20000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr>${refs.map(r => `<hp:masterPage idRef="${r}"/>`).join("")}</hp:secPr>`
const master = (id: string, type: string, t: string) => `<masterPage ${ns} id="${id}" type="${type}"><hp:subList>${para(t)}</hp:subList></masterPage>`

// 1구역(1쪽): 짝수 바탕쪽 "짝머리" + 홀수 "홀머리". 2구역(2·3쪽): 홀수 바탕쪽 "홀둘"만
async function pages(): Promise<string[]> {
  const z = new JSZip()
  z.file("Contents/header.xml", head)
  z.file("Contents/masterpage0.xml", master("masterpage0", "EVEN", "짝머리"))
  z.file("Contents/masterpage1.xml", master("masterpage1", "ODD", "홀머리"))
  z.file("Contents/masterpage2.xml", master("masterpage2", "ODD", "홀둘"))
  z.file("Contents/section0.xml", `<hs:sec ${ns}>${para("첫", false, secPr(["masterpage0", "masterpage1"]))}</hs:sec>`)
  z.file("Contents/section1.xml", `<hs:sec ${ns}>${para("둘", false, secPr(["masterpage2"]))}${para("셋", true)}</hs:sec>`)
  const r = await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))
  return [...r.pageSvgs.values()].map(String)
}

describe("render: 짝·홀 바탕쪽 한쪽만 정의한 구역", () => {
  it("정의하지 않은 쪽(짝수)은 앞 구역 바탕쪽을 이어받는다", async () => {
    const ps = await pages()
    assert.equal(ps.length, 3)
    assert.ok(ps[1].includes(">짝머리<"), "2쪽(짝수)에 앞 구역 짝수 바탕쪽")
    assert.ok(ps[2].includes(">홀둘<") && !ps[2].includes(">홀머리<"), "3쪽(홀수)은 이 구역 홀수 바탕쪽")
  })
})
