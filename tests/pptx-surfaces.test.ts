/** PPTX parse failures remain explicit across CLI and MCP for malformed packages. */
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import JSZip from "jszip"

const CFB = createRequire(import.meta.url)("cfb")
const ROOT = fileURLToPath(new URL("../", import.meta.url))
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const MCP = fileURLToPath(new URL("../src/mcp.ts", import.meta.url))
const TITLE = "ZIP metadata regression"
const CORE_PROPERTIES = `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${TITLE}</dc:title>
</cp:coreProperties>`

async function makeZip(parts: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(parts)) zip.file(path, content)
  zip.file("docProps/core.xml", CORE_PROPERTIES)
  return zip.generateAsync({ type: "nodebuffer" })
}

function makePptx(): Promise<Buffer> {
  return makeZip({
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
    </Types>`,
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/></p:presentation>`,
  })
}

function makeValidPptx(): Promise<Buffer> {
  const ns = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`
  const title = (text: string) => `<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp>`
  return makeZip({
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`,
    "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`,
    "ppt/slides/slide2.xml": `<p:sld ${ns}><p:cSld><p:spTree>${title("Surface slide one")}<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>42</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame></p:spTree></p:cSld></p:sld>`,
    "ppt/slides/slide1.xml": `<p:sld ${ns}><p:cSld><p:spTree>${title("Surface slide two")}</p:spTree></p:cSld></p:sld>`,
    "ppt/slides/_rels/slide2.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`,
    "ppt/notesSlides/notesSlide1.xml": `<p:notes ${ns}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Presenter note</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`,
  })
}

for (const format of ["markdown", "json", "chunks"]) {
  test(`#80 CLI ${format}: PPTX returns failure JSON and leaves output untouched`, { timeout: 30000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), "kordoc-pptx-cli-"))
    try {
      const input = join(dir, "presentation.pptx")
      const output = join(dir, "output.txt")
      writeFileSync(input, await makePptx())
      // Exercise both no output creation and no overwrite of an existing file.
      if (format === "json") writeFileSync(output, "existing output")

      const result = spawnSync(process.execPath, [
        "--import", "tsx", CLI, input, "--format", format, "--output", output, "--silent",
      ], { cwd: ROOT, encoding: "utf-8", timeout: 20000, env: { ...process.env, KORDOC_OFFLINE: "1" } })

      assert.ifError(result.error)
      assert.equal(result.status, 1, result.stderr)
      const failure = JSON.parse(result.stdout)
      assert.equal(failure.success, false)
      assert.equal(failure.fileType, "pptx")
      assert.equal(failure.code, "PARSE_ERROR")
      assert.match(failure.error, /PPTX/)
      assert.match(failure.error, /presentation parts are missing/)
      assert.match(result.stderr, /PPTX/)
      if (format === "json") assert.equal(readFileSync(output, "utf-8"), "existing output")
      else assert.equal(existsSync(output), false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}

test("PPTX CLI and NDJSON worker parse the same valid slides", { timeout: 30000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zero1-pptx-surfaces-"))
  try {
    const input = join(dir, "valid.pptx")
    writeFileSync(input, await makeValidPptx())
    const cli = spawnSync(process.execPath, ["--import", "tsx", CLI, input, "--format", "json", "--silent"],
      { cwd: ROOT, encoding: "utf-8", timeout: 20000 })
    assert.equal(cli.status, 0, cli.stderr)
    const result = JSON.parse(cli.stdout)
    assert.equal(result.success, true)
    assert.equal(result.fileType, "pptx")
    assert.equal(result.pageCount, 2)
    assert.match(result.markdown, /Surface slide one[\s\S]*Surface slide two/)
    assert.match(result.markdown, /Presenter note/)

    const worker = spawnSync(process.execPath, ["--import", "tsx", CLI, "parse-worker"], {
      cwd: ROOT, encoding: "utf-8", timeout: 20000,
      input: `${JSON.stringify({ id: 1, file: input, images: false, ocr: "off" })}\n${JSON.stringify({ cmd: "quit" })}\n`,
    })
    assert.equal(worker.status, 0, worker.stderr)
    const response = worker.stdout.trim().split("\n").map(line => JSON.parse(line))
    assert.equal(response[0].ready, true)
    assert.equal(response[1].result.success, true)
    assert.equal(response[1].result.fileType, "pptx")
    assert.equal(response[1].result.markdown, result.markdown)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("#80 MCP: unsupported PPTX and supported ZIP metadata stay distinct", { timeout: 60000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "kordoc-pptx-mcp-"))
  const client = new Client({ name: "pptx-regression", version: "1.0.0" })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", MCP],
    cwd: ROOT,
    env: { KORDOC_OFFLINE: "1", KORDOC_ROOT: dir },
    stderr: "pipe",
  })
  let stderr = ""
  transport.stderr?.on("data", (data: Buffer) => { stderr += data.toString() })

  const callTool = async (name: string, path: string) => {
    const result = await client.callTool({ name, arguments: { file_path: path } }, undefined, { timeout: 10000 })
    const content = result.content as { type: string; text?: string }[]
    return { isError: result.isError, text: content.filter(item => item.type === "text").map(item => item.text).join("\n") }
  }

  try {
    const pptx = await makePptx()
    const renamed = join(dir, "presentation.hwpx")
    const original = join(dir, "presentation.pptx")
    writeFileSync(renamed, pptx)
    writeFileSync(original, pptx)
    try {
      await client.connect(transport, { timeout: 20000 })
    } catch (error) {
      throw new Error(`MCP connection failed: ${stderr}`, { cause: error })
    }

    await t.test("detect_format identifies PPTX content behind a .hwpx extension", async () => {
      const result = await callTool("detect_format", renamed)
      assert.notEqual(result.isError, true, result.text)
      assert.equal(result.text, `${renamed}: pptx`)
    })

    for (const tool of ["parse_document", "parse_metadata"]) {
      await t.test(`${tool} rejects PPTX content behind a .hwpx extension`, async () => {
        const result = await callTool(tool, renamed)
        assert.equal(result.isError, true, result.text)
        assert.match(result.text, /PPTX/)
        assert.match(result.text, /PPTX/)
      })
    }

    // 원본 보존 채우기·패치도 "감지된 포맷: hwpx" 가 아니라 실제 포맷을 안내한다
    for (const [tool, args] of [
      ["fill_form", { file_path: renamed, fields: { 성명: "홍길동" }, output_format: "hwpx-preserve" }],
      ["patch_document", { file_path: renamed, edited_markdown: "본문", output_path: join(dir, "patched.hwpx") }],
    ] as const) {
      await t.test(`${tool} names the refined PPTX format`, async () => {
        const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 10000 })
        const text = (result.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
        assert.equal(result.isError, true, text)
        assert.match(text, /감지된 포맷: pptx/)
      })
    }

    // Containers that cannot be classified (damaged or unusual) still go to the HWPX/HWP patcher;
    // only a positively identified other format is rejected by name.
    const unknownZip = join(dir, "unknown.hwpx")
    writeFileSync(unknownZip, await makeZip({ "notes.txt": "x" }))
    const cfb = CFB.utils.cfb_new()
    CFB.utils.cfb_add(cfb, "/Notes", Buffer.from("x"))
    const unknownOle = join(dir, "unknown.hwp")
    writeFileSync(unknownOle, Buffer.from(CFB.write(cfb, { type: "buffer" })))
    for (const [path, ext] of [[unknownZip, "hwpx"], [unknownOle, "hwp"]] as const) {
      await t.test(`patch_document hands an unclassified .${ext} container to its patcher`, async () => {
        const args = { file_path: path, edited_markdown: "본문", output_path: join(dir, `patched-unknown.${ext}`) }
        const result = await client.callTool({ name: "patch_document", arguments: args }, undefined, { timeout: 10000 })
        const text = (result.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
        assert.equal(result.isError, true, text)
        assert.doesNotMatch(text, /감지된 포맷/)
      })
    }

    await t.test("detect_format accepts the native .pptx extension", async () => {
      const result = await callTool("detect_format", original)
      assert.notEqual(result.isError, true, result.text)
      assert.equal(result.text, `${original}: pptx`)
    })
    for (const tool of ["parse_document", "parse_metadata"]) {
      await t.test(`${tool} reports a malformed PPTX package, not an extension error`, async () => {
        const result = await callTool(tool, original)
        assert.equal(result.isError, true, result.text)
        assert.match(result.text, /PPTX/)
        assert.doesNotMatch(result.text, /지원하지 않는 확장자/)
      })
    }

    const valid = join(dir, "valid.pptx")
    writeFileSync(valid, await makeValidPptx())
    await t.test("parse_document reads PPTX slide, table, and notes", async () => {
      const result = await callTool("parse_document", valid)
      assert.notEqual(result.isError, true, result.text)
      assert.match(result.text, /Surface slide one[\s\S]*Surface slide two/)
      assert.match(result.text, /Presenter note/)
    })
    await t.test("parse_metadata reports PPTX title and slide count", async () => {
      const result = await callTool("parse_metadata", valid)
      assert.notEqual(result.isError, true, result.text)
      const metadata = JSON.parse(result.text)
      assert.equal(metadata.format, "pptx")
      assert.equal(metadata.title, TITLE)
      assert.equal(metadata.pageCount, 2)
    })
    await t.test("parse_pages restricts PPTX to the selected slide", async () => {
      const result = await client.callTool({ name: "parse_pages", arguments: { file_path: valid, pages: "2" } }, undefined, { timeout: 10000 })
      const text = (result.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
      assert.notEqual(result.isError, true, text)
      assert.match(text, /Surface slide two/)
      assert.doesNotMatch(text, /Surface slide one|Presenter note/)
    })
    await t.test("parse_table and parse_chunks accept PPTX parse output", async () => {
      const table = await client.callTool({ name: "parse_table", arguments: { file_path: valid, table_index: 0 } }, undefined, { timeout: 10000 })
      const tableText = (table.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
      assert.notEqual(table.isError, true, tableText)
      assert.match(tableText, /Metric.*42/)
      const chunks = await client.callTool({ name: "parse_chunks", arguments: { file_path: valid } }, undefined, { timeout: 10000 })
      const chunkText = (chunks.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
      assert.notEqual(chunks.isError, true, chunkText)
      assert.match(chunkText, /Surface slide one/)
    })
    for (const tool of ["fill_form", "patch_document"]) {
      await t.test(`${tool} still rejects PPTX editing`, async () => {
        const args = tool === "fill_form"
          ? { file_path: valid, fields: { name: "x" }, output_format: "hwpx-preserve" }
          : { file_path: valid, edited_markdown: "x", output_path: join(dir, "patched.hwpx") }
        const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 10000 })
        const text = (result.content as { type: string; text?: string }[]).map(item => item.text ?? "").join("\n")
        assert.equal(result.isError, true, text)
        assert.match(text, /\.pptx|pptx/i)
      })
    }

    const supported: Record<string, Record<string, string>> = {
      hwpx: {
        mimetype: "application/hwp+zip",
        "Contents/section0.xml": `<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"/>`,
      },
      xlsx: {
        "xl/workbook.xml": `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
        </workbook>`,
        "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
      },
      docx: {
        "word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`,
      },
    }
    for (const [format, parts] of Object.entries(supported)) {
      await t.test(`parse_metadata still extracts ${format.toUpperCase()} metadata with its refined format`, async () => {
        // Use .hwpx for every ZIP so this verifies content detection rather than the filename.
        const path = join(dir, `${format}-metadata.hwpx`)
        writeFileSync(path, await makeZip(parts))
        const result = await callTool("parse_metadata", path)
        assert.notEqual(result.isError, true, result.text)
        const metadata = JSON.parse(result.text)
        assert.equal(metadata.format, format)
        assert.equal(metadata.title, TITLE)
      })
    }
  } finally {
    await client.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
