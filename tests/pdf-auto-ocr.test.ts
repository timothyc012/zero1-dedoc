/** 텍스트층 없는 쪽 자동 OCR — ocr 미지정이면 내장 모델이 캐시에 있을 때만 켠다(다운로드 안 함) (src/pdf/parser.ts) */

import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse } from "../src/index.js"
import { getOcrModelStatus } from "../src/ocr/models.js"

/** 글자 없이 JPEG 한 장만 찍힌 한 쪽 PDF (스캔본 꼴) */
function imagePdf(jpeg: Buffer, w: number, h: number): ArrayBuffer {
  const parts: Buffer[] = []
  const offsets: number[] = []
  let len = 0
  const push = (b: Buffer | string) => { const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b; parts.push(buf); len += buf.length }
  const obj = (n: number, body: Buffer | string, stream?: Buffer) => {
    offsets[n] = len
    push(`${n} 0 obj\n`)
    push(body)
    if (stream) { push("\nstream\n"); push(stream); push("\nendstream") }
    push("\nendobj\n")
  }
  const content = Buffer.from(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`, "latin1")
  push("%PDF-1.4\n")
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${w * 2} /Height ${h * 2} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg)
  obj(5, `<< /Length ${content.length} >>`, content)
  const xref = len
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}`)
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const all = Buffer.concat(parts)
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length) as ArrayBuffer
}

async function scanPdf(): Promise<ArrayBuffer | null> {
  let sharp: typeof import("sharp")["default"]
  try { sharp = (await import("sharp")).default } catch { return null }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="200"><rect width="840" height="200" fill="white"/><text x="40" y="120" font-size="64" font-family="sans-serif">대한민국 정부 2026</text></svg>`
  return imagePdf(await sharp(Buffer.from(svg)).jpeg().toBuffer(), 420, 100)
}

describe("텍스트층 없는 쪽 자동 OCR", () => {
  it("worker off and omitted mode never invoke cached automatic OCR", async (t) => {
    if (!(await getOcrModelStatus()).every(s => s.exists)) { t.skip("OCR 모델 미설치"); return }
    const pdf = await scanPdf()
    if (!pdf) { t.skip("sharp 미설치"); return }
    const dir = mkdtempSync(join(tmpdir(), "zero1-worker-ocr-off-"))
    try {
      const file = join(dir, "scan.pdf")
      writeFileSync(file, Buffer.from(pdf))
      const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url))
      const output = execFileSync(process.execPath, ["--import", "tsx", cli, "parse-worker"], {
        encoding: "utf8", timeout: 60000,
        input: [JSON.stringify({ id: 1, file, images: false, ocr: "off" }),
          JSON.stringify({ id: 2, file, images: false }), JSON.stringify({ cmd: "quit" })].join("\n") + "\n",
        stdio: ["pipe", "pipe", "ignore"],
      })
      for (const message of output.trim().split("\n").map(line => JSON.parse(line)).filter(m => m.id)) {
        assert.equal(message.result.success, true)
        assert.ok(!message.result.warnings?.some((w: {code: string}) => w.code === "OCR_APPLIED"), `request ${message.id} ran OCR`)
        assert.ok(!message.result.markdown.includes("대한민국"))
      }
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
  it("ocr 미지정 + 모델 캐시 있음 → 스캔 쪽을 읽는다", async (t) => {
    if (!(await getOcrModelStatus()).every(s => s.exists)) { t.skip("OCR 모델 미설치"); return }
    const pdf = await scanPdf()
    if (!pdf) { t.skip("sharp 미설치"); return }
    const r = await parse(pdf, { filename: "scan.pdf" })
    assert.ok(r.success)
    const md = r.success ? r.markdown : ""
    assert.ok(md.includes("대한민국"), md)
  })

  it("모델 캐시 없음 → 다운로드하지 않고 종전처럼 NEEDS_OCR 경고만", async (t) => {
    const pdf = await scanPdf()
    if (!pdf) { t.skip("sharp 미설치"); return }
    const empty = mkdtempSync(join(tmpdir(), "kordoc-nomodel-"))
    const prev = process.env.KORDOC_MODEL_CACHE
    process.env.KORDOC_MODEL_CACHE = empty
    try {
      const r = await parse(pdf, { filename: "scan.pdf" })
      assert.ok(r.success)
      assert.ok(!(r.success ? r.markdown : "").includes("대한민국"))
      assert.ok(r.warnings?.some(w => w.code === "NEEDS_OCR"))
    } finally {
      if (prev === undefined) delete process.env.KORDOC_MODEL_CACHE
      else process.env.KORDOC_MODEL_CACHE = prev
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it("ocr: false 면 모델이 있어도 켜지 않는다", async () => {
    const pdf = await scanPdf()
    if (!pdf) return
    const r = await parse(pdf, { filename: "scan.pdf", ocr: false })
    assert.ok(!(r.success ? r.markdown : "").includes("대한민국"))
  })
})
