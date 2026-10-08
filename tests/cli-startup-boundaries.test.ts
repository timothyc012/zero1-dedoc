/** Real subprocess boundaries: unrelated source loads fail, never mocked outputs. */
import { after, test, type TestContext } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { VERSION } from "../src/utils.js"
import { assertProcessExit, processDiagnostic, runNodeSync, runNodeWorker } from "./helpers/cli-startup-process.js"

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const DUMMY = fileURLToPath(new URL("./fixtures/dummy.hwpx", import.meta.url))
const GUARD = new URL("./fixtures/cli-startup-guard.mjs", import.meta.url).href
const HANG = fileURLToPath(new URL("./fixtures/cli-startup-hang.mjs", import.meta.url))
const dir = mkdtempSync(join(tmpdir(), "kordoc-startup-"))
after(() => rmSync(dir, { recursive: true, force: true }))
const traceDir = process.env.CLI_STARTUP_EVIDENCE_DIR ?? dir
mkdirSync(traceDir, { recursive: true })
const unrelated = ["^render/", "^print/", "^pdf/", "^ocr/", "^diff/compare\\.ts$", "^(xls|xlsx|docx|pptx|hwp3|hwp5|hwpml)/parser\\.ts$"]
const noGenerate = "^hwpx/(generator\\.ts$|gen-)"
const conversion = [...unrelated, noGenerate]
const controls = [...conversion, "^parse\\.ts$", "^hwpx/parser\\.ts$", "^form/"]
let sequence = 0
function guarded(t: TestContext, denied: string[]) {
  const trace = join(traceDir, `source-${++sequence}.jsonl`)
  writeFileSync(trace, "")
  t.after(() => {
    const modules = [...new Set(readFileSync(trace, "utf-8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as string))].sort()
    t.diagnostic(JSON.stringify({ scenario: t.name, sourceModules: modules.length, modules }))
    for (const pattern of denied) assert.ok(!modules.some(m => new RegExp(pattern).test(m)), `forbidden load ${pattern}: ${modules.join(", ")}`)
  })
  return {
    // Node 26 deprecates the Node-20-compatible loader API; that harness warning is not CLI output.
    args: ["--no-deprecation", "--import", "tsx", "--import", GUARD, CLI],
    env: { ...process.env, KORDOC_TEST_DENY_SOURCE: JSON.stringify(denied), KORDOC_TEST_SOURCE_TRACE: trace },
  }
}

// First prove the guard actually intercepts tsx-transformed application imports.
test("import guard positive control rejects the real renderer", () => {
  const target = new URL("../src/render/svg-render.ts", import.meta.url).href
  const r = runNodeSync(["--import", "tsx", "--import", GUARD, "--input-type=module", "-e", `await import(${JSON.stringify(target)})`], 10000,
    { ...process.env, KORDOC_TEST_DENY_SOURCE: JSON.stringify(["^render/"]) })
  assertProcessExit(r, 1)
  assert.match(r.stderr, /CLI_STARTUP_IMPORT_GUARD: render\/svg-render\.ts/)
})

for (const args of [["--version"], ["--help"], ["fill", "--help"], ["generate", "--help"], ["render-worker", "--help"]]) {
  test(`startup boundary ${args.join(" ")}`, t => {
    const g = guarded(t, controls)
    const r = runNodeSync([...g.args, ...args], 30000, g.env)
    assertProcessExit(r, 0)
    assert.equal(r.stderr, "")
    if (args[0] === "--version") {
      assert.equal(r.stdout.trim(), VERSION)
    } else {
      assert.match(r.stdout, /Usage: zero1-dedoc/)
      if (args[0] === "--help") for (const name of ["fill", "generate", "render-worker", "parse-worker"]) assert.ok(r.stdout.includes(name))
    }
  })
}

for (const format of ["markdown", "json", "chunks"]) {
  test(`unsupported ${format} keeps failure JSON without any format parser`, t => {
    const file = join(dir, `unknown-${format}.bin`), out = join(dir, `unknown-${format}.out`)
    writeFileSync(file, Buffer.from([0xde, 0xad, 0xbe, 0xef]))
    const g = guarded(t, [...conversion, "^hwpx/parser\\.ts$"])
    const r = runNodeSync([...g.args, file, "--format", format, "-o", out], 60000, g.env)
    assertProcessExit(r, 1)
    assert.deepEqual(JSON.parse(r.stdout), {
      success: false, fileType: "unknown", error: "지원하지 않는 파일 형식입니다.", code: "UNSUPPORTED_FORMAT", file: `unknown-${format}.bin`,
    })
    assert.match(r.stderr, /FAIL/)
    assert.equal(existsSync(out), false)
  })
}

test("HWPX batch keeps separate image bytes and manifests without unrelated formats", async t => {
  const g = guarded(t, conversion)
  const out = join(dir, "batch")
  const inputs: string[] = []
  const colors = [
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ]
  for (const [i, stem] of ["a", "b 문서"].entries()) {
    const zip = await JSZip.loadAsync(readFileSync(DUMMY))
    zip.file("BinData/extra.png", Buffer.from(colors[i], "base64"))
    const path = join(dir, `${stem}.hwpx`)
    writeFileSync(path, await zip.generateAsync({ type: "nodebuffer" }))
    inputs.push(path)
  }
  const r = runNodeSync([...g.args, ...inputs, "-d", out], 60000, g.env)
  assertProcessExit(r, 0)
  assert.equal(r.stdout, "")
  assert.match(r.stderr, /OK/)
  for (const [i, stem] of ["a", "b 문서"].entries()) {
    assert.match(readFileSync(join(out, `${stem}.md`), "utf-8"), /서면자문 의견서/)
    const manifest = JSON.parse(readFileSync(join(out, "images", stem, "manifest.json"), "utf-8"))
    const image = manifest.find((m: { source?: string }) => m.source === "BinData/extra.png")
    const bytes = Buffer.from(colors[i], "base64")
    assert.ok(image)
    assert.equal(image.mimeType, "image/png")
    assert.equal(image.bytes, bytes.length)
    assert.deepEqual(readFileSync(join(out, "images", stem, image.name)), bytes)
  }
  assert.equal(existsSync(join(out, "images", "manifest.json")), false)
})

test("preserving fill changes the value but preserves other ZIP entries without parsing", async t => {
  const g = guarded(t, [...conversion, "^parse\\.ts$", "^hwpx/parser\\.ts$"])
  const file = join(dir, "form.hwpx"), out = join(dir, "filled.hwpx")
  const zip = await JSZip.loadAsync(readFileSync(DUMMY))
  const section = await zip.file("Contents/section0.xml")!.async("string")
  zip.file("Contents/section0.xml", section.replace("</hs:sec>", "<hp:p><hp:run><hp:t>성명: </hp:t></hp:run></hp:p></hs:sec>"))
  zip.file("BinData/untouched.bin", Buffer.from([1, 2, 3, 4]))
  writeFileSync(file, await zip.generateAsync({ type: "nodebuffer" }))
  const r = runNodeSync([...g.args, "fill", file, "-f", "성명=경계검증", "--require-unique", "-o", out], 30000, g.env)
  assertProcessExit(r, 0)
  assert.equal(r.stdout, "")
  assert.match(r.stderr, /원본 스타일 보존/)
  const filled = await JSZip.loadAsync(readFileSync(out))
  assert.match(await filled.file("Contents/section0.xml")!.async("string"), /경계검증/)
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && name !== "Contents/section0.xml") assert.deepEqual(await filled.file(name)!.async("nodebuffer"), await entry.async("nodebuffer"))
  }
})

for (const [flag, value, diagnostic] of [["--pt", "abc", /pt/i], ["--line-spacing", "nope", /linespacing/i]] as const) {
  test(`invalid generate ${flag} is status 1 without unrelated parsers/renderers`, t => {
    const g = guarded(t, unrelated)
    const file = join(dir, `invalid-${flag}.md`), out = join(dir, `invalid-${flag}.hwpx`)
    writeFileSync(file, "# 제목\n\n본문")
    const r = runNodeSync([...g.args, "generate", file, "-o", out, flag, value, "--silent"], 30000, g.env)
    assertProcessExit(r, 1)
    assert.equal(r.stdout, "")
    assert.match(r.stderr, diagnostic)
    assert.equal(existsSync(out), false)
  })
}

for (const command of ["render-worker", "parse-worker"]) {
  for (const invalid of [false, true]) {
    test(`${command} ${invalid ? "null/JSON/missing fields then " : ""}quit with stdin open`, async t => {
      const g = guarded(t, controls)
      const input = (invalid ? 'null\nnot-json\n{"id":9}\n' : "") + '{"cmd":"quit"}\n'
      const r = await runNodeWorker([...g.args, command], { input, timeout: 10000, env: g.env, waitForReady: true })
      assertProcessExit(r, 0)
      assert.equal(r.stderr, "")
      const lines = r.stdout.trim().split("\n").map(line => JSON.parse(line))
      assert.equal(lines.filter(line => line.ready).length, 1)
      assert.equal(lines.length, invalid ? 4 : 1)
      if (command === "parse-worker") assert.equal(lines[0].protocol, 1)
      if (invalid) {
        assert.equal(lines[1].error, "JSON 객체가 아닙니다")
        assert.equal(lines[2].error, "잘못된 JSON 라인")
        assert.equal(lines[3].id, 9)
        // render-worker's missing-field Error is intentionally sanitized; preserve that wire contract.
        assert.equal(lines[3].error, command === "render-worker" ? "문서 처리 중 오류가 발생했습니다" : "file 필수")
        if (command === "render-worker") for (const line of lines.slice(1)) assert.equal(line.ok, false)
      }
    })
  }
}

test("render-worker valid render positive control writes real SVG then quits", async t => {
  const { markdownToHwpx } = await import("../src/hwpx/generator.js")
  const file = join(dir, "render.hwpx"), out = join(dir, "render.svg")
  writeFileSync(file, Buffer.from(await markdownToHwpx("# Boundary render\n\nReal SVG output")))
  const g = guarded(t, []) // Observe, but do not deny renderer imports in the positive control.
  const r = await runNodeWorker([...g.args, "render-worker"], {
    input: JSON.stringify({ id: 1, file, out, reflow: true }) + '\n{"cmd":"quit"}\n',
    timeout: 10000, env: g.env, waitForReady: true,
  })
  assertProcessExit(r, 0)
  const lines = r.stdout.trim().split("\n").map(line => JSON.parse(line))
  assert.equal(lines.length, 2)
  assert.equal(lines[0].ready, true)
  assert.equal(lines[1].id, 1)
  assert.equal(lines[1].ok, true, processDiagnostic(r))
  assert.ok(lines[1].pageCount > 0)
  assert.ok(lines[1].stats.texts > 0)
  assert.match(readFileSync(out, "utf-8"), /<svg/)
  assert.match(readFileSync(out, "utf-8"), /Real SVG output/)
})

test("sync deliberate hang is a timeout, not validation exit 1", () => {
  const r = runNodeSync([HANG], 1000)
  assert.equal(r.timedOut, true, processDiagnostic(r))
  assert.equal((r.error as NodeJS.ErrnoException).code, "ETIMEDOUT")
  assert.equal(r.closed, true)
  assert.throws(() => assertProcessExit(r, 1), /subprocess timeout/)
})

test("worker deliberate hang is killed and closed before timeout result", async () => {
  const r = await runNodeWorker([HANG, "--ready"], { input: "", timeout: 2000 })
  assert.equal(r.timedOut, true, processDiagnostic(r))
  assert.equal(r.closed, true)
  assert.equal(r.signal, "SIGKILL")
  assert.equal(r.phase, "protocol", processDiagnostic(r))
  assert.match(r.stderr, /CLI_STARTUP_DELIBERATE_HANG/)
  assert.throws(() => assertProcessExit(r, 1), /subprocess timeout/)
  assert.throws(() => process.kill(r.pid!, 0), /ESRCH|no such process/i)
})
