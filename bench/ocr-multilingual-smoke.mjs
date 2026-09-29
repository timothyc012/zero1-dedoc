#!/usr/bin/env node
// Language-profile OCR gate. Inputs are supplied separately so private or
// licensed documents never enter the repository.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { parse } from "../dist/index.js"

const [language, pdfPath, ...anchors] = process.argv.slice(2)
if (!language || !pdfPath || anchors.length === 0 || !["korean", "en", "de"].includes(language)) {
  console.error("Usage: npm run bench:ocr-multilingual -- <korean|en|de> <PDF> <required text...>")
  process.exit(2)
}

const bytes = await readFile(pdfPath)
const result = await parse(bytes, { ocr: true, ocrLanguage: language, images: false })
assert.equal(result.success, true, result.success ? "" : result.error)
assert.ok(result.warnings?.some(w => w.code === "OCR_APPLIED"), JSON.stringify(result.warnings))
for (const anchor of anchors) assert.match(result.markdown, new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing OCR anchor: ${anchor}`)

console.log(JSON.stringify({
  parser: "zero1-dedoc",
  language,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  pages: result.pageCount,
  anchors,
  markdownChars: result.markdown.length,
  warnings: result.warnings?.map(w => w.code) ?? [],
  peakRssMb: Math.round(process.memoryUsage().rss / 1048576),
}))
