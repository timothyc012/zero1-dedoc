#!/usr/bin/env node
/** Public PPTX slide, source paragraph, visual label, table, and warning gate. */
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "../dist/index.js"
import { pptxParagraphs, scoreUnits } from "./lib/office-pdf-gold.mjs"

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..")
const manifest=JSON.parse(await readFile(join(root,"bench/pptx-holdout-manifest.json"),"utf8"))
const args=process.argv.slice(2)
const option=name=>args.includes(name)?args[args.indexOf(name)+1]:undefined
const corpus=resolve(option("--corpus")??join(root,"bench/corpus/pptx-holdout"))
const out=resolve(option("--out")??join(root,"bench/out/pptx-holdout.json"))
const sha=bytes=>createHash("sha256").update(bytes).digest("hex")
const documents=[]
for(const doc of manifest.documents){
  const path=join(corpus,doc.filename)
  let bytes
  try{bytes=await readFile(path)}catch(error){
    if(!args.includes("--fetch"))throw new Error(`Missing ${doc.id}: ${path}; provide --corpus or --fetch`,{cause:error})
    const response=await fetch(doc.source_url,{signal:AbortSignal.timeout(120000)})
    if(!response.ok)throw new Error(`Download ${doc.id}: HTTP ${response.status}`)
    bytes=Buffer.from(await response.arrayBuffer())
    if(sha(bytes)!==doc.sha256)throw new Error(`Downloaded ${doc.id} SHA mismatch; not saved`)
    await mkdir(corpus,{recursive:true});await writeFile(path,bytes)
  }
  if(sha(bytes)!==doc.sha256)throw new Error(`Source SHA mismatch ${doc.id}`)
  const sourceSlides=await pptxParagraphs(bytes)
  const result=await parse(bytes,manifest.options)
  if(!result.success)throw new Error(`Parse failed ${doc.id}: ${result.error}`)
  const sourceText=sourceSlides.flatMap(slide=>slide.paragraphs)
  const text=scoreUnits(sourceText,result.markdown)
  const tables=result.blocks.filter(block=>block.type==="table"&&block.table)
  const shapes=tables.map(block=>[block.table.rows,block.table.cols])
  const spans=tables.map(block=>[block.table.cells[0]?.[0]?.rowSpan??1,block.table.cells[0]?.[0]?.colSpan??1])
  const warnings=(result.warnings??[]).map(warning=>warning.code)
  const visual=(doc.visual_labels_each_slide??[]).map((label,index)=>{
    const slide=index+1
    return {slide,label,positions:sourceSlides.map((_,slideIndex)=>{
      const items=result.blocks.filter(block=>block.pageNumber===slideIndex+1).map(block=>block.text??"")
      return {slide:slideIndex+1,index:items.indexOf(label),count:items.filter(item=>item===label).length}
    })}
  })
  const labelsPass=sourceSlides.every((_,slideIndex)=>{
    const positions=visual.map(item=>item.positions[slideIndex])
    return positions.every(item=>item.count===1&&item.index>=0)&&positions.every((item,index)=>index===0||item.index>positions[index-1].index)
  })
  const checks={slides:result.metadata?.pageCount===doc.slides&&sourceSlides.length===doc.slides,
    sourceParagraphs:sourceText.length===doc.source_paragraphs,
    textPresence:text.presentUnits===text.totalUnits,
    textOrder:text.orderedUnits===text.totalUnits,
    visualLabels:labelsPass,
    tableShapes:!doc.table_shapes||JSON.stringify(shapes)===JSON.stringify(doc.table_shapes),
    mergeSpans:!doc.first_cell_spans||JSON.stringify(spans)===JSON.stringify(doc.first_cell_spans),
    warnings:!doc.warnings||JSON.stringify(warnings)===JSON.stringify(doc.warnings),
    anchors:(doc.anchors??[]).every(anchor=>result.markdown.toLowerCase().includes(anchor.toLowerCase())),
    chartLimitation:!doc.unsupported_chart_data_expected||warnings.includes("UNSUPPORTED_ELEMENT"),
    speakerNotes:(doc.required_notes??[]).every(note=>result.blocks.some(block=>block.text===note)),
    imageLimitation:doc.image_warning_count===undefined||
      (warnings.filter(code=>code==="UNSUPPORTED_ELEMENT").length===doc.image_warning_count&&result.blocks.length===0)}
  documents.push({id:doc.id,sha256:doc.sha256,slides:sourceSlides.length,sourceParagraphs:sourceText.length,
    text,tableShapes:shapes,firstCellSpans:spans,warnings,visualLabels:visual,checks,passed:Object.values(checks).every(Boolean)})
}
const report={schema_version:"zero1-pptx-holdout-result.v1",
  parser_revision:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),
  documents,summary:{documents:documents.length,passed:documents.filter(doc=>doc.passed).length,
    slides:documents.reduce((n,doc)=>n+doc.slides,0),sourceParagraphs:documents.reduce((n,doc)=>n+doc.sourceParagraphs,0),
    presentParagraphs:documents.reduce((n,doc)=>n+doc.text.presentUnits,0),
    orderedParagraphs:documents.reduce((n,doc)=>n+doc.text.orderedUnits,0)}}
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+"\n")
console.log(JSON.stringify({output:out,summary:report.summary,failures:documents.filter(doc=>!doc.passed).map(doc=>({id:doc.id,checks:doc.checks}))}))
if(args.includes("--gate")&&report.summary.passed!==report.summary.documents)process.exitCode=1
