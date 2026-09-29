import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildTableGrids } from "../src/pdf/table-grid.js"
import type { LineSegment } from "../src/pdf/line-types.js"

const xs=[0,50,100,150,200]
const rectangle=(top:number,bottom:number) => ({
  h:[top,top-20,bottom].map(y=>({x1:0,y1:y,x2:200,y2:y,lineWidth:0.5})),
  v:xs.map(x=>({x1:x,y1:bottom,x2:x,y2:top,lineWidth:0.5})),
})
const upper=rectangle(200,160),lower=rectangle(145,105)
const horizontals:LineSegment[]=[...upper.h,...lower.h]
const verticals:LineSegment[]=[...upper.v,...lower.v]

describe("same-column tables separated by a caption",()=>{
  it("preserves the historical adjacent merge when the gap has no text",()=>{
    assert.equal(buildTableGrids(horizontals,verticals).length,1)
  })

  it("keeps independently ruled tables apart when a caption sits in their gap",()=>{
    const grids=buildTableGrids(horizontals,verticals,[
      {text:"Übersicht 4",x:160,y:149,w:38,h:8},
    ])
    assert.deepEqual(grids.map(grid=>[grid.rowYs.length-1,grid.colXs.length-1]).sort((a,b)=>a[0]-b[0]),[[2,4],[2,4]])
  })
})
