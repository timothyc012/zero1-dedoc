/** Public and CLI callers must use one parser implementation. */
import { test } from "node:test"
import assert from "node:assert/strict"
import * as publicApi from "../src/index.js"
import * as parser from "../src/parse.js"

const names = [
  "parse", "parseImage", "parseHwp3", "parseHwpx", "parseHwp", "parsePdf",
  "parseXlsx", "parseXls", "parseDocx", "parsePptx", "parseHwpml",
] as const

for (const name of names) {
  test(`public ${name} re-exports the shared parser function`, () => {
    assert.equal(typeof publicApi[name], "function")
    assert.strictEqual(publicApi[name], parser[name], `${name} must not retain a second implementation`)
  })
}
