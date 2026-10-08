import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parsePdfDocument } from "../src/pdf/parser.js"
import { getOcrModelProfile, profileSpecs } from "../src/ocr/models.js"

function shortTextPdf(): ArrayBuffer {
  const content = "BT /F1 12 Tf 72 700 Td (abc) Tj ET\n"
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  for (const [i, object] of objects.entries()) { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n` }
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  const bytes = Buffer.from(pdf, "latin1")
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer
}

describe("PDF OCR language routing with isolated offline caches", () => {
  for (const requested of ["en", "de", "Deutsch", "ko"] as const) {
    for (const matching of [false, true]) {
      it(`${requested}: only ${matching ? "matching" : "another language's"} cache enables automatic OCR`, async () => {
        const root = mkdtempSync(join(tmpdir(), "zero1-ocr-routing-"))
        const oldCache = process.env.KORDOC_MODEL_CACHE, oldOffline = process.env.KORDOC_OFFLINE
        process.env.KORDOC_MODEL_CACHE = root
        process.env.KORDOC_OFFLINE = "1"
        try {
          const language = matching ? requested : requested === "ko" ? "de" : "ko"
          const profile = getOcrModelProfile(language)
          mkdirSync(profile.directory, { recursive: true })
          // Nonempty placeholders satisfy the presence gate but fail SHA validation.
          // Offline mode forbids downloading; reaching OCR_FAILED proves dispatch
          // without loading ONNX weights or using a GPU.
          for (const spec of profileSpecs(profile)) writeFileSync(join(profile.directory, spec.filename), "invalid-test-model")
          const result = await parsePdfDocument(shortTextPdf(), { ocrLanguage: requested, images: false })
          assert.equal(!!result.warnings?.some(w => w.code === "OCR_FAILED"), matching, JSON.stringify(result.warnings))
          assert.ok(result.markdown.includes("abc"), "failed or disabled OCR must preserve extracted text")
          assert.ok(result.warnings?.some(w => w.code === "NEEDS_OCR"))
          assert.ok(!result.warnings?.some(w => w.code === "OCR_APPLIED"))
        } finally {
          if (oldCache === undefined) delete process.env.KORDOC_MODEL_CACHE
          else process.env.KORDOC_MODEL_CACHE = oldCache
          if (oldOffline === undefined) delete process.env.KORDOC_OFFLINE
          else process.env.KORDOC_OFFLINE = oldOffline
          rmSync(root, { recursive: true, force: true })
        }
      })
    }
  }
})

describe("PDF OCR result preservation", () => {
  it("preserves extracted text and retry signals when a custom provider returns no text", async () => {
    let calls = 0
    const result = await parsePdfDocument(shortTextPdf(), { images: false, ocr: async () => { calls++; return "  " } })
    assert.equal(calls, 1)
    assert.ok(result.markdown.includes("abc"), JSON.stringify(result))
    assert.ok(result.warnings?.some(w => w.code === "OCR_FAILED"))
    assert.ok(!result.warnings?.some(w => w.code === "OCR_APPLIED"))
    assert.ok(result.warnings?.some(w => w.code === "NEEDS_OCR"))
    assert.ok(result.pageQuality?.every(p => !p.ocrApplied))
  })

  it("still replaces the low-text page when the provider returns recognized text", async () => {
    const result = await parsePdfDocument(shortTextPdf(), { images: false, ocr: async () => "Recovered German invoice text" })
    assert.ok(result.markdown.includes("Recovered German invoice text"))
    assert.ok(!result.markdown.includes("abc"))
    assert.ok(result.warnings?.some(w => w.code === "OCR_APPLIED"))
    assert.ok(!result.warnings?.some(w => w.code === "OCR_FAILED" || w.code === "NEEDS_OCR"))
  })
})
