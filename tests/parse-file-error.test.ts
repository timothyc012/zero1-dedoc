import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "../src/index.js"

test("parse(filePath) classifies a missing input as FILE_NOT_FOUND", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kordoc-parse-path-"))
  try {
    const result = await parse(join(dir, "missing.hwpx"))
    assert.equal(result.success, false)
    if (result.success) return
    assert.equal(result.fileType, "unknown")
    assert.equal(result.code, "FILE_NOT_FOUND")
    assert.match(result.error, /파일을 찾을 수 없습니다/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("other input read failures preserve the existing PARSE_ERROR classification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kordoc-parse-path-"))
  try {
    const result = await parse(dir)
    assert.equal(result.success, false)
    if (result.success) return
    assert.equal(result.code, "PARSE_ERROR")
    assert.match(result.error, /파일 읽기 실패/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
