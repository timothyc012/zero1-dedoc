import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {scoreOcrFields,normalizeOcrText} from './lib/ocr-field-metrics.mjs'
const args=process.argv.slice(2)
const manifestIndex=args.indexOf('--manifest')
const manifestPath=manifestIndex>=0?args.splice(manifestIndex,2)[1]:'bench/german-pdf-competition-manifest.json'
const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
const runs=[]
for(const path of args){
 const run=JSON.parse(await readFile(path,'utf8')),documents=[]
 for(const row of run.documents){
  const doc=manifest.documents.find(d=>d.id===row.id)
  if(!doc||row.pdf_sha256!==doc.pdf_sha256)throw new Error('result/input mismatch')
  const labelBytes=await readFile('bench/corpus/'+doc.label_local)
  if(createHash('sha256').update(labelBytes).digest('hex')!==doc.label_sha256)throw new Error('label hash mismatch')
  const label=JSON.parse(labelBytes.toString('utf8'))
  const fields=(doc.dataset==='xfund'?(label.document??[]):[...Object.entries(label.fields??{}).map(([key,v])=>({id:key,...v})),...(label.line_items??[]).flatMap((line,i)=>Object.entries(line).map(([key,v])=>({id:`${i}:${key}`,...v})))]).filter(v=>v.text?.trim()&&v.box)
  const scored=scoreOcrFields(fields,row.items)
  const anchors=(doc.dataset==='xfund'?(doc.critical_entity_ids??[]).map(id=>label.document.find(entity=>entity.id===id)?.text):['invoice_number','gross_total','vat_id','tax_note'].map(key=>label.fields?.[key]?.text)).filter(Boolean)
  const text=normalizeOcrText(row.text)
  documents.push({id:row.id,...scored.summary,anchorsExpected:anchors.length,anchorsFound:anchors.filter(v=>text.includes(normalizeOcrText(v))).length,elapsed:row.elapsed_seconds})
 }
 const sum=k=>documents.reduce((n,d)=>n+d[k],0),totalChars=sum('referenceChars'),totalWords=sum('referenceWords')
 const summary={documents:documents.length,cer:sum('characterErrors')/totalChars,wer:sum('wordErrors')/totalWords,matched:sum('matchedRegions'),regions:sum('regions'),anchors:sum('anchorsFound'),expectedAnchors:sum('anchorsExpected'),seconds:sum('elapsed')}
 const score={parser:run.parser,version:run.version,capacity:run.capacity,models:run.models,split:run.split,summary,documents}
 await writeFile(path.replace(/\.json$/,'.score.json'),JSON.stringify(score,null,2)+'\n')
 runs.push({parser:run.parser,path,...summary})
}
console.log(JSON.stringify(runs,null,2))
