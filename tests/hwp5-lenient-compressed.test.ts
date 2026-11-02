import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { deflateRawSync } from "node:zlib"
import { openHwp5Container, parseHwp5Document, readHwp5SectionStreams, readHwp5SectionRecords } from "../src/hwp5/parser.js"
import { simplePara } from "./fixtures/hwp5-records.js"
import { renderDocumentToScene } from "../src/render/index.js"

const CFB = createRequire(import.meta.url)("cfb")
const text = "압축된 복구 본문은 그대로 남아야 합니다"
const records = simplePara(text, [{ vertpos: 0, horzsize: 48190 }])
const section = Buffer.concat(records.flatMap(record => {
  const header = Buffer.alloc(4)
  header.writeUInt32LE(record.tagId | (record.level << 10) | (record.data.length << 20))
  return [header, record.data]
}))

function document(compressed: boolean, damaged: boolean, sectionName = "Section0"): Buffer {
  const fileHeader = Buffer.alloc(256)
  fileHeader.write("HWP Document File", 0, "ascii")
  fileHeader.writeUInt32LE(0x05000300, 32)
  fileHeader.writeUInt32LE(compressed ? 1 : 0, 36)
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, "/FileHeader", fileHeader)
  CFB.utils.cfb_add(cfb, "/DocInfo", compressed ? deflateRawSync(Buffer.alloc(0)) : Buffer.alloc(0))
  CFB.utils.cfb_add(cfb, `/BodyText/${sectionName}`, compressed ? deflateRawSync(section) : section)
  const data = Buffer.from(CFB.write(cfb, { type: "buffer" }))
  // Lenient recovery accepts a damaged major-version field while preserving the real FAT/streams.
  if (damaged) data.writeUInt16LE(2, 26)
  return data
}

for (const compressed of [false, true]) {
  for (const sectionName of ["Section0", "Section2"]) {
    test(`lenient ${compressed ? "compressed" : "uncompressed"} ${sectionName} streams preserve bytes and body text`, () => {
      const buffer = document(compressed, true, sectionName)
      const container = openHwp5Container(buffer)
      assert.ok(container.lenientCfb, "exercise the real strict-to-lenient fallback")
      const streams = readHwp5SectionStreams(container)
      assert.equal(streams.length, 1)
      assert.deepEqual(streams[0], compressed ? deflateRawSync(section) : section, "BodyText stream remains raw for the shared reader")
      const warnings: any[] = []
      const parsedRecords = readHwp5SectionRecords(container, streams, warnings)
      assert.ok(parsedRecords[0]?.length)
      assert.equal(warnings.length, 0)
      const result = parseHwp5Document(buffer)
      assert.ok(result.markdown.includes(text), result.markdown)
      assert.ok(result.warnings?.some(warning => warning.code === "LENIENT_CFB_RECOVERY"))
      assert.ok(!result.warnings?.some(warning => warning.code === "PARTIAL_PARSE"))
    })
  }
}

test("strict compressed HWP5 retains the same body as lenient recovery", () => {
  const strict = parseHwp5Document(document(true, false))
  const lenient = parseHwp5Document(document(true, true))
  assert.ok(strict.markdown.includes(text))
  assert.equal(lenient.markdown, strict.markdown)
})

test("layout rendering also reads recovered compressed HWP5 body records once", async () => {
  const result = await renderDocumentToScene(document(true, true))
  assert.ok([...result.pageSvgs.values()].some(svg => svg.includes(text)))
})
