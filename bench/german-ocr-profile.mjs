// Stage timings for the real PDF path; no OCR text or gold enters inference.
import {readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {parse} from '../src/index.js'
import {getOcrEngine} from '../src/ocr/engine.js'
const args=process.argv.slice(2),value=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined
const engine=await getOcrEngine('de'),records=[]
if(value('--threads')){
 const ort=await import('onnxruntime-node');const opts={graphOptimizationLevel:'all',executionProviders:['cpu'],logSeverityLevel:3,intraOpNumThreads:Number(value('--threads')),interOpNumThreads:1}
 const {getOcrModelProfile}=await import('../src/ocr/models.js');const p=getOcrModelProfile('de');const {join}=await import('node:path')
 for(const role of ['det','rec']){await engine[role].release();engine[role]=await ort.InferenceSession.create(join(p.directory,p[role].filename),opts)}
}
let stages={},recWidths=[]
for(const role of ['det','rec']){
 const session=engine[role],run=session.run.bind(session)
 session.run=async(...params)=>{const t=performance.now();const result=await run(...params);stages[role+'RunMs']=(stages[role+'RunMs']??0)+performance.now()-t;if(role==='rec')recWidths.push(params[0][session.inputNames[0]].dims);return result}
}
for(const method of ['detectRegion','recognizeJobs']){
 const original=engine[method].bind(engine)
 engine[method]=async(...params)=>{if(method==='detectRegion'&&value('--det-size'))params[3]={...params[3],detLongSide:Number(value('--det-size'))};if(method==='recognizeJobs'&&value('--batch'))params[3]=Number(value('--batch'));const t=performance.now();const result=await original(...params);stages[method+'Ms']=(stages[method+'Ms']??0)+performance.now()-t;return result}
}
const recognize=engine.recognizePage.bind(engine)
engine.recognizePage=async(...params)=>{const t=performance.now();const result=await recognize(...params);stages.recognizePageMs=performance.now()-t;stages.items=result.length;return result}
for(const file of args.filter(a=>a.endsWith('.pdf'))){
 stages={};recWidths=[];const bytes=await readFile(file),t=performance.now();const result=await parse(bytes,{ocr:true,ocrLanguage:'de',images:false})
 const record={file,sha256:createHash('sha256').update(bytes).digest('hex'),milliseconds:performance.now()-t,stages,recWidths,success:result.success,warnings:result.warnings?.map(w=>w.code),textHash:createHash('sha256').update(result.markdown??'').digest('hex')};records.push(record);console.log(JSON.stringify(record));if(result.warnings?.some(w=>w.code==='OCR_FAILED')||!result.success){console.error('INVALID profile: OCR failure; terminating pending inference before another PDF');process.exit(1)}
}
if(value('--out'))await writeFile(value('--out'),JSON.stringify({node:process.version,arch:process.arch,settings:{threads:value('--threads')??4,batch:value('--batch')??1,detSize:value('--det-size')??1760},records},null,2))
await engine.destroy()
