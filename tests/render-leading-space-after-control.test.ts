import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { renderHwpxPages } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="함초롬바탕" type="TTF"/></hh:fontface></hh:fontfaces>` +
  `<hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr><hh:charPr id="1" height="1000"><hh:fontRef hangul="0"/><hh:bold/></hh:charPr></hh:charProperties>` +
  `<hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="JUSTIFY"/></hh:paraPr></hh:paraProperties></hh:head>`
const seg = (tp: number, v: number) => `<hp:lineseg textpos="${tp}" vertpos="${v}" vertsize="1000" textheight="1000" baseline="850" spacing="600" horzpos="0" horzsize="12000"/>`

// 양쪽 정렬 두 줄 문단의 첫 줄 " 가나 다라| 마바"(둘째 run) — 첫 줄 앞에 누름틀 컨트롤이 있으면 앞 빈칸도 늘이는 빈칸
async function secondRunX(field: boolean): Promise<number> {
  const ctrl = field ? `<hp:ctrl><hp:fieldBegin id="1" type="CLICK_HERE" name="본문"/></hp:ctrl>` : ""
  const sec = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="40000" height="40000"><hp:margin header="0" footer="0" left="500" right="500" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>머리</hp:t></hp:run><hp:linesegarray>${seg(0, 0)}</hp:linesegarray></hp:p>` +
    `<hp:p paraPrIDRef="0"><hp:run charPrIDRef="0">${ctrl}<hp:t> 가나 다라</hp:t></hp:run><hp:run charPrIDRef="1"><hp:t> 마바</hp:t></hp:run><hp:run charPrIDRef="0"><hp:t>사아자차</hp:t></hp:run>` +
    `<hp:linesegarray>${seg(0, 1600)}${seg(field ? 17 : 9, 3200)}</hp:linesegarray></hp:p></hs:sec>`
  const z = new JSZip()
  z.file("Contents/header.xml", head); z.file("Contents/section0.xml", sec)
  const svg = String((await renderHwpxPages(await z.generateAsync({ type: "uint8array" }))).pageSvgs.get(1) ?? "")
  return Number(svg.match(/<text x="([\d.]+)"[^>]*> 마바<\/text>/)?.[1])
}

describe("render: 컨트롤 뒤 줄 앞 빈칸", () => {
  it("누름틀 컨트롤로 시작하는 양쪽 정렬 줄은 그 뒤 빈칸도 늘인다(빈칸 셋에 나눠 둘째 run 이 오른쪽)", async () => {
    const plain = await secondRunX(false), field = await secondRunX(true)
    // 남는 폭 d 를 빈칸 둘(안쪽·run 앞)에 나누던 것을 셋에 나눈다 — 둘째 run 앞 늘임이 d/2 → 2d/3
    assert.ok(field - plain > 5, `${plain} → ${field}`)
  })
})
