import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, symlinkSync, linkSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"
import { convertFiles } from "../src/cli/convert.js"

const fixture = fileURLToPath(new URL("./fixtures/dummy.hwpx", import.meta.url))
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const bytes = readFileSync(fixture)
const temp = () => mkdtempSync(join(tmpdir(), "kordoc-output-guard-"))
const opts = { silent: true, format: "markdown" }

for (const alias of ["symlink", "hardlink"] as const) {
  test(`conversion refuses an output ${alias} alias of its input without changing bytes`, async () => {
    const dir = temp()
    try {
      const input = join(dir, "source.hwpx"), output = join(dir, "result.md")
      writeFileSync(input, bytes)
      if (alias === "symlink") symlinkSync(input, output)
      else linkSync(input, output)
      const json: string[] = []
      const ok = await convertFiles([input], { ...opts, output }, text => json.push(text))
      assert.ok(readFileSync(input).equals(bytes), "input bytes must remain unchanged")
      assert.equal(ok, false)
      const failure = JSON.parse(json.join(""))
      assert.equal(failure.success, false)
      assert.equal(failure.fileType, "hwpx")
      assert.equal(failure.file, "source.hwpx")
      assert.equal(failure.code, "PARSE_ERROR")
      assert.ok(failure.error.length > 0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}

test("out-dir through a symlink parent cannot overwrite the same input", async () => {
  const dir = temp()
  try {
    const sourceDir = join(dir, "source"), aliasDir = join(dir, "alias")
    mkdirSync(sourceDir)
    symlinkSync(sourceDir, aliasDir, "dir")
    const input = join(sourceDir, "document.md")
    writeFileSync(input, bytes)
    const json: string[] = []
    const ok = await convertFiles([input], { ...opts, outDir: aliasDir }, text => json.push(text))
    assert.ok(readFileSync(input).equals(bytes), "input bytes must remain unchanged")
    assert.equal(ok, false)
    assert.equal(JSON.parse(json.join("")).success, false)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

for (const imageOutput of ["image_001.png", "manifest.json"]) {
  test(`extracted ${imageOutput} cannot overwrite an input through an alias`, async () => {
    const dir = temp()
    try {
      const zip = await JSZip.loadAsync(bytes)
      zip.file("BinData/extra.png", Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"))
      const data = await zip.generateAsync({ type: "nodebuffer" })
      const input = join(dir, "source.hwpx"), outDir = join(dir, "out"), imageDir = join(outDir, "images", "source")
      writeFileSync(input, data)
      mkdirSync(imageDir, { recursive: true })
      symlinkSync(input, join(imageDir, imageOutput))
      const json: string[] = []
      const ok = await convertFiles([input], { ...opts, outDir }, text => json.push(text))
      assert.ok(readFileSync(input).equals(data), "input bytes must remain unchanged")
      assert.equal(ok, false)
      assert.equal(existsSync(join(outDir, "source.md")), false, "validate all destinations before document writes")
      assert.equal(JSON.parse(json.join("")).success, false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}

for (const jobs of ["1", "2"]) {
  test(`batch jobs=${jobs} protects every input from other documents' destinations`, () => {
    const dir = temp()
    try {
      const first = join(dir, "first.hwpx"), second = join(dir, "second.hwpx"), outDir = join(dir, "out")
      writeFileSync(first, bytes)
      writeFileSync(second, bytes)
      mkdirSync(outDir)
      symlinkSync(second, join(outDir, "first.md"))
      const result = spawnSync(process.execPath, ["--import", "tsx", cli, first, second, "--silent", "--jobs", jobs, "-d", outDir], { encoding: "utf8", timeout: 60000 })
      assert.ok(readFileSync(first).equals(bytes), "first input bytes must remain unchanged")
      assert.ok(readFileSync(second).equals(bytes), "second input bytes must remain unchanged")
      assert.equal(result.status, 1, result.stderr)
      const failure = JSON.parse(result.stdout)
      assert.equal(failure.success, false)
      assert.equal(failure.file, "first.hwpx")
      assert.ok(existsSync(join(outDir, "second.md")), "safe files continue normally")
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
}

test("unrelated output symlinks and existing files remain valid destinations", async () => {
  const dir = temp()
  try {
    const input = join(dir, "source.hwpx"), target = join(dir, "existing.md"), output = join(dir, "alias.md")
    writeFileSync(input, bytes)
    writeFileSync(target, "old output")
    symlinkSync(target, output)
    assert.equal(await convertFiles([input], { ...opts, output }, () => {}), true)
    assert.deepEqual(readFileSync(input), bytes)
    assert.notEqual(readFileSync(target, "utf8"), "old output")
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
