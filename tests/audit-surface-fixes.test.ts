/**
 * 전수 점검(2026-10-01)에서 잡은 표면 결함 — CLI 출력 이름·충돌, 청크 후처리, 쪽 범위 경고, ZIP 상한의 안 읽는 미디어,
 * 목록 뒤 문단 빈 줄, DOCX 리터럴 $, ZIP 파트 확장자, PDF 쪽 넘김 새 항목 행.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { parse } from "../src/index.js"
import { blocksToMarkdown } from "../src/table/builder.js"
import { partExtension, precheckZipSize } from "../src/utils.js"
import { nextItemHead } from "../src/pdf/table-parts.js"

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const fixture = fileURLToPath(new URL("./fixtures/dummy.hwpx", import.meta.url))
const run = (args: string[]) => spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { encoding: "utf8", timeout: 60000 })

test("CLI -d never overwrites an input without extension, and refuses stem collisions before writing", () => {
  const dir = mkdtempSync(join(tmpdir(), "kordoc-cli-"))
  try {
    const input = join(dir, "slides")
    copyFileSync(fixture, input)
    const before = readFileSync(input)
    const r = run([input, "--silent", "-d", dir])
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(readFileSync(input), before)
    assert.ok(existsSync(join(dir, "slides.md")))
    // 순차 실행도 같은 이름(줄기) 입력 둘은 쓰기 전에 거부한다 (--jobs 와 같은 규칙)
    const a = join(dir, "a.hwpx"), sub = join(dir, "sub")
    copyFileSync(fixture, a)
    const b = join(mkdtempSync(join(tmpdir(), "kordoc-cli-")), "A.hwpx")
    copyFileSync(fixture, b)
    const c = run([a, b, "--silent", "-d", sub])
    assert.equal(c.status, 1)
    assert.match(c.stderr, /collision/)
    assert.ok(!existsSync(sub))
    // -o 가 입력 파일을 가리키면 쓰지 않는다
    const o = run([a, "--silent", "-o", a])
    assert.equal(o.status, 1)
    assert.deepEqual(readFileSync(a), before)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test("CLI --format chunks applies --plain like the markdown output", () => {
  const plain = run([fixture, "--silent", "--format", "chunks", "--plain"])
  assert.equal(plain.status, 0, plain.stderr)
  const chunks = JSON.parse(plain.stdout) as Array<{ text: string }>
  assert.ok(chunks.length > 0)
  assert.ok(chunks.every(c => !/\*\*|!\[image\]/.test(c.text)), plain.stdout)
})

test("a page range outside the document warns instead of silently returning nothing", async () => {
  const r = await parse(readFileSync(fixture), { pages: "99" })
  assert.ok(r.success)
  assert.ok(r.warnings?.some(w => w.code === "PARTIAL_PARSE" && /99/.test(w.message)), JSON.stringify(r.warnings))
})

test("ZIP cap ignores media the parser never reads (video, audio, OLE embeddings)", async () => {
  const zip = new JSZip()
  zip.file("ppt/presentation.xml", "<p/>")
  zip.file("ppt/media/clip.mp4", new Uint8Array(5000))
  zip.file("ppt/embeddings/oleObject1.bin", new Uint8Array(5000))
  const buf = (await zip.generateAsync({ type: "arraybuffer" }))
  const media = { re: /^ppt\/(?:media|embeddings)\//, skip: false, never: /^ppt\/(?:embeddings\/.*|media\/.+\.mp4)$/ }
  assert.doesNotThrow(() => precheckZipSize(buf, 1000, 100, media))
  assert.throws(() => precheckZipSize(buf, 1000, 100, { re: media.re, skip: false }), /ZIP 비압축 크기 초과/)
})

test("a paragraph after a list is separated by a blank line (no lazy continuation)", () => {
  const md = blocksToMarkdown([{ type: "list", text: "항목 둘" }, { type: "paragraph", text: "일반 문단" }])
  assert.equal(md.trim(), "- 항목 둘\n\n일반 문단")
})

test("DOCX literal $ is escaped so prices are not read as math", async () => {
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
  const zip = new JSZip()
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>가격은 $10 ~ $20</w:t></w:r></w:p></w:body></w:document>`)
  const r = await parse(await zip.generateAsync({ type: "arraybuffer" }))
  assert.ok(r.success)
  assert.equal(r.markdown.trim(), "가격은 \\$10 \\~ \\$20")
})

test("ZIP part extension comes from the last path segment only", () => {
  assert.equal(partExtension("ppt/media/image1.PNG"), "png")
  assert.equal(partExtension("ppt/media.v2/image1"), "bin")
  assert.equal(partExtension("word/media/a.b/c.jpeg"), "jpeg")
})

test("PDF page-break rows: the next item head after the cell's own head starts a new row", () => {
  assert.equal(nextItemHead("커. 안전방호를 위한\n2) 2회 이상 위반", "터. 수출하기 위한 목적으로"), true)
  assert.equal(nextItemHead("3. 첫 항목", "4. 다음 항목"), true)
  assert.equal(nextItemHead("(나) 앞 항목", "(다) 뒤 항목"), true)
  // 칸 안 목록이 쪽을 넘어 이어지는 경우(머리 "1)" 다음 "3)")와 다른 꼴은 막지 않는다
  assert.equal(nextItemHead("1) 첫째\n2) 둘째", "3) 셋째"), false)
  assert.equal(nextItemHead("4) 법 제38조의", "2제1항을 위반하여"), false)
  assert.equal(nextItemHead("가. 앞", "1. 뒤"), false)
})
