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
 const r=ctcPrefixBeamDecode(data,T,3,['a']);assert.ok(r?.text.length);assert.ok(Number.isFinite(r?.confidence))
})
test('all blank produces no fabricated output',()=>{
 assert.equal(ctcPrefixBeamDecode(new Float32Array([1,0,0,1,0,0]),2,3,['a']),null)
})
