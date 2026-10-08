import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadGenerationImages } from "../src/shared/generate-images.js"

for (const url of ["C:/outside/private.png", "C:\\outside\\private.png", "z:/outside/private.png", "z:\\outside\\private.png"]) {
  test(`loadGenerationImages rejects Windows drive paths with a warning: ${url}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "kordoc-image-paths-"))
    try {
      const result = await loadGenerationImages(`![outside](${url})`, root)
      assert.deepEqual(Object.keys(result.images), [])
      assert.deepEqual(result.warnings, [`이미지 건너뜀: ${url} (이미지 폴더 밖)`])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

test("loadGenerationImages preserves local image confinement and ignores remote/data schemes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "kordoc-image-paths-"))
  const root = join(dir, "images")
  const bytes = Buffer.from("local image bytes")
  try {
    await mkdir(root)
    await writeFile(join(root, "그림 하나.png"), bytes)
    await writeFile(join(dir, "private.png"), bytes)
    const allowed = encodeURIComponent("그림 하나.png")
    const rejected = ["../private.png", "%2e%2e%2fprivate.png", "/private.png", "..\\private.png", "C%3A%2Foutside%2Fprivate.png", "bad%00.png"]
    const ignored = ["https://example.invalid/image.png", "data:image/png;base64,AAAA"]
    const markdown = [allowed, allowed, ...rejected, ...ignored].map(url => `![image](${url})`).join("\n")
    const result = await loadGenerationImages(markdown, root)
    assert.deepEqual(Object.keys(result.images), [allowed])
    assert.deepEqual(Buffer.from(result.images[allowed]), bytes)
    assert.deepEqual(result.warnings, rejected.map(url => `이미지 건너뜀: ${url} (이미지 폴더 밖)`))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
