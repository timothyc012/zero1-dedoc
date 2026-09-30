#!/usr/bin/env node
/** Fetch only the preselected public OCR images/labels; verify before saving. */
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import JSZip from "jszip"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const manifest=JSON.parse(await readFile(join(root,"bench/ocr-holdout-manifest.json"),"utf8"))
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const dirs={de:resolve(option("--de-dir")??join(root,"bench/corpus/ocr-de-belege")),
  en:resolve(option("--en-dir")??join(root,"bench/corpus/ocr-en-funsd"))}
const selection=option("--language")??"both"
if(!["de","en","both"].includes(selection))throw new Error("--language must be de, en, or both")
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
async function download(url,expected){
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)})
  if(!response.ok)throw new Error(`Download failed: HTTP ${response.status} ${url}`)
  const bytes=Buffer.from(await response.arrayBuffer())
  if(sha(bytes)!==expected)throw new Error(`Source SHA-256 mismatch; bytes not saved: ${url}`)
  return bytes
}
async function checked(path,expected){
  try{const bytes=await readFile(path);if(sha(bytes)!==expected)throw new Error(`Cached SHA-256 mismatch: ${path}`);return bytes}
  catch(error){if(error?.code==="ENOENT")return null;throw error}
}
async function save(path,bytes){await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes)}
const counts={de:0,en:0}
if(selection!=="en"){
  const source=manifest.languages.de
  for(const doc of source.documents) for(const [part,expected] of [[doc.image_path,doc.image_sha256],[doc.label_path,doc.label_sha256]]){
    const path=join(dirs.de,part)
    if(!await checked(path,expected)){
      const bytes=await download(`${source.source_url}/resolve/${source.revision}/${part}`,expected)
      await save(path,bytes)
    }
  }
  counts.de=source.documents.length
}
if(selection!=="de"){
  const source=manifest.languages.en
  const needed=[]
  for(const doc of source.documents) for(const [part,expected] of [[doc.image_path,doc.image_sha256],[doc.label_path,doc.label_sha256]]){
    if(!await checked(join(dirs.en,part),expected))needed.push({part,expected})
  }
  if(needed.length){
    const archive=await download(source.source_url,source.archive_sha256)
    const zip=await JSZip.loadAsync(archive)
    for(const {part,expected} of needed){
      const file=zip.file(part)
      if(!file)throw new Error(`FUNSD archive missing ${part}`)
      const bytes=await file.async("nodebuffer")
      if(sha(bytes)!==expected)throw new Error(`FUNSD entry SHA-256 mismatch: ${part}`)
      await save(join(dirs.en,part),bytes)
    }
  }
  counts.en=source.documents.length
}
console.log(JSON.stringify({verified:counts,sourceRevisions:{de:manifest.languages.de.revision,en:manifest.languages.en.archive_sha256}}))
