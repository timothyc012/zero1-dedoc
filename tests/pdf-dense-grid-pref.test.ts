import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { preferDenseRuledGrids } from "../src/pdf/page-blocks.js"
import { dropGridsInside } from "../src/pdf/clip-cells.js"
import type { LineSegment, TableGrid, TextItem } from "../src/pdf/line-detector.js"

function grid(x1: number, y1: number, x2: number, y2: number, rows: number, cols: number): TableGrid {
  return {
    rowYs: Array.from({length:rows+1},(_,i)=>y2-(y2-y1)*i/rows),
    colXs: Array.from({length:cols+1},(_,i)=>x1+(x2-x1)*i/cols),
    bbox:{x1,y1,x2,y2}, vertexRadius:1,
  }
}
function rules(g: TableGrid): { horizontals: LineSegment[]; verticals: LineSegment[] } {
  return {
    horizontals:g.rowYs.map(y=>({x1:g.bbox.x1,y1:y,x2:g.bbox.x2,y2:y,lineWidth:0.5})),
    verticals:g.colXs.map(x=>({x1:x,y1:g.bbox.y1,x2:x,y2:g.bbox.y2,lineWidth:0.5})),
  }
}
function labels(g: TableGrid): TextItem[] {
  const result: TextItem[]=[]
  for(let row=0;row<g.rowYs.length-1;row++) for(let col=0;col<g.colXs.length-1;col++) {
    result.push({text:String(row*100+col),x:g.colXs[col]+2,y:g.rowYs[row+1]+2,w:8,h:4,fontSize:4,fontName:"Test"})
  }
  return result
}

describe("dense ruled grid against broad clip containers", () => {
  it("keeps a 36×10 physical table and drops overlapping clip fragments", () => {
    const main=grid(50,80,780,500,36,10)
    const fragment=grid(50,200,240,290,3,1)
    const separate=grid(50,520,240,550,1,1)
    const edgeBox=grid(760,200,840,240,2,2)
    const {horizontals,verticals}=rules(main)
    const containers=[{x1:50,y1:70,x2:780,y2:520}]
    assert.deepEqual(dropGridsInside([main],[fragment,separate],containers),[],"current geometric filter reproduces BMF loss")
    const result=preferDenseRuledGrids([main],[fragment,separate,edgeBox],containers,horizontals,verticals,labels(main))
    assert.ok(result.includes(main))
    assert.ok(result.includes(separate),"independent box beside the table remains separate")
    assert.ok(result.includes(edgeBox),"a side box touching only the table border remains separate")
    assert.ok(!result.includes(fragment),"overlapping clip must not steal full-grid text")
  })

  it("keeps the form-container guard for a shallow 3×3 frame", () => {
    const shallow=grid(50,50,500,700,3,3)
    const nested=grid(120,120,200,160,1,2)
    const {horizontals,verticals}=rules(shallow)
    const result=preferDenseRuledGrids([shallow],[nested],[{x1:50,y1:50,x2:500,y2:700}],horizontals,verticals,labels(shallow))
    assert.ok(!result.includes(shallow))
    assert.ok(result.includes(nested))
  })

  it("keeps a real nested clip table confined to one physical cell", () => {
    const main=grid(50,80,780,500,36,10)
    const x1=main.colXs[3]+3,x2=main.colXs[4]-3
    const y1=main.rowYs[11]+1,y2=main.rowYs[10]-1
    const nested=grid(x1,y1,x2,y2,2,2)
    nested.clipParent={x1:x1-1,y1:y1-1,x2:x2+1,y2:y2+1}
    const {horizontals,verticals}=rules(main)
    const result=preferDenseRuledGrids([main],[nested],[{x1:50,y1:70,x2:780,y2:520}],horizontals,verticals,labels(main))
    assert.ok(result.includes(main))
    assert.ok(result.includes(nested),"a nested table entirely within one ruled cell survives")
  })
})
