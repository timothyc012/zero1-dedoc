/** #98 — 여러 문서를 같은 폴더로 변환해도 그림이 서로 덮어쓰이지 않는다 (images/<문서 이름>/) */

import { test } from "node:test"
import assert from "node:assert/strict"
import { assertProcessExit, runNodeSync } from "./helpers/cli-startup-process.js"
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const DUMMY = fileURLToPath(new URL("./fixtures/dummy.hwpx", import.meta.url))
const runCli = (args: string[]) => runNodeSync(["--import", "tsx", CLI, ...args], 60000)

/** dummy.hwpx 에 서로 다른 PNG 를 넣은 문서 */
async function docWith(dir: string, name: string, pngB64: string): Promise<string> {
  const JSZip = require("jszip")
  const zip = await JSZip.loadAsync(readFileSync(DUMMY))
  zip.file("BinData/extra.png", Buffer.from(pngB64, "base64"))
  const p = join(dir, name)
  writeFileSync(p, await zip.generateAsync({ type: "nodebuffer" }))
  return p
}
const RED = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="
const BLUE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

test("#98 -d 일괄 변환 — 문서마다 images/<문서 이름>/ 에 그림·manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kordoc-imgdir-"))
  try {
    const a = await docWith(dir, "a.hwpx", RED), b = await docWith(dir, "b 문서.hwpx", BLUE)
    const out = join(dir, "out")
    const r = runCli(["-d", out, a, b])
    assertProcessExit(r, 0)
    for (const [stem, b64] of [["a", RED], ["b 문서", BLUE]] as const) {
      const manifest = JSON.parse(readFileSync(join(out, "images", stem, "manifest.json"), "utf-8"))
      const entry = manifest.find((m: { source?: string }) => m.source === "BinData/extra.png")
      assert.ok(entry, `${stem} manifest`)
      assert.deepEqual(readFileSync(join(out, "images", stem, entry.name)), Buffer.from(b64, "base64"))
    }
    assert.ok(!existsSync(join(out, "images", "manifest.json")), "공용 images/manifest.json 은 없다")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("#98 -o 로 같은 폴더에 차례로 변환해도 앞 문서 그림이 남는다", async () => {
  const dir = mkdtempSync(join(tmpdir(), "kordoc-imgdir-"))
  try {
    const a = await docWith(dir, "a.hwpx", RED), b = await docWith(dir, "b.hwpx", BLUE)
    assertProcessExit(runCli([a, "-o", join(dir, "a.md")]), 0)
    assertProcessExit(runCli([b, "-o", join(dir, "b.md")]), 0)
    const ma = JSON.parse(readFileSync(join(dir, "images", "a", "manifest.json"), "utf-8"))
    const ea = ma.find((m: { source?: string }) => m.source === "BinData/extra.png")
    assert.deepEqual(readFileSync(join(dir, "images", "a", ea.name)), Buffer.from(RED, "base64"))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
