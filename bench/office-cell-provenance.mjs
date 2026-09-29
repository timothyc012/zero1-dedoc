#!/usr/bin/env node
/** Hash-pinned source address/type/raw-value gate for six XLS/XLSX documents. */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { xlsxSourceCells } from "./lib/office-pdf-gold.mjs"
import { scoreOfficeCells } from "./lib/office-cell-score.mjs"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const manifest=JSON.parse(await readFile(join(root,"bench/office-pdf-manifest.json"),"utf8"))
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const corpus=resolve(option("--corpus")??join(root,"bench/corpus/office-pdf"))
const out=resolve(option("--out")??join(root,"bench/out/office-cell-provenance.json"))
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
const officeDocs=manifest.documents.filter(doc=>doc.format==="xlsx"||doc.format==="xls")
const docs=[]
for(const doc of officeDocs){
  const path=doc.bundled?join(root,doc.bundled):join(corpus,doc.filename)
  const bytes=await readFile(path)
  if(sha(bytes)!==doc.sha256)throw new Error(`Input SHA-256 mismatch: ${doc.id}`)
  const sourceBytes=doc.format==="xls"?await readFile(join(corpus,"test.xlsx")):bytes
  const paired=manifest.documents.find(item=>item.id==="test.xlsx")
  if(doc.format==="xls"&&sha(sourceBytes)!==paired.sha256)throw new Error("Paired XLSX source hash mismatch")
  const source=await xlsxSourceCells(sourceBytes)
  const parsed=await parse(bytes,{...manifest.options,includeCellProvenance:true})
  if(!parsed.success)throw new Error(`Parse failed ${doc.id}: ${parsed.error}`)
  const quality=scoreOfficeCells(source,parsed.blocks)
  const outputCells=parsed.blocks.filter(block=>block.type==="table"&&block.table).flatMap(block=>block.table.cells.flat())
  const codeChecks=Object.fromEntries(Object.entries(doc.expected?.string_codes??{}).map(([code,expected])=>[
    code,{expected,found:outputCells.filter(cell=>cell.sourceCell?.storedType==="string"&&cell.sourceCell.rawValue===code&&cell.text===code).length},
  ]))
  const probes=doc.id==="bmf-tax-tables.xlsx"?["F7","G7","H7","I7","J7","K7"].map(address=>{
    const original=source.find(sheet=>sheet.name==="1 Steuerarten")?.cells.find(cell=>cell.address===address)
    const output=parsed.blocks.filter(block=>block.type==="table"&&block.pageNumber===1)
      .flatMap(block=>block.table.cells.flat()).find(cell=>cell.sourceCell?.address===address)
    return {address,sourceRaw:original?.value??null,parserRaw:output?.sourceCell?.rawValue??null,
      visible:output?.text??null,rawExact:original?.value===output?.sourceCell?.rawValue}
  }):[]
  const passed=quality.passed&&Object.values(codeChecks).every(check=>check.found===check.expected)&&
    probes.every(probe=>probe.rawExact)&&
    (doc.id!=="hgb-posting-lines.xlsx"||quality.dateFormatted===24)
  docs.push({id:doc.id,format:doc.format,sha256:doc.sha256,
    sourceGold:doc.format==="xls"?"paired-test.xlsx":"native-OOXML",
    quality,codeChecks,probes,warnings:parsed.warnings?.map(warning=>warning.code)??[],passed})
}
const result={schema_version:"zero1-office-cell-provenance.v1",
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  options:{...manifest.options,includeCellProvenance:true},documents:docs,
  summary:{documents:docs.length,passed:docs.filter(doc=>doc.passed).length,
    sourceCells:docs.reduce((n,doc)=>n+doc.quality.sourceCells,0),
    addressMatched:docs.reduce((n,doc)=>n+doc.quality.addressMatched,0),
    typeMatched:docs.reduce((n,doc)=>n+doc.quality.typeMatched,0),
    rawMatched:docs.reduce((n,doc)=>n+doc.quality.rawMatched,0),
    eligibleMerges:docs.reduce((n,doc)=>n+doc.quality.eligibleMergeRanges,0),
    mergeMatched:docs.reduce((n,doc)=>n+doc.quality.mergeRangesMatched,0),
    passed:docs.every(doc=>doc.passed)}}
await mkdir(dirname(out),{recursive:true})
await writeFile(out,JSON.stringify(result,null,2)+"\n")
console.log(JSON.stringify({output:out,summary:result.summary}))
if(args.includes("--gate")&&!result.summary.passed)process.exitCode=1
