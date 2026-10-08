import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import JSZip from "jszip"
import { registerGenerateTools } from "../src/mcp/tools-generate.js"
import { symlinkOrSkip } from "./helpers/symlink.js"

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c90000000049454e44ae426082", "hex")

async function fixture(run: (root: string, outside: string, generate: (url: string) => Promise<{ images: Buffer[]; text: string }>) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "kordoc-mcp-images-"))
  const root = join(dir, "root")
  const outside = join(dir, "outside")
  const previousRoot = process.env.KORDOC_ROOT
  try {
    await mkdir(root)
    await mkdir(outside)
    process.env.KORDOC_ROOT = root
    let callback: any
    registerGenerateTools({ tool(name: string, ...args: any[]) {
      if (name === "generate_document") callback = args.at(-1)
    } } as any)
    await run(root, outside, async url => {
      const output = join(root, "output.hwpx")
      const result = await callback({ markdown: `![figure](${url})`, image_dir: root, output_path: output })
      assert.ok(!result.isError, JSON.stringify(result))
      const zip = await JSZip.loadAsync(await readFile(output))
      const images = await Promise.all(Object.values(zip.files)
        .filter(file => !file.dir && file.name.startsWith("BinData/"))
        .map(file => file.async("nodebuffer")))
      return { images, text: result.content[0].text }
    })
  } finally {
    if (previousRoot === undefined) delete process.env.KORDOC_ROOT
    else process.env.KORDOC_ROOT = previousRoot
    await rm(dir, { recursive: true, force: true })
  }
}

test("MCP embeds Korean, encoded and nested image names without losing bytes", async () => {
  await fixture(async (root, _outside, generate) => {
    await writeFile(join(root, "재고-합계.png"), PNG)
    await writeFile(join(root, "그림 하나.png"), PNG)
    await mkdir(join(root, "그림"))
    await writeFile(join(root, "그림", "표.png"), PNG)
    for (const url of ["재고-합계.png", encodeURIComponent("그림 하나.png"), "그림/표.png"]) {
      const result = await generate(url)
      assert.ok(result.images.some(bytes => bytes.equals(PNG)), `original bytes missing: ${url}`)
      assert.doesNotMatch(result.text, /이미지 건너뜀/)
    }
  })
})

test("MCP embeds an in-root symlink without losing bytes", async (t) => {
  await fixture(async (root, _outside, generate) => {
    await writeFile(join(root, "재고-합계.png"), PNG)
    if (!symlinkOrSkip(t, join(root, "재고-합계.png"), join(root, "alias.png"))) return
    const result = await generate("alias.png")
    assert.ok(result.images.some(bytes => bytes.equals(PNG)), "original bytes missing: alias.png")
    assert.doesNotMatch(result.text, /이미지 건너뜀/)
  })
})

test("MCP blocks outside image targets and reports skipped references", async () => {
  await fixture(async (root, outside, generate) => {
    await writeFile(join(outside, "private.png"), PNG)
    for (const url of ["../outside/private.png", "%2e%2e%2foutside%2fprivate.png", join(outside, "private.png")]) {
      const result = await generate(url)
      assert.ok(!result.images.some(bytes => bytes.equals(PNG)), `outside bytes embedded: ${url}`)
      assert.match(result.text, /이미지 건너뜀/, url)
    }
    const missing = await generate("missing.png")
    assert.match(missing.text, /이미지 건너뜀/)
  })
})

for (const type of ["file", "dir"] as const) {
  test(`MCP blocks outside images through a ${type} symlink`, async (t) => {
    await fixture(async (root, outside, generate) => {
      const privateImage = join(outside, "private.png")
      await writeFile(privateImage, PNG)
      const link = type === "file" ? "linked.png" : "linked-dir"
      if (!symlinkOrSkip(t, type === "file" ? privateImage : outside, join(root, link), type)) return
      const url = type === "file" ? link : `${link}/private.png`
      const result = await generate(url)
      assert.ok(!result.images.some(bytes => bytes.equals(PNG)), `outside bytes embedded: ${url}`)
      assert.ok(result.text.includes(`이미지 건너뜀: ${url} (이미지 폴더 밖)`), result.text)
    })
  })
}
