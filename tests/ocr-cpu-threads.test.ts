import {test} from 'node:test'
import assert from 'node:assert/strict'
import {ocrCpuThreads} from '../src/ocr/cpu-threads.js'
test('German default respects a smaller CPU allocation',()=>{
 assert.equal(ocrCpuThreads(6,12),4)
 assert.equal(ocrCpuThreads(6,2),2)
 assert.equal(ocrCpuThreads(undefined,12),undefined)
})
test('explicit CPU budget is supported for every OCR language and capped by allocation',()=>{
 assert.equal(ocrCpuThreads(6,12,'8'),8)
 assert.equal(ocrCpuThreads(undefined,2,'8'),2)
 assert.equal(ocrCpuThreads(6,12,'1'),1)
 assert.equal(ocrCpuThreads(6,12,'64'),12)
})
test('malformed CPU budgets fail with a useful message',()=>{
 for(const value of ['0','-1','1.5','foo','65','Infinity','1e1',''])assert.throws(()=>ocrCpuThreads(6,12,value),/ZERO1_OCR_THREADS.*1.*64/)
})
