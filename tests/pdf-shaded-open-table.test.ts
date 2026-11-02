import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {closeShadedTableEdges,nestRestoredShadedGrids} from '../src/pdf/shaded-open-table.js'
import {buildTableGrids,dropShadingClipGrids} from '../src/pdf/table-grid.js'
import type {LineSegment,TableGrid} from '../src/pdf/line-types.js'
const h=(y:number,x1=80,x2=400):LineSegment=>({x1,y1:y,x2,y2:y,lineWidth:.36})
const v=(x:number,y1=330,y2=360):LineSegment=>({x1:x,y1,x2:x,y2,lineWidth:.36})
function fixture(){
 const xs=[80,160,240,320,400],top=360,mid=345
 const cells=xs.slice(0,-1).map((x,i)=>({row:0,col:i,rowSpan:1,colSpan:1,bbox:{x1:x,x2:xs[i+1],y1:mid,y2:top}}))
 const clip:TableGrid={rowYs:[top,mid],colXs:xs,bbox:{x1:80,x2:400,y1:mid,y2:top},vertexRadius:1,cells}
 return {clip,hs:[h(360),h(345),h(330)],vs:[v(160),v(240),v(320)],fills:cells.map(c=>c.bbox)}
}
describe('open shaded header boundaries',()=>{
 it('restores all four columns and drops duplicate shaded header',()=>{
  const {clip,hs,vs,fills}=fixture(),out=closeShadedTableEdges([clip],hs,vs,fills),grids=buildTableGrids(out.horizontals,out.verticals)
  assert.equal(grids.length,1);assert.deepEqual(grids[0].colXs,clip.colXs);assert.deepEqual(grids[0].rowYs,[360,345,330]);assert.equal(dropShadingClipGrids([clip],grids,fills,out.verticals).length,0)
 })
 it('uses the clipped header bottom with two actual horizontal rules',()=>{
  const {clip,hs,vs,fills}=fixture(),out=closeShadedTableEdges([clip],[hs[0],hs[2]],vs,fills),grids=buildTableGrids(out.horizontals,out.verticals)
  assert.deepEqual(grids[0].colXs,clip.colXs);assert.deepEqual(grids[0].rowYs,[360,345,330])
 })
 it('leaves the surrounding frame as one cell and nests the data table',()=>{
  const {clip,hs,vs,fills}=fixture(),out=closeShadedTableEdges([clip],[...hs,h(410,70,410),h(275,70,410)],[...vs,v(70,275,410),v(410,275,410)],fills),grids=buildTableGrids(out.horizontals,out.verticals)
  nestRestoredShadedGrids(grids,out.restored,out.horizontals,out.verticals)
  const nested=grids.find(g=>g.lineNested);assert.ok(nested);assert.deepEqual(nested.colXs,clip.colXs);assert.equal(grids.filter(g=>!g.lineNested)[0].colXs.length,2)
 })
 for(const condition of ['unshaded','unruled','different-bottom','no-body','no-top','no-bottom','filler','different-columns'] as const)it('preserves '+condition+' boundaries',()=>{
  const {clip,hs,vs,fills}=fixture();let rules=hs,verts=vs,shade=fills
  if(condition==='unshaded')shade=[]
  if(condition==='unruled')verts=vs.slice(0,1)
  if(condition==='different-bottom')verts=[vs[0],{...vs[1],y1:320},vs[2]]
  if(condition==='no-body')verts=vs.map(x=>({...x,y1:345}))
  if(condition==='no-top')rules=hs.slice(1)
  if(condition==='no-bottom')rules=hs.slice(0,2)
  if(condition==='filler')clip.cells![0].filler=true
  if(condition==='different-columns')verts=vs.map(x=>({...x,x1:x.x1+10,x2:x.x2+10}))
  const out=closeShadedTableEdges([clip],rules,verts,shade);assert.deepEqual(out,{horizontals:rules,verticals:verts,restored:[]})
 })
 it('does not add rules to an already closed table',()=>{const {clip,hs,vs,fills}=fixture(),verts=[...vs,v(80),v(400)];assert.deepEqual(closeShadedTableEdges([clip],hs,verts,fills),{horizontals:hs,verticals:verts,restored:[]})})
 for(const axis of ['h','v'] as const)it('keeps genuine '+axis+' frame cell divisions',()=>{
  const {clip,hs,vs,fills}=fixture();const rules=[...hs,h(410,70,410),h(275,70,410),...(axis==='h'?[h(390,70,410)]:[])],verts=[...vs,v(70,275,410),v(410,275,410),...(axis==='v'?[v(75,275,410)]:[])];
  const out=closeShadedTableEdges([clip],rules,verts,fills),grids=buildTableGrids(out.horizontals,out.verticals),frame=grids.find(g=>g.bbox.y2===410)!;const before=structuredClone(frame);
  nestRestoredShadedGrids(grids,out.restored,out.horizontals,out.verticals);assert.deepEqual(frame,before)
 })
 it('does not touch existing nested grids without a restored header',()=>{
  const frame:TableGrid={rowYs:[410,390,275],colXs:[70,100,410],bbox:{x1:70,x2:410,y1:275,y2:410},vertexRadius:1};const inner:TableGrid={rowYs:[360,330],colXs:[80,400],bbox:{x1:80,x2:400,y1:330,y2:360},vertexRadius:1,lineNested:true};const grids=[frame,inner],before=structuredClone(grids);nestRestoredShadedGrids(grids,[],[],[]);assert.deepEqual(grids,before)
 })

})
