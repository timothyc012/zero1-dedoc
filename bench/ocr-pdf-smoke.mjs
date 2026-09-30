#!/usr/bin/env node
/** Offline image-only/mixed PDF language-route smoke using deterministic PDFs. */
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { getOcrModelStatus } from "../src/ocr/models.js"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const manifest=JSON.parse(await readFile(join(root,"bench/ocr-pdf-smoke-manifest.json"),"utf8"))
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const corpus=resolve(option("--corpus")??join(root,"bench/corpus/ocr-pdf-smoke"))
const out=resolve(option("--out")??join(root,"bench/out/ocr-pdf-smoke.json"))
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
for(const lang of ["de","en"])assert.ok((await getOcrModelStatus(lang)).every(item=>item.verified),`${lang} models must be prepared and verified offline`)
const documents=[]
for(const doc of manifest.documents){
  const bytes=await readFile(join(corpus,doc.file))
  assert.equal(sha(bytes),doc.sha256,`PDF hash mismatch: ${doc.id}`)
  const result=await parse(bytes,{ocr:true,ocrLanguage:doc.language,images:false})
  assert.equal(result.success,true,`PDF parse failed: ${doc.id}`)
  const codes=(result.warnings??[]).map(warning=>warning.code)
  const expectedPage=result.pages?.find(page=>page.pageNumber===doc.ocr_page)
  const checks={pages:result.metadata?.pageCount===doc.pages,
    ocrApplied:codes.filter(code=>code==="OCR_APPLIED").length===1,
    noOcrFailure:!codes.includes("OCR_FAILED")&&!!expectedPage?.markdown,
    nativeTextPreserved:doc.pages===1||!!result.pages?.find(page=>page.pageNumber===1)?.markdown.includes("MIXED PDF TEXT LAYER"),
    anchors:doc.anchors.every(anchor=>expectedPage?.markdown.includes(anchor))}
  documents.push({id:doc.id,sha256:doc.sha256,warnings:codes,checks,passed:Object.values(checks).every(Boolean)})
}
const summary={documents:documents.length,passed:documents.filter(doc=>doc.passed).length}
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify({schema_version:"zero1-ocr-pdf-smoke-result.v1",
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),documents,summary},null,2)+"\n")
console.log(JSON.stringify({output:out,summary,failures:documents.filter(doc=>!doc.passed)}))
if(args.includes("--gate")&&summary.passed!==summary.documents)process.exitCode=1
