import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [parserDir, benchmarkDir, engineName] = process.argv.slice(2)
if (!parserDir || !benchmarkDir || !engineName) throw new Error("parserDir benchmarkDir engineName required")
const { parse } = await import(pathToFileURL(join(parserDir, "dist/index.js")).href)
const inputs = (await readdir(join(benchmarkDir, "pdfs"))).filter(name => name.endsWith(".pdf")).sort()
const outputDir = join(benchmarkDir, "prediction", engineName, "markdown")
await mkdir(outputDir, { recursive: true })
let parsed = 0
let failed = 0
for (const name of inputs) {
  let markdown = ""
  try {
    const result = await parse(await readFile(join(benchmarkDir, "pdfs", name)), { ocr: false })
    if (result.success) { parsed++; markdown = result.markdown ?? "" }
    else failed++
  } catch { failed++ }
  await writeFile(join(outputDir, name.slice(0, -4) + ".md"), markdown)
}
process.stdout.write(JSON.stringify({ parserDir, benchmarkDir, engineName, inputs: inputs.length, parsed, failed }) + "\n")
