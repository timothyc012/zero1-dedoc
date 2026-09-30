import test from "node:test"
import assert from "node:assert/strict"
import { orientedComponentBoxes } from "../src/ocr/oriented-box.js"
import { lineCrop, splitBoxAtCellRules } from "../src/ocr/crop.js"

test("rectifies a sloping text line without including the next line", () => {
  const w=180,h=70,prob=new Float32Array(w*h),rgba=new Uint8Array(w*h*4).fill(255)
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const across=x-20,down=y-10-across*0.16
    if(across>=0&&across<=140&&down>=0&&down<=8){prob[y*w+x]=0.95;for(let c=0;c<3;c++)rgba[(y*w+x)*4+c]=30}
    if(across>=0&&across<=140&&down>=20&&down<=28)for(let c=0;c<3;c++)rgba[(y*w+x)*4+c]=80
  }
  const boxes=orientedComponentBoxes(prob,w,h,0.3,0.6,0.3)
  assert.equal(boxes.length,1)
  assert.ok(boxes[0].quad)
  const crop=lineCrop(rgba,w,boxes[0],0)
  const center=Array.from({length:crop.w},(_,x)=>crop.rgb[(24*crop.w+x)*3])
  assert.ok(center.filter(v=>v<60).length>crop.w*0.8)
  // A horizontal crop of the axis-aligned box would cut across both lines.
  assert.ok(Math.max(...boxes[0].quad!.map(p=>p.y))-Math.min(...boxes[0].quad!.map(p=>p.y))>20)
})
test("ignores low-confidence regions and tiny fragments", () => {
  const prob=new Float32Array(100).fill(0.4)
  assert.equal(orientedComponentBoxes(prob,10,10,0.3,0.7,1.5).length,0)
})
test("oriented and horizontal crops use the same pixel-center convention", () => {
  const width=60,height=40,rgba=new Uint8Array(width*height*4).fill(255)
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgba[(y*width+x)*4+c]=x*3+y*2
  const box={x:10,y:5,w:30,h:15}
  const horizontal=lineCrop(rgba,width,box,0)
  const oriented=lineCrop(rgba,width,{...box,quad:[{x:10,y:5},{x:40,y:5},{x:40,y:20},{x:10,y:20}]},0)
  assert.equal(oriented.w,horizontal.w)
  assert.deepEqual(oriented.rgb,horizontal.rgb)
})
test("rejects invalid map and degenerate crop dimensions", () => {
  assert.throws(() => orientedComponentBoxes(new Float32Array(10), 3, 3, 0.3, 0.6, 1.5), /dimensions/)
  assert.throws(() => lineCrop(new Uint8Array(400), 10, {x:0,y:0,w:1,h:1,quad:[{x:0,y:0},{x:0,y:0},{x:0,y:0},{x:0,y:0}]}, 0), /dimensions/)
})
test("splits an oriented text line at a ruled table-cell boundary", () => {
  const box={x:0,y:0,w:100,h:12,quad:[{x:0,y:0},{x:100,y:2},{x:100,y:12},{x:0,y:10}] as [{x:number;y:number},{x:number;y:number},{x:number;y:number},{x:number;y:number}]}
  const parts=splitBoxAtCellRules(box,[{x1:50,y1:0,y2:12,thicknessPx:2}])
  assert.equal(parts.length,2)
  assert.equal(parts[0].quad![1].x,48)
  assert.equal(parts[1].quad![0].x,52)
  assert.equal(parts[0].quad![0].x,0)
  assert.equal(parts[1].quad![1].x,100)
})
