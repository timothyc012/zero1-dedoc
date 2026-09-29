import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { extractCells } from "../src/pdf/cell-extract.js"
import type { TableGrid, LineSegment } from "../src/pdf/line-types.js"

const grid: TableGrid = {
  rowYs:[80,70,60,50,40,30,20,10,0],
  colXs:[0,50,100,150,200],
  bbox:{x1:0,y1:0,x2:200,y2:80},vertexRadius:0.5,
}
const horizontals:LineSegment[]=grid.rowYs.map(y=>({x1:0,y1:y,x2:200,y2:y,lineWidth:0.5}))
const verticals=(ruledRows:number[]):LineSegment[]=>grid.colXs.flatMap(x=>ruledRows.map(row=>({
  x1:x,y1:grid.rowYs[row+1],x2:x,y2:grid.rowYs[row],lineWidth:0.5,
})))
const items=[
  {text:"Ländersteuern",x:2,y:32,w:35,h:4}, // section row 4, full-width merge
  {text:"Gewerbesteuerumlage",x:2,y:22,w:42,h:4},
  {text:"7.377",x:52,y:22,w:15,h:4},
  {text:"219.795",x:102,y:22,w:20,h:4},
  {text:"8.291",x:152,y:22,w:15,h:4},
]

describe("text-supported unruled numeric row",()=>{
  it("restores columns when nearby ruled rows follow a full-span section band",()=>{
    const cells=extractCells(grid,horizontals,verticals([0,1,6,7]),items)
    assert.equal(cells.filter(cell=>cell.row===5).length,4)
    assert.equal(cells.find(cell=>cell.row===4)?.colSpan,4,"section row remains merged")
  })

  it("does not split a detached numeric note without a nearby ruled row",()=>{
    const cells=extractCells(grid,horizontals,verticals([0,1]),items)
    assert.equal(cells.filter(cell=>cell.row===5).length,1)
    assert.equal(cells.find(cell=>cell.row===5)?.colSpan,4)
  })
})
