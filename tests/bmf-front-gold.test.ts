import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { scoreBmfFrontPage } from "../bench/lib/bmf-score.mjs"

const gold=JSON.parse(readFileSync(new URL("../bench/bmf-front-gold.json",import.meta.url),"utf8"))

describe("BMF front-page workbook gold",()=>{
  it("pins independent 20×7 and 23×7 tables on page 3",()=>{
    assert.deepEqual(gold.pages.map((page:any)=>page.tables.map((table:any)=>[table.expectedRows,table.expectedCols])),[
      [[47,7]],[[50,7]],[[20,7],[23,7]],
    ])
    assert.equal(gold.pages[2].outsideTableRows[0].text,"Übersicht 4")
  })

  it("pins the Lohnsteuer and final total cells on page 1",()=>{
    const page=gold.pages[0],rows=page.tables[0].rows
    const lohn=rows.find((row:any)=>row.sourceRow===7)
    const total=rows.find((row:any)=>row.sourceRow===51)
    assert.deepEqual(lohn.values.map((cell:any)=>cell.display),[
      "21.890.941","20.966.969","4,4","178.401.148","170.488.348","4,6",
    ])
    assert.equal(total.values[0].display,"64.323.011")
  })

  it("rejects the old single 44×7 output even with every displayed token",()=>{
    const page=gold.pages[2]
    const merged={type:"table",table:{rows:44,cols:7,cells:[[{text:"Übersicht 4"}]]}}
    const score=scoreBmfFrontPage(page,[merged])
    assert.equal(score.exactTables,0)
    assert.equal(score.fullCellGoldPass,false)
    assert.equal(score.outsideTableRows[0].outside,false)
  })
})
