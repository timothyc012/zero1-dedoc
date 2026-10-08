import { appendFileSync } from "node:fs"

const sourceRoot = new URL("../../src/", import.meta.url).href
const forbidden = JSON.parse(process.env.KORDOC_TEST_DENY_SOURCE ?? "[]")

export async function load(url, context, nextLoad) {
  if (url.startsWith(sourceRoot)) {
    const source = decodeURIComponent(url.slice(sourceRoot.length).split("?")[0])
    if (process.env.KORDOC_TEST_SOURCE_TRACE) {
      appendFileSync(process.env.KORDOC_TEST_SOURCE_TRACE, JSON.stringify(source) + "\n")
    }
    if (forbidden.some(pattern => new RegExp(pattern).test(source))) {
      const message = `CLI_STARTUP_IMPORT_GUARD: ${source}`
      // Keep the marker even if production code sanitizes the thrown error.
      process.stderr.write(message + "\n")
      throw new Error(message)
    }
  }
  return nextLoad(url, context)
}
