import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { createXmlParser } from "../src/hwpx/parser-shared.js"
import { parseRenderStyles } from "../src/render/head-styles.js"
import { glyphWidth, reflowSection } from "../src/render/reflow.js"
import { renderHwpxToSvg } from "../src/render/svg-render.js"

const ns = 'xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"'
function fixture(flag: string, auto = 1) {
  const head = `<hh:head ${ns}><hh:fontfaces><hh:fontface lang="HANGUL"><hh:font id="0" face="한컴돋움" type="TTF"/></hh:fontface></hh:fontfaces><hh:bullets><hh:bullet id="1" char="\uf09f" useImage="0"><hh:paraHead ${flag} widthAdjust="0" autoIndent="${auto}" textOffset="0" charPrIDRef="0"/></hh:bullet></hh:bullets><hh:charProperties><hh:charPr id="0" height="1000"><hh:fontRef hangul="0"/></hh:charPr></hh:charProperties><hh:paraProperties><hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:heading type="BULLET" idRef="1"/><hh:breakSetting breakNonLatinWord="KEEP_WORD"/></hh:paraPr></hh:paraProperties></hh:head>`
  const xml = `<hs:sec ${ns}><hp:p paraPrIDRef="0"><hp:run charPrIDRef="0"><hp:secPr><hp:pagePr width="5000" height="10000"><hp:margin left="500" right="1000" top="500" bottom="500"/></hp:pagePr></hp:secPr><hp:t>가나다라마바</hp:t></hp:run></hp:p></hs:sec>`
  return { head, xml }
}
function lines(flag: string, auto = 1, char = "\uf09f", face = "한컴돋움") {
  const f = fixture(flag, auto), styles = parseRenderStyles(f.head.replace("\uf09f", char).replace('face="한컴돋움"', `face="${face}"`))
  const root = createXmlParser().parseFromString(f.xml.replace(/<hp:secPr>[\s\S]*?<\/hp:secPr>/, ""), "text/xml").documentElement as unknown as Element
  reflowSection(root, styles, { BODY_W: 3500, BODY_H: 9000 })
  return Array.from(root.getElementsByTagName("hp:lineseg"), s => Number(s.getAttribute("textpos")))
}
describe("본문 기호 실폭과 자동 글머리표 예약 폭", () => {
  it("명시적 useInstWidth의 양쪽 값과 미지정 상태를 보존한다", () => {
    for (const [flag, expected] of [['useInstWidth="0"', false], ['useInstWidth="1"', true], ["", undefined]] as const) {
      assert.equal(parseRenderStyles(fixture(flag).head).paraGeom.get("0")!.bullet!.useInstWidth, expected)
    }
  })
  it("본문 F09F는 실제 Wingdings hmtx937/upem2048의 폭을 쓴다", () => {
    assert.equal(glyphWidth("\uf09f", { height: 1000, face: "한컴돋움", bold: false, italic: false, underline: false, ratio: 100, spacing: 0 }).w, 456)
  })
  it("기호 대체 폭을 예약 폭에 적용하지 않는다", () => {
    assert.deepEqual(lines('useInstWidth="0"'), [0, 2, 4])
  })
  it("실폭 사용과 미지정의 기존 경로는 기호 실폭을 쓴다", () => {
    for (const flag of ['useInstWidth="1"', ""]) assert.deepEqual(lines(flag), [0, 3])
  })
  it("자동 내어쓰기를 끄면 다음 줄에는 예약 폭을 빼지 않는다", () => {
    assert.deepEqual(lines('useInstWidth="0"', 0), [0, 2, 5])
  })
  it("일반 하이픈을 1em으로 넓히지 않고 원래 글꼴 폭으로 예약한다", () => {
    assert.deepEqual(lines('useInstWidth="0"', 1, "-"), lines('useInstWidth="1"', 1, "-"))
  })
  it("굴림체·돋움체 본문의 반각 기호는 0.5em 이고 예약 폭(useInstWidth=0)은 1em 이다", () => {
    const st = (face: string) => ({ height: 1000, face, bold: false, italic: false, underline: false, ratio: 100, spacing: 0 })
    for (const face of ["굴림체", "돋움체"]) {
      assert.deepEqual(["•", "−", "◦", "·", "가"].map(c => glyphWidth(c, st(face)).w), [500, 500, 500, 1000, 1000])
    }
    // 한컴 PDF: 돋움체 글머리표 "−" 는 0.5em 으로 찍혀도 본문은 1em 예약 뒤에서 시작한다
    assert.deepEqual(lines('useInstWidth="0"', 1, "−", "돋움체"), [0, 2, 4])
    assert.deepEqual(lines('useInstWidth="1"', 1, "−", "돋움체"), [0, 3])
  })
  it("SVG도 본문을 고정 예약 폭 다음에 그린다", async () => {
    const f = fixture('useInstWidth="0"'), z = new JSZip()
    z.file("Contents/header.xml", f.head); z.file("Contents/section0.xml", f.xml)
    const result = await renderHwpxToSvg(await z.generateAsync({ type: "uint8array" }), { reflow: true })
    const doc = createXmlParser().parseFromString(result.svg, "image/svg+xml")
    const body = Array.from(doc.getElementsByTagName("text")).find(t => t.textContent?.includes("가나"))
    assert.ok(body)
    assert.equal(Number(body.getAttribute("x")), 15)
  })
})
