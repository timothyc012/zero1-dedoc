/**
 * 원문 글자 "<sub>"·"</sup>"·"<u>" (#122) — 파서가 넣는 첨자·밑줄 표지와 같은 꼴이라 첨자 끔(PDF 기본·--no-script-tags)이 지우고,
 * 평문(--plain)이 x_i 로 바꾸고, 태그 정리가 뒤 빈칸을 옮겼다. IR 은 원문 `<` 를 `\<` 로 담는다(리터럴 `$` → `\$` 와 같은 규약).
 */
import { describe, it } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { parse } from "../src/index.js"
import { escapeLiteralTags, plainScripts, stripScriptTags, tidyScriptTags } from "../src/script-tags.js"
import { toPlainMarkdown } from "../src/plain-markdown.js"
import { blocksToMarkdown, escapeHtmlCellText } from "../src/table/builder.js"
import { appendParaText, createParaTextState, resolveLiteralLt } from "../src/hwp5/record.js"
import { extractHwpxStyles } from "../src/hwpx/styles.js"
import { parseSectionXml } from "../src/hwpx/section-walker.js"
import type { IRBlock } from "../src/types.js"

describe("escapeLiteralTags 규약", () => {
  it("파서 표지 꼴(<u>·<sup>·<sub> 와 닫는 짝)의 < 만 \\< — 다른 꺾쇠는 그대로", () => {
    assert.equal(escapeLiteralTags("x<sub>i</sub> <u>밑</u> </sup>"), "x\\<sub>i\\</sub> \\<u>밑\\</u> \\</sup>")
    assert.equal(escapeLiteralTags("<붙임1> a<b <subject> <br>"), "<붙임1> a<b <subject> <br>")
  })

  it("첨자 끔·평문·태그 정리는 이스케이프된 원문 글자를 건드리지 않는다", () => {
    const ir = "x\\<sub>i\\</sub> CO<sub>2</sub> \\<sub> 요소"
    const r = stripScriptTags({ markdown: ir, blocks: [{ type: "paragraph", text: ir }] as IRBlock[] })
    assert.equal(r.markdown, "x\\<sub>i\\</sub> CO2 \\<sub> 요소")
    assert.equal(r.blocks![0].text, r.markdown)
    assert.equal(plainScripts(ir), "x\\<sub>i\\</sub> CO_2 \\<sub> 요소")
    assert.equal(tidyScriptTags("\\<sub> 요소 m<sup> 2</sup>"), "\\<sub> 요소 m <sup>2</sup>")
    assert.equal(toPlainMarkdown("\\<u>밑줄\\</u> <u>진짜</u>"), "\\<u>밑줄\\</u> 진짜")
  })

  it("마크다운은 \\< 를 한 번만, HTML 표 칸은 &lt; 로", () => {
    assert.equal(blocksToMarkdown([{ type: "paragraph", text: "x\\<sub>i\\</sub> CO<sub>2</sub>" }]).trim(), "x\\<sub>i\\</sub> CO<sub>2</sub>")
    assert.equal(escapeHtmlCellText("x\\<sub>i\\</sub> CO<sub>2</sub>"), "x&lt;sub&gt;i&lt;/sub&gt; CO<sub>2</sub>")
  })
})

describe("파서 진입점", () => {
  it("HWPX — 원문 글자와 hh:subscript 글자 모양을 가른다", async () => {
    const zip = new JSZip()
    zip.file("Contents/header.xml", `<?xml version="1.0"?><hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head" version="1.4"><hh:refList><hh:charProperties>
      <hh:charPr id="0" height="1000"/><hh:charPr id="1" height="1000"><hh:subscript/></hh:charPr></hh:charProperties></hh:refList></hh:head>`)
    const styles = await extractHwpxStyles(zip)
    const run = (id: number, t: string) => `<hp:run charPrIDRef="${id}"><hp:t>${t}</hp:t></hp:run>`
    const blocks = parseSectionXml(`<?xml version="1.0"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">` +
      `<hp:p>${run(0, "&lt;sub&gt; 요소, 수식 x&lt;sub&gt;i&lt;/sub&gt;, CO")}${run(1, "2")}${run(0, " 배출량")}</hp:p></hs:sec>`, styles)
    assert.equal(blocks[0].text, "\\<sub> 요소, 수식 x\\<sub>i\\</sub>, CO<sub>2</sub> 배출량")
  })

  it("HWP5 — 리터럴 < 는 표지로 받아 필드 처리 뒤 태그 꼴만 \\< (첨자 태그는 그대로)", () => {
    const state = createParaTextState()
    state.dollarMark = true
    state.scriptAt = (p) => (p === 14 ? "sub" : null)
    appendParaText(state, Buffer.from("x<sub>i</sub> 2 a<b", "utf16le"))
    assert.equal(resolveLiteralLt(state.text), "x\\<sub>i\\</sub> <sub>2</sub> a<b")
  })

  it("DOCX — w:t 원문 글자와 w:vertAlign 첨자", async () => {
    const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    const run = (s: string, sub = false) => `<w:r>${sub ? '<w:rPr><w:vertAlign w:val="subscript"/></w:rPr>' : ""}<w:t xml:space="preserve">${s}</w:t></w:r>`
    const zip = new JSZip()
    zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body><w:p>${run("닫는 태그는 &lt;/sup&gt; 로 씁니다")}</w:p><w:p>${run("CO")}${run("2", true)}${run(" 배출량")}</w:p></w:body></w:document>`)
    const buf = await zip.generateAsync({ type: "arraybuffer" })
    const on = await parse(buf)
    assert.ok(on.success, on.success ? "" : on.error)
    assert.equal(on.markdown.trim(), "닫는 태그는 \\</sup> 로 씁니다\n\nCO<sub>2</sub> 배출량")
    const off = await parse(buf, { scriptTags: false })
    assert.ok(off.success)
    assert.equal(off.markdown.trim(), "닫는 태그는 \\</sup> 로 씁니다\n\nCO2 배출량")
  })

  it("PDF — 첨자 끔(기본)에서도 원문 글자가 남는다", async () => {
    const lines = ["The <sub> element marks a subscript.", "Close it with </sup> please."]
    const esc = (s: string) => s.replace(/[\\()]/g, m => "\\" + m)
    const content = `BT /F1 14 Tf 72 720 Td 20 TL ${lines.map(l => `(${esc(l)}) Tj T*`).join(" ")} ET`
    const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${content.length} >>\nstream\n${content}\nendstream`]
    let out = "%PDF-1.4\n"
    const offs: number[] = []
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
    const xref = out.length
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    const r = await parse(new Uint8Array(Buffer.from(out, "latin1")).buffer as ArrayBuffer)
    assert.ok(r.success)
    assert.match(r.markdown, /The \\<sub> element marks a subscript\. Close it with \\<\/sup> please\./)
  })
})
