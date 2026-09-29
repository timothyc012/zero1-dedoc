#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { scoreBmfFrontPage } from "./lib/bmf-score.mjs"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const gold=JSON.parse(await readFile(join(root,"bench/bmf-front-gold.json"),"utf8"))
const pdf=resolve(process.argv[2]??join(root,"bench/corpus/office-pdf/bmf-tax-tables.pdf"))
const out=resolve(process.argv[3]??join(root,"bench/out/bmf-front-gold-score.json"))
const bytes=await readFile(pdf)
if(createHash("sha256").update(bytes).digest("hex")!==gold.pdf_sha256)throw new Error("BMF PDF hash mismatch")
const result=await parse(bytes,{ocr:false,images:false})
if(!result.success)throw new Error(`Zero1 parse failed: ${result.error}`)
const pages=gold.pages.map(page=>scoreBmfFrontPage(page,result.blocks.filter(block=>block.pageNumber===page.page)))
const report={schema_version:"zero1-bmf-front-score.v1",pdf_sha256:gold.pdf_sha256,xlsx_sha256:gold.xlsx_sha256,
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),pages,
  summary:{passedPages:pages.filter(page=>page.fullCellGoldPass).length,totalPages:pages.length,
    displayedValues:pages.reduce((n,page)=>n+page.expectedDisplayValues,0),
    presentValues:pages.reduce((n,page)=>n+page.presentDisplayValues,0),
    alignedValues:pages.reduce((n,page)=>n+page.alignedDisplayValues,0)}}
await mkdir(dirname(out),{recursive:true})
await writeFile(out,JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify(report.summary))
