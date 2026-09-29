import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { scoreOfficeCells } from "../bench/lib/office-cell-score.mjs"

const sheet={number:1,name:"Ledger",merges:["A2:B2"],cells:[
  {address:"A1",type:"string",value:"0420"},
  {address:"B1",type:"number",value:"1.2300000000000002"},
  {address:"A2",type:"string",value:"Merged"},
  {address:"C2",type:"formula",value:"",hasCachedValue:false},
]}
const block={type:"table",pageNumber:1,table:{cells:[
  [{text:"0420",sourceCell:{address:"A1",storedType:"string",rawValue:"0420"}},
   {text:"1.23",sourceCell:{address:"B1",storedType:"number",rawValue:"1.2300000000000002"}}],
  [{text:"Merged",sourceCell:{address:"A2",storedType:"string",rawValue:"Merged",mergeRange:"A2:B2"}},
   {text:"=SUM(A1:B1)",sourceCell:{address:"C2",storedType:"formula",rawValue:null,cachedValue:null}}],
]}}

describe("Office source-cell evaluator",()=>{
  it("distinguishes original storage from formatted output and uncached formula",()=>{
    const score=scoreOfficeCells([sheet],[block])
    assert.equal(score.passed,true)
    assert.equal(score.sourceCells,4)
    assert.equal(score.rawMatched,4)
    assert.equal(score.displayDiffersFromRaw,2)
    assert.equal(score.mergeRangesMatched,1)
  })

  it("fails moved or retyped cells despite all visible strings being present",()=>{
    const changed=structuredClone(block)
    changed.table.cells[0][0].sourceCell.address="D1"
    changed.table.cells[0][1].sourceCell.storedType="string"
    const score=scoreOfficeCells([sheet],[changed])
    assert.equal(score.passed,false)
    assert.equal(score.addressMatched,3)
    assert.equal(score.typeMatched,2)
  })
})
