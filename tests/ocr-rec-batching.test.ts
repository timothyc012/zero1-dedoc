import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {OcrEngine} from '../src/ocr/engine.js'
import {ocrSameWidthRecBatch} from '../src/ocr/execution.js'

async function readFixture(widths:number[], batch:number, generation:number|undefined=6, provider='dml', fallBackAfterFirst=false){
 const width=Math.max(...widths)+2,height=widths.length*50,rgba=new Uint8Array(width*height*4)
 for(let i=0;i<widths.length;i++)for(let y=i*50;y<i*50+48;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*4;rgba[offset]=rgba[offset+1]=rgba[offset+2]=30+i*10;rgba[offset+3]=255
 }
 const dict=widths.map((_,i)=>String.fromCodePoint(65+i)),C=dict.length+2
 const samples=new Map<number,{width:number;sha:string}>(),shapes:number[][]=[]
 class Tensor{constructor(public type:string,public data:Float32Array,public dims:number[]) {}}
 const engine=Object.assign(Object.create(OcrEngine.prototype),{generation,sameWidthRecBatch:batch,dict,ort:{Tensor},rec:{provider,inputNames:['in'],outputNames:['out'],run:async(feeds:{in:Tensor})=>{
  const {data,dims}=feeds.in,[n,,h,w]=dims;shapes.push(dims)
  const logits=new Float32Array(n*2*C)
  for(let i=0;i<n;i++){
   const sample=data.subarray(i*3*h*w,(i+1)*3*h*w)
   const index=Math.round(((sample[0]+1)*127.5-30)/10)
   samples.set(index,{width:w,sha:createHash('sha256').update(new Uint8Array(sample.buffer,sample.byteOffset,sample.byteLength)).digest('hex')})
   logits[i*2*C+index+1]=1;logits[i*2*C+C]=1
  }
  if(fallBackAfterFirst)engine.rec.provider='cpu'
  return{out:{data:logits,dims:[n,2,C]}}
 }}})
 const jobs=widths.map((w,i)=>({box:{x:0,y:i*50,w,h:48},rot:0,group:i}))
 const results=await engine.recognizeJobs(rgba,width,jobs,1)
 return{samples,shapes,texts:results.map((r:{text:string}|null)=>r?.text)}
}

test('same-width batching preserves every sample tensor and restores original job order',async()=>{
 const widths=[900,80,340,40,80,321,40,850]
 const baseline=await readFixture(widths,1),batched=await readFixture(widths,32)
 assert.deepEqual(batched.samples,baseline.samples)
 assert.deepEqual(batched.texts,baseline.texts)
 assert.deepEqual(batched.texts,widths.map((_,i)=>String.fromCodePoint(65+i)))
 assert.deepEqual(batched.shapes.map(([n,,,w])=>[n,w]),[[4,320],[1,321],[1,340],[1,850],[1,900]])
})

test('batching respects the existing tensor pixel cap and leaves v5 single-line inference intact',async()=>{
 const widths=Array(12).fill(2048)
 const batched=await readFixture(widths,32)
 assert.deepEqual(batched.shapes.map(([n])=>n),[7,5])
 assert.ok(batched.shapes.every(([n,,h,w])=>n*h*w<=48*16000))
 const v5=await readFixture([80,80,80],32,5)
 assert.deepEqual(v5.shapes.map(([n])=>n),[1,1,1])
})


test('batch requests are validated and ignored for v5',()=>{
 assert.equal(ocrSameWidthRecBatch(6),1)
 assert.equal(ocrSameWidthRecBatch(6,'32'),32)
 assert.equal(ocrSameWidthRecBatch(undefined,'32'),1)
 for(const batch of ['', '0','01','-1','1.5','33','Infinity'])assert.throws(()=>ocrSameWidthRecBatch(6,batch),/ZERO1_OCR_REC_BATCH/)
})

test('CPU and CUDA retain single-line recognition and GPU fallback disables subsequent batches',async()=>{
 for(const provider of ['cpu','cuda']){
  const r=await readFixture([80,80,80],32,6,provider)
  assert.deepEqual(r.shapes.map(([n])=>n),[1,1,1])
 }
 const fallback=await readFixture([80,80,80,80,80,80],2,6,'dml',true)
 assert.deepEqual(fallback.shapes.map(([n])=>n),[2,1,1,1,1])
})
