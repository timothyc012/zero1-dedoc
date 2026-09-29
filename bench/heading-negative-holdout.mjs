#!/usr/bin/env node
/** Public issuer PDF heading/role holdout, independent of the ODL200 scorer. */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const manifest=JSON.parse(await readFile(join(root,"bench/heading-negative-manifest.json"),"utf8"))
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const corpus=resolve(option("--corpus")??join(root,"bench/corpus/heading-holdout"))
const out=resolve(option("--out")??join(root,"bench/out/heading-negative-holdout.json"))
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
const norm=text=>String(text??"").normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim()
const documents=[]
for(const doc of manifest.documents){
  const path=join(corpus,doc.filename)
  let bytes
  try{bytes=await readFile(path)}catch(error){
    if(!args.includes("--fetch"))throw new Error(`Missing ${doc.id}: ${path}; provide --corpus or --fetch`,{cause:error})
    const response=await fetch(doc.source_url,{signal:AbortSignal.timeout(120000)})
    if(!response.ok)throw new Error(`Download ${doc.id}: HTTP ${response.status}`)
    bytes=Buffer.from(await response.arrayBuffer())
    if(sha(bytes)!==doc.sha256)throw new Error(`Downloaded ${doc.id} hash mismatch; not saved`)
    await mkdir(corpus,{recursive:true});await writeFile(path,bytes)
  }
  if(sha(bytes)!==doc.sha256)throw new Error(`Source hash mismatch ${doc.id}`)
  const result=await parse(bytes,{...manifest.options,...doc.options})
  if(!result.success)throw new Error(`Parse failed ${doc.id}: ${result.error}`)
  const headings=result.blocks.filter(block=>block.type==="heading")
  const checks=[]
  checks.push({kind:"page_count",expected:doc.page_count,actual:result.metadata?.pageCount??null,pass:result.metadata?.pageCount===doc.page_count})
  for(const expected of doc.headings??[]){
    const found=headings.find(block=>block.pageNumber===expected.page&&block.level===expected.level&&
      norm(block.text).includes(norm(expected.text)))
    checks.push({kind:"heading",expected,pass:!!found})
  }
  for(const text of doc.forbid_h1??[]){
    const offender=headings.find(block=>block.level===1&&norm(block.text).includes(norm(text)))
    checks.push({kind:"forbid_h1",text,pass:!offender,actual:offender?.text??null})
  }
  for(const text of doc.forbid_heading??[]){
    const offender=headings.find(block=>norm(block.text).includes(norm(text)))
    checks.push({kind:"forbid_heading",text,pass:!offender,actual:offender?.text??null})
  }
  for(const text of doc.required_text??[]){
    checks.push({kind:"required_text",text,pass:result.blocks.some(block=>block.text?.includes(text))})
  }
  documents.push({id:doc.id,sha256:doc.sha256,pageCount:result.metadata?.pageCount,
    headingLevels:headings.map(block=>({page:block.pageNumber,level:block.level,text:block.text})),
    checks,passed:checks.every(check=>check.pass)})
}
const report={schema_version:"zero1-heading-negative-result.v1",
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  corpus_role:manifest.corpus_role,documents,
  summary:{documents:documents.length,passed:documents.filter(doc=>doc.passed).length,
    checks:documents.reduce((n,doc)=>n+doc.checks.length,0),
    passedChecks:documents.reduce((n,doc)=>n+doc.checks.filter(check=>check.pass).length,0)}}
await mkdir(dirname(out),{recursive:true})
await writeFile(out,JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({output:out,summary:report.summary,
  failures:documents.flatMap(doc=>doc.checks.filter(check=>!check.pass).map(check=>({id:doc.id,...check})))}))
if(args.includes("--gate")&&report.summary.passed!==report.summary.documents)process.exitCode=1
