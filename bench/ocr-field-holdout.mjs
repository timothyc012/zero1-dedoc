#!/usr/bin/env node
/** Independent labeled-image OCR field-region CER/WER plus full-parser anchor checks. */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { decodeToRgba } from "../src/ocr/image-ocr.js"
import { getOcrEngine } from "../src/ocr/engine.js"
import { getOcrModelStatus } from "../src/ocr/models.js"
import { normalizeOcrText, scoreOcrFields } from "./lib/ocr-field-metrics.mjs"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const manifestPath=join(root,"bench/ocr-holdout-manifest.json")
const manifest=JSON.parse(await readFile(manifestPath,"utf8"))
const out=resolve(option("--out")??join(root,"bench/out/ocr-field-holdout.json"))
const detailsOut=resolve(option("--details-out")??join(root,"bench/out/ocr-field-details.json"))
const selected=option("--language")??"both"
if(!["de","en","both"].includes(selected))throw new Error("--language must be de, en, or both")
const limit=Number(option("--limit")??Infinity)
if(!(limit>0))throw new Error("--limit must be positive")
const dirs={
  de:resolve(option("--de-dir")??join(root,"bench/corpus/ocr-de-belege")),
  en:resolve(option("--en-dir")??join(root,"bench/corpus/ocr-en-funsd")),
}
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")

function labeledRegions(language,label){
  if(language==="de"){
    const fields=Object.entries(label.fields??{}).filter(([,value])=>value?.text?.trim()&&Array.isArray(value.box))
      .map(([key,value])=>({id:`field:${key}`,text:value.text,box:value.box}))
    const items=(label.line_items??[]).flatMap((line,index)=>Object.entries(line)
      .filter(([,value])=>value?.text?.trim()&&Array.isArray(value.box))
      .map(([key,value])=>({id:`item:${index+1}:${key}`,text:value.text,box:value.box})))
    return [...fields,...items]
  }
  return (label.form??[]).filter(entity=>entity.text?.trim()&&Array.isArray(entity.box))
    .map(entity=>({id:`entity:${entity.id}`,text:entity.text,box:entity.box}))
}

function criticalValues(language,doc,label){
  if(language==="de")return ["invoice_number","gross_total","vat_id","tax_note"]
    .map(key=>({id:key,text:label.fields?.[key]?.text})).filter(item=>item.text)
  return (doc.critical_entity_ids??[]).map(id=>({id:`entity:${id}`,text:label.form?.find(entity=>entity.id===id)?.text}))
    .filter(item=>item.text)
}

const languages={}
const detailDocs=[]
for(const language of selected==="both"?["de","en"]:[selected]){
  const profile=await getOcrModelStatus(language)
  if(!profile.every(model=>model.verified))throw new Error(`OCR ${language} models not SHA-verified; run check-ocr-models --language ${language} before this offline gate`)
  const engine=await getOcrEngine(language)
  const documents=[]
  for(const doc of manifest.languages[language].documents.slice(0,limit)){
    const image=await readFile(join(dirs[language],doc.image_path))
    const labelBytes=await readFile(join(dirs[language],doc.label_path))
    if(sha(image)!==doc.image_sha256||sha(labelBytes)!==doc.label_sha256)throw new Error(`Source hash mismatch: ${language}/${doc.id}`)
    const label=JSON.parse(labelBytes.toString("utf8"))
    const regions=labeledRegions(language,label)
    if(!regions.length)throw new Error(`No labeled text regions: ${language}/${doc.id}`)
    const decoded=await decodeToRgba(image)
    const stats={droppedLowConf:0}
    const started=performance.now()
    const recognized=await engine.recognizePage(decoded.data,decoded.width,decoded.height,stats)
    const scored=scoreOcrFields(regions,recognized)
    const parser=await parse(image,{ocr:true,ocrLanguage:language,images:false})
    const critical=criticalValues(language,doc,label).map(item=>({id:item.id,
      found:parser.success&&normalizeOcrText(parser.markdown).includes(normalizeOcrText(item.text))}))
    const result={id:doc.id,image_sha256:doc.image_sha256,label_sha256:doc.label_sha256,
      ...(language==="de"?{variant:doc.variant,layout:doc.layout,vatScheme:doc.vat_scheme}:{}),
      regions:regions.length,ocr:scored.summary,parser:{success:parser.success,
        warnings:parser.success?(parser.warnings??[]).map(warning=>warning.code):[],
        textChars:parser.success?parser.markdown.length:0},
      critical:{expected:critical.length,found:critical.filter(item=>item.found).length,checks:critical},
      engine:{droppedLowConf:stats.droppedLowConf,truncatedBoxes:stats.truncatedBoxes??0},
      elapsedMs:Math.round(performance.now()-started)}
    documents.push(result)
    detailDocs.push({language,id:doc.id,fields:scored.fields})
    console.error(`${language}/${doc.id}: ${regions.length} regions, CER=${scored.summary.cer?.toFixed(3)}, WER=${scored.summary.wer?.toFixed(3)}, anchors=${result.critical.found}/${result.critical.expected}`)
  }
  const sum=key=>documents.reduce((n,doc)=>n+doc.ocr[key],0)
  const refChars=sum("referenceChars"),refWords=sum("referenceWords")
  const byVariant=language==="de"?Object.fromEntries(["scan","photo","clean"].map(variant=>{
    const selectedDocs=documents.filter(doc=>doc.variant===variant)
    const total=(key)=>selectedDocs.reduce((n,doc)=>n+doc.ocr[key],0)
    return [variant,{documents:selectedDocs.length,
      cer:total("referenceChars")?total("characterErrors")/total("referenceChars"):null,
      wer:total("referenceWords")?total("wordErrors")/total("referenceWords"):null,
      criticalFound:selectedDocs.reduce((n,doc)=>n+doc.critical.found,0),
      criticalExpected:selectedDocs.reduce((n,doc)=>n+doc.critical.expected,0)}]
  })):undefined
  languages[language]={source:manifest.languages[language].source,kind:manifest.languages[language].kind,
    model_sha256:profile.map(model=>({filename:model.spec.filename,sha256:model.spec.sha256})),documents,
    summary:{documents:documents.length,pages:documents.length,regions:sum("regions"),matchedRegions:sum("matchedRegions"),
      referenceChars:refChars,characterErrors:sum("characterErrors"),cer:refChars?sum("characterErrors")/refChars:null,
      referenceWords:refWords,wordErrors:sum("wordErrors"),wer:refWords?sum("wordErrors")/refWords:null,
      parserSuccess:documents.filter(doc=>doc.parser.success).length,
      criticalExpected:documents.reduce((n,doc)=>n+doc.critical.expected,0),
      criticalFound:documents.reduce((n,doc)=>n+doc.critical.found,0),
      ...(byVariant?{byVariant}:{})}}
}
const report={schema_version:"zero1-ocr-field-holdout-result.v1",
  manifest_sha256:sha(await readFile(manifestPath)),
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  metric:"direct OCR detector/recognizer field-region CER/WER; full parser critical-anchor coverage separately",
  matching:"each recognized line assigned by overlap/OCR-line area >= 0.1, with small field-coverage tie break; label text is not read for matching",
  languages}
await mkdir(dirname(out),{recursive:true});await mkdir(dirname(detailsOut),{recursive:true})
await writeFile(out,JSON.stringify(report,null,2)+"\n")
await writeFile(detailsOut,JSON.stringify({documents:detailDocs},null,2)+"\n")
console.log(JSON.stringify({output:out,detailsOut,summary:Object.fromEntries(Object.entries(languages).map(([key,value])=>[key,value.summary]))}))
