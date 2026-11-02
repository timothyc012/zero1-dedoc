/** Electron 실행 파일을 node 로 쓸 때(ELECTRON_RUN_AS_NODE) CLI 인자 해석 회귀
 *
 * commander 의 `parse()` 는 인자 출처를 정하지 않으면 `process.versions.electron` 을 보고
 * Electron 앱으로 판단해 argv[1](스크립트 경로)부터 사용자 인자로 읽는다. 그러면 cli.js 자신이
 * 입력 파일로 잡히고(`cli.js (unknown) ... FAIL`) -o 는 "다중 파일" 로 무시된다.
 * kordoc 을 내장한 데스크톱 앱이 Electron 을 node 로 띄워 CLI 를 부를 때 생긴다.
 */

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
const DUMMY = fileURLToPath(new URL("./fixtures/dummy.hwpx", import.meta.url))

test("process.versions.electron 이 있어도 스크립트 경로를 입력 파일로 읽지 않는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "kordoc-electron-argv-"))
  try {
    // Electron 을 node 로 띄운 환경 흉내 — versions.electron 만 있고 defaultApp 은 없다
    const preload = join(dir, "electron-like.mjs")
    writeFileSync(preload, 'Object.defineProperty(process.versions, "electron", { value: "44.0.0", enumerable: true })\n')
    const out = join(dir, "out.md")
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", "--import", pathToFileURL(preload).href, CLI, DUMMY, "-o", out],
      { encoding: "utf-8", timeout: 30000 },
    )
    assert.equal(r.status, 0, `exit 0 이어야 함 — stderr: ${r.stderr}`)
    assert.ok(existsSync(out), "-o 가 무시되지 않고 결과 파일을 써야 함")
    assert.doesNotMatch(r.stderr, /cli\.ts/, "스크립트 경로가 입력 파일로 잡히면 안 됨")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
