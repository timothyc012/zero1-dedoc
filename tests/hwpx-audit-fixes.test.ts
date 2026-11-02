/**
 * 전수 점검(2026-10-01) HWPX·표 계층 결함 — 변경 추적 삭제(머리말·꼬리말, 삭제 구간이 걸친 표, 지운 수식·양식 단추),
 * 틀 표 속 목차(#121 우회), 패치(원문 태그 꼴 글자·바꾸지 않은 기본 출력), 제목 문단의 누름틀 안내문, HTML 칸 $, 분수 이스케이프.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parse } from "../src/index.js"
import { parseSectionXml } from "../src/hwpx/section-walker.js"
import { patchHwpx } from "../src/roundtrip/patcher.js"
import { escapeHtmlCellText } from "../src/table/builder.js"

const NS = 'xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"'
const bf = (id: number, type: string) => `<hh:borderFill id="${id}">${["leftBorder", "rightBorder", "topBorder", "bottomBorder"].map(n => `<hh:${n} type="${type}" width="0.12 mm" color="#000000"/>`).join("")}</hh:borderFill>`
const REF = `<hh:borderFills itemCnt="2">${bf(1, "NONE")}${bf(2, "SOLID")}</hh:borderFills><hh:charProperties itemCnt="1"><hh:charPr id="0" height="1000"/></hh:charProperties>`
const p = (inner: string, attrs = 'paraPrIDRef="0"') => `<hp:p ${attrs}><hp:run charPrIDRef="0">${inner}</hp:run></hp:p>`
const t = (s: string) => `<hp:t>${s}</hp:t>`
const tc = (c: number, inner: string) => `<hp:tc borderFillIDRef="1"><hp:subList>${inner}</hp:subList><hp:cellAddr colAddr="${c}" rowAddr="0"/><hp:cellSpan colSpan="1" rowSpan="1"/></hp:tc>`
const tbl = (cells: string[], extra = "") => `<hp:tbl rowCnt="1" colCnt="${cells.length}">${extra}<hp:tr>${cells.join("")}</hp:tr></hp:tbl>`
const del = (begin: boolean) => `<hp:ctrl><hp:delete${begin ? "Begin" : "End"} Id="1"/></hp:ctrl>`
const sec = (body: string) => `<hs:sec ${NS}>${body}</hs:sec>`

async function hwpx(body: string, ref = REF): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file("mimetype", "application/hwp+zip")
  zip.file("META-INF/container.xml", '<?xml version="1.0"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf"/></ocf:rootfiles></ocf:container>')
  zip.file("Contents/content.hpf", '<?xml version="1.0"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="header" href="Contents/header.xml"/><opf:item id="section0" href="Contents/section0.xml"/></opf:manifest><opf:spine><opf:itemref idref="section0"/></opf:spine></opf:package>')
  zip.file("Contents/header.xml", `<?xml version="1.0"?><hh:head ${NS} version="1.4" secCnt="1"><hh:refList>${ref}</hh:refList></hh:head>`)
  zip.file("Contents/section0.xml", `<?xml version="1.0"?>${sec(body)}`)
  return zip.generateAsync({ type: "arraybuffer" })
}

test("a caption on side BOTTOM follows its table — in markdown, in flattened cell text and when the frame table is unframed", async () => {
  const cap = (side: string) => `<hp:caption side="${side}"><hp:subList>${p(t("※ 자료: 통계청"))}</hp:subList></hp:caption>`
  const ruled = (c: number, inner: string) => tc(c, inner).replace('borderFillIDRef="1"', 'borderFillIDRef="2"')
  const below = await parse(await hwpx(p(tbl([ruled(0, p(t("항목"))), ruled(1, p(t("금액")))], cap("BOTTOM")))))
  assert.ok(below.success)
  assert.equal(below.blocks.find(b => b.type === "table")?.table?.captionBelow, true)
  assert.ok(below.markdown.indexOf("금액") < below.markdown.indexOf("자료: 통계청"), below.markdown)
  const above = await parse(await hwpx(p(tbl([ruled(0, p(t("항목"))), ruled(1, p(t("금액")))], cap("TOP")))))
  assert.ok(above.markdown.indexOf("자료: 통계청") < above.markdown.indexOf("금액"), above.markdown)
  // 보이지 않는 틀 표를 글로 풀어도 캡션은 그 뒤
  const unframed = await parse(await hwpx(p(tbl([tc(0, p(t("항목"))), tc(1, p(t("금액")))], cap("BOTTOM")))))
  assert.ok(!unframed.blocks.some(b => b.type === "table"))
  assert.ok(unframed.markdown.indexOf("금액") < unframed.markdown.indexOf("자료: 통계청"), unframed.markdown)
  // 칸 안 중첩표의 평탄화 글도 캡션을 표 뒤에
  const outer = await parse(await hwpx(p(tbl([tc(0, p(tbl([tc(0, p(t("안칸")))], cap("BOTTOM")))), tc(1, p(t("옆")))]))), { layoutTables: "keep" })
  const cell = outer.blocks.find(b => b.type === "table")!.table!.cells[0][0]
  assert.ok(cell.text.indexOf("안칸") < cell.text.indexOf("자료: 통계청"), cell.text)
})

test("tracked-deleted header and footer controls stay deleted", async () => {
  const header = `<hp:ctrl><hp:header id="1" applyPageType="BOTH"><hp:subList>${p(t("지운 머리말"))}</hp:subList></hp:header></hp:ctrl>`
  const footer = `<hp:ctrl><hp:footer id="2" applyPageType="BOTH"><hp:subList>${p(t("지운 꼬리말"))}</hp:subList></hp:footer></hp:ctrl>`
  const r = await parse(await hwpx(p(t("본문 ") + del(true) + header + footer + t("지운 글") + del(false) + t(" 끝"))))
  assert.ok(r.success)
  assert.deepEqual(r.blocks.map(b => b.text), ["본문 끝"])
})

test("a live table keeps its cells and caption when a deletion starts after it and runs into the next paragraph", () => {
  const table = tbl([tc(0, p(t("칸1"))), tc(1, p(t("칸2")))], `<hp:caption><hp:subList>${p(t("표 캡션"))}</hp:subList></hp:caption>`)
  const blocks = parseSectionXml(sec(p(table + t("앞") + del(true) + t("지움")) + p(t("지움2") + del(false) + t("뒤"))))
  const tb = blocks.find(b => b.type === "table")!.table!
  assert.equal(tb.caption, "표 캡션")
  assert.deepEqual(tb.cells.flat().map(c => c.text), ["칸1", "칸2"])
  assert.deepEqual(blocks.filter(b => b.type === "paragraph").map(b => b.text), ["앞", "뒤"])
})

test("equations and form buttons inside a tracked deletion are not emitted", () => {
  const eq = `<hp:equation><hp:script>x over y</hp:script></hp:equation>`
  const chk = `<hp:checkBtn value="CHECKED" caption="동의함"><hp:sz width="5000" height="1000"/></hp:checkBtn>`
  const blocks = parseSectionXml(sec(p(t("남음 ") + del(true) + t("지운 글") + eq + chk + del(false) + t(" 끝"))))
  assert.deepEqual(blocks.map(b => b.text), ["남음 끝"])
})

test("a table of contents inside a borderless frame table is not promoted to headings (#121)", async () => {
  const TAB = '<hp:tab width="30000" leader="3" type="2"/>'
  const toc = [["제1장 총칙", "1"], ["제2장 운영 기준", "5"]].map(([a, n]) => p(t(a) + TAB + t(n))).join("")
  const buf = await hwpx(p(t("○○공사 추진계획")) + p(tbl([tc(0, toc)])) + p(t("제1장 총칙")) + p(t("본문 문장입니다.")))
  for (const layoutTables of ["keep", "visual"] as const) {
    const r = await parse(buf, { layoutTables })
    assert.ok(r.success)
    assert.deepEqual(r.outline?.map(o => o.text), ["제1장 총칙"], layoutTables)
  }
})

test("patching finds paragraphs with literal tag-shaped text, and unchanged default output returns the original bytes", async () => {
  const buf = new Uint8Array(await hwpx(p(t("첫 문단입니다.")) + p(t("Close it with &lt;/sup&gt; please.")) + p(t("끝 문단입니다."))))
  const md = (await parse(buf.slice().buffer, { layoutTables: "keep" })).markdown!
  const edited = await patchHwpx(buf, md.replace("Close it with", "Close it NOW with"))
  assert.equal(edited.applied, 1, JSON.stringify(edited.skipped))
  const xml = await (await JSZip.loadAsync(edited.data!)).file("Contents/section0.xml")!.async("text")
  assert.ok(xml.includes("Close it NOW with &lt;/sup&gt; please."))

  const framed = new Uint8Array(await hwpx(p(t("첫 안내")) + p(tbl([tc(0, p(t("틀 안 글"))), tc(1, p(t("옆 칸")))])) + p(t("끝 안내"))))
  const visual = (await parse(framed.slice().buffer)).markdown!
  const same = await patchHwpx(framed, visual)
  assert.ok(same.success, same.error)
  assert.equal(same.applied, 0)
  assert.deepEqual(same.data, framed)
})

test("an unfilled click-here guide in a heading paragraph is kept out of the heading and outline", async () => {
  const field = (guide: string) => `<hp:ctrl><hp:fieldBegin id="9" type="CLICK_HERE" name="제목" editable="1"><hp:parameters cnt="1" name=""><hp:stringParam name="Direction">${guide}</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl>${t(guide)}<hp:ctrl><hp:fieldEnd beginIDRef="9"/></hp:ctrl>`
  const ref = REF + `<hh:styles itemCnt="2"><hh:style id="0" name="바탕글"/><hh:style id="1" name="개요 1"/></hh:styles>`
  const buf = await hwpx(p(field("여기에 제목을 입력하세요"), 'paraPrIDRef="0" styleIDRef="1"') + p(t("본문 하나")), ref)
  const hidden = await parse(buf)
  assert.ok(hidden.success)
  assert.equal(hidden.markdown.trim(), "본문 하나")
  assert.equal(hidden.outline, undefined)
  const shown = await parse(buf, { includeFieldPlaceholders: true })
  assert.ok(shown.success)
  assert.match(shown.markdown, /^# 여기에 제목을 입력하세요/)
})

test("HTML table cells keep a literal \\$ escaped (several $ in one cell would read as a math span)", () => {
  assert.equal(escapeHtmlCellText("가격 \\$30 … \\$26 \\<sub>x"), "가격 \\$30 … \\$26 &lt;sub&gt;x")
})
