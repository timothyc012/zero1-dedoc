import{test}from'node:test'
import assert from'node:assert/strict'
import{ctcPrefixBeamDecode}from'../src/ocr/prefix-beam.js'
test('sums blank-separated alignments instead of selecting only the best path',()=>{
 const r=ctcPrefixBeamDecode(new Float32Array([.6,.4,0,.6,.4,0]),2,3,['a'])
 assert.equal(r?.text,'a');assert.equal(r?.steps.length,1)
})
test('preserves repeated characters, numbers and Unicode tokens',()=>{
 const dict=['ä','7','🙂'],C=5,ids=[1,0,1,2,0,2,4,3];const data=new Float32Array(ids.length*C)
 ids.forEach((id,t)=>data[t*C+id]=1)
 const r=ctcPrefixBeamDecode(data,ids.length,C,dict)
 assert.equal(r?.text,'ää77 🙂');assert.deepEqual(r?.steps,[0,2,3,5,6,7]);assert.equal(r?.confidence,1)
})
test('normalizes each step to avoid underflow on long uncertain lines',()=>{
 const T=1600,data=new Float32Array(T*3);for(let t=0;t<T;t++){data[t*3]=.6;data[t*3+1]=.4}
 const r=ctcPrefixBeamDecode(data,T,3,['a']);assert.ok(r?.text.length);assert.ok(Number.isFinite(r?.confidence));assert.equal(r?.steps.length,[...r!.text].length);assert.ok(r!.confidence>0)
})
test('all blank produces no fabricated output',()=>{
 assert.equal(ctcPrefixBeamDecode(new Float32Array([1,0,0,1,0,0]),2,3,['a']),null)
})
test('matches independently enumerated two-step CTC sequence probabilities',()=>{
 let seed=701
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+1)/4294967297}
 for(let trial=0;trial<60;trial++){
  const data=new Float32Array(8)
  for(let t=0;t<2;t++){const row=Array.from({length:4},()=>random()+.01),sum=row.reduce((a,b)=>a+b);row.forEach((p,c)=>data[t*4+c]=p/sum)}
  const mass=new Map<string,number>(),symbols=['','a','b',' ']
  for(let a=0;a<4;a++)for(let b=0;b<4;b++){
   const text=symbols[a]+(b!==a?symbols[b]:'')
   mass.set(text,(mass.get(text)??0)+data[a]*data[4+b])
  }
  const expected=[...mass].sort((a,b)=>b[1]-a[1])[0][0]
  assert.equal(ctcPrefixBeamDecode(data,2,4,['a','b'])?.text??'',expected)
 }
})
