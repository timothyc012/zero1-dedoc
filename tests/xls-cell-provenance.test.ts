import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { parse } from "../src/index.js"

const fixture=()=>readFileSync(new URL("./fixtures/xls/budget.xls",import.meta.url))

describe("opt-in XLS BIFF cell provenance",()=>{
  it("preserves decoded source type, address, numeric value, and merge range",async()=>{
    const result=await parse(fixture(),{includeCellProvenance:true})
    assert.equal(result.success,true)
    if(!result.success)return
    const table=result.blocks.find(block=>block.type==="table")?.table
    assert.ok(table)
    assert.deepEqual(table.cells[0][0].sourceCell,{
      address:"A1",storedType:"string",rawValue:"2025년도 부서별 예산 편성",mergeRange:"A1:D1",
    })
    assert.deepEqual(table.cells[2][1].sourceCell,{
      address:"B3",storedType:"number",rawValue:"12500000000",
    })
    assert.equal(table.cells[3][2].sourceCell?.rawValue,"-200000000")
  })

  it("keeps default IR unchanged",async()=>{
    const result=await parse(fixture())
    assert.equal(result.success,true)
    if(!result.success)return
    assert.equal(result.blocks.find(block=>block.type==="table")?.table?.cells[2][1].sourceCell,undefined)
  })
})
