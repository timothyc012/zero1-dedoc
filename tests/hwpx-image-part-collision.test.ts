import { test } from "node:test"
import assert from "node:assert/strict"
import JSZip from "jszip"
import { markdownToHwpx } from "../src/hwpx/generator.js"
import { ImageRegistry } from "../src/hwpx/gen-image.js"
import { parseHwpx } from "../src/index.js"

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c90000000049454e44ae426082", "hex")

for (const preset of [undefined, "official"] as const) {
  test(`HWPX ${preset ?? "default"} generation preserves actual image bytes when a placeholder URL matches its part name`, async () => {
    const buffer = await markdownToHwpx("![actual](a-b.png)\n\n![placeholder](a_b.png)", {
      images: { "a-b.png": PNG },
      ...(preset ? { gongmun: { preset } } : {}),
    })
    const zip = await JSZip.loadAsync(buffer)
    const binaries = Object.values(zip.files).filter(file => !file.dir && file.name.startsWith("BinData/"))
    assert.equal(binaries.length, 2, "two image references require two distinct ZIP parts")
    assert.ok((await Promise.all(binaries.map(file => file.async("nodebuffer")))).some(data => data.equals(PNG)), "actual pixels must remain unchanged")
    const manifest = await zip.file("Contents/content.hpf")!.async("text")
    const hrefs = [...manifest.matchAll(/href="(BinData\/[^"]+)"/g)].map(match => match[1])
    assert.equal(new Set(hrefs).size, 2)
    for (const href of hrefs) assert.ok(zip.file(href), href)
    const parsed = await parseHwpx(buffer)
    assert.ok(parsed.success)
    assert.equal(parsed.images?.length, 2)
    assert.ok(parsed.images?.some(image => Buffer.from(image.data).equals(PNG)))
  })
}

test("image part allocation keeps IDs and ZIP names unique across real, placeholder, and data URI references", () => {
  const dataUri = `data:image/png;base64,${PNG.toString("base64")}`
  const registry = new ImageRegistry(new Map([["a-b.png", PNG], ["a_b_1.png", PNG]]))
  for (const url of ["a-b.png", "a_b.png", "a_b_1.png", dataUri, "image1.png"]) assert.ok(registry.take(url))
  assert.equal(new Set(registry.parts.map(part => part.name)).size, 5)
  assert.equal(new Set(registry.parts.map(part => part.itemId)).size, 5)
  assert.equal(registry.take("a-b.png"), registry.parts[0], "repeated URL is deduplicated")
  assert.equal(registry.parts.length, 5)
})

test("non-colliding placeholder ZIP paths keep their original names", () => {
  const registry = new ImageRegistry()
  assert.equal(registry.take("a-b.png")?.name, "BinData/a-b.png")
  assert.equal(registry.take("a_b.png")?.name, "BinData/a_b.png")
  assert.equal(registry.take("a_b.png"), registry.parts[1])
})
