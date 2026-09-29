#!/usr/bin/env node
/** Poppler check of workbook-derived BMF display values on PDF pages 1–3. */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const pdf=resolve(process.argv[2]??join(root,"bench/corpus/office-pdf/bmf-tax-tables.pdf"))
const gold=JSON.parse(await readFile(join(root,"bench/bmf-front-gold.json"),"utf8"))
const sha=createHash("sha256").update(await readFile(pdf)).digest("hex")
if(sha!==gold.pdf_sha256)throw new Error("BMF PDF source hash mismatch")
const texts=execFileSync("pdftotext",["-f","1","-l","3","-layout",pdf,"-"],{encoding:"utf8",maxBuffer:10*1024*1024}).split("\f")
const count=values=>{
  const map=new Map()
  for(const value of values)map.set(value,(map.get(value)??0)+1)
  return map
}
const report=[]
for(const [index,page] of gold.pages.entries()){
  const values=page.tables.flatMap(table=>table.rows.flatMap(row=>row.values.map(cell=>cell.display).filter(value=>value!==null)))
  const tokens=texts[index].match(/(?<!\w)[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?|(?<!\w)[x-](?!\w)/g)??[]
  const available=count(tokens),missing=[]
  for(const value of values){if((available.get(value)??0)>0)available.set(value,available.get(value)-1);else missing.push(value)}
  report.push({page:page.page,sourceValues:values.length,found:values.length-missing.length,missing:missing.slice(0,12)})
}
console.log(JSON.stringify({pdf_sha256:sha,report},null,2))
if(report.some(page=>page.sourceValues!==page.found))process.exitCode=1
