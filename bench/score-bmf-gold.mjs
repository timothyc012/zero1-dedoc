#!/usr/bin/env node
/** Score the full BMF print layout against workbook-derived page/cell gold. */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { scoreBmfPage } from "./lib/bmf-score.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)),"..")
const gold = JSON.parse(await readFile(join(root,"bench/office-pdf-gold.json"),"utf8"))
const pdf = resolve(process.argv[2] ?? join(root,"bench/corpus/office-pdf/bmf-tax-tables.pdf"))
const out = resolve(process.argv[3] ?? join(root,"bench/out/bmf-gold-score.json"))
const bytes = await readFile(pdf)
if(createHash("sha256").update(bytes).digest("hex")!==gold.pdf_sha256) throw new Error("BMF PDF hash mismatch")
const parsed = await parse(bytes,{ocr:false,images:false})
if(!parsed.success) throw new Error(`Zero1 BMF parse failed: ${parsed.error}`)

const pages = gold.pages.map(page=>scoreBmfPage(page,parsed.blocks.filter(block=>block.pageNumber===page.page)))
const report = {schema_version:"zero1-bmf-page-score.v1",pdf_sha256:gold.pdf_sha256,xlsx_sha256:gold.xlsx_sha256,
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  parser_package_version:"4.16.1-zero1.1",pages,
  summary:{passedPages:pages.filter(page=>page.fullCellGoldPass).length,totalPages:pages.length,
    displayValues:pages.reduce((n,page)=>n+page.expectedDisplayValues,0),
    exactDisplayValues:pages.reduce((n,page)=>n+page.exactDisplayValues,0)}}
await mkdir(dirname(out),{recursive:true})
await writeFile(out,JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify(report.summary))
