import { test } from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { createCipheriv } from "node:crypto"
import { deflateRawSync } from "node:zlib"
import { derivePasswordKey, decryptPasswordStream } from "../src/hwp5/pw-crypto.js"
import { openHwp5Container, readHwp5BinData, parseHwp5Document } from "../src/hwp5/parser.js"
import { renderDocumentToScene } from "../src/render/index.js"
import { simplePara, rec, idMappings, binDataItem, ctrlHeader, shapeComponent, shapePicture } from "./fixtures/hwp5-records.js"

const CFB = createRequire(import.meta.url)("cfb")
const password = "synthetic-password"
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c90000000049454e44ae426082", "hex")

function encrypt(data: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", derivePasswordKey(Buffer.from(password)), null)
  cipher.setAutoPadding(false)
  const register = Buffer.alloc(16), encrypted = Buffer.alloc(data.length)
  for (let i = 0; i < data.length * 8; i++) {
    const byte = i >> 3, bit = 7 - (i & 7)
    const value = ((data[byte] >> bit) & 1) ^ (cipher.update(register)[0] >> 7)
    encrypted[byte] |= value << bit
    for (let j = 0; j < 15; j++) register[j] = ((register[j] << 1) | (register[j + 1] >> 7)) & 0xff
    register[15] = ((register[15] << 1) | value) & 0xff
  }
  assert.deepEqual(decryptPasswordStream(encrypted, password), data, "fixture encryption must roundtrip before parser verification")
  return encrypted
}

function serialize(records: ReturnType<typeof simplePara>): Buffer {
  return Buffer.concat(records.flatMap(record => {
    const header = Buffer.alloc(4)
    header.writeUInt32LE(record.tagId | (record.level << 10) | (record.data.length << 20))
    return [header, record.data]
  }))
}

function document(compressed: boolean, damaged: boolean): Buffer {
  const header = Buffer.alloc(256)
  header.write("HWP Document File", 0, "ascii")
  header.writeUInt32LE(0x05000300, 32)
  header.writeUInt32LE(2 | (compressed ? 1 : 0), 36)
  header.writeUInt32LE(4, 44)
  const docInfo = serialize([rec(0x10, 0, Buffer.alloc(26)), idMappings([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), binDataItem(1)])
  const body = serialize(simplePara("", [{ vertpos: 0, horzsize: 48190 }], {
    parts: [{ ctrl: "gso " }],
    ctrls: [ctrlHeader(1, "gso ", { tac: true, w: 1000, h: 1000 }), shapeComponent(2, "$pic", { orgW: 1000, orgH: 1000 }), shapePicture(2, 1)],
  }))
  const cfb = CFB.utils.cfb_new()
  CFB.utils.cfb_add(cfb, "/FileHeader", header)
  for (const [name, bytes] of [["/DocInfo", docInfo], ["/BodyText/Section0", body], ["/BinData/BIN0001.png", PNG]] as const) {
    CFB.utils.cfb_add(cfb, name, encrypt(compressed ? deflateRawSync(bytes) : bytes))
  }
  const result = Buffer.from(CFB.write(cfb, { type: "buffer" }))
  if (damaged) result.writeUInt16LE(2, 26)
  return result
}

for (const compressed of [false, true]) {
  for (const damaged of [false, true]) {
    test(`password HWP5 ${compressed ? "compressed" : "uncompressed"} ${damaged ? "lenient" : "strict"} preserves image pixels`, () => {
      const buffer = document(compressed, damaged)
      const container = openHwp5Container(buffer, { password })
      assert.equal(Boolean(container.lenientCfb), damaged)
      assert.ok(readHwp5BinData(container).get(1)?.data.equals(PNG), "renderer receives decrypted PNG bytes")
      const result = parseHwp5Document(buffer, { password })
      assert.equal(result.images?.length, 1)
      assert.ok(Buffer.from(result.images![0].data).equals(PNG))
      assert.ok(result.markdown.includes("image_001.png"))
      assert.ok(!result.warnings?.some(warning => warning.code === "SKIPPED_IMAGE"))
    })
  }
}

test("password-protected HWP5 layout rendering embeds the decrypted image", async () => {
  const result = await renderDocumentToScene(document(true, false), { password })
  assert.ok([...result.pageSvgs.values()].some(svg => svg.includes(PNG.toString("base64"))))
})
