import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {PDFiumLibrary} from '@hyzyla/pdfium'
import {parse} from '../src/index.js'
import {getOcrEngine} from '../src/ocr/engine.js'
import {deskewPage} from '../src/ocr/deskew.js'
import {blockTexts} from './ocr-lib.mjs'
import {getOcrModelStatus} from '../src/ocr/models.js'

const args=process.argv.slice(2),option=k=>args.includes(k)?args[args.indexOf(k)+1]:undefined
const split=option('--split')??'development',limit=Number(option('--limit')??20),out=option('--out')??'bench/out/competition-zero1.json'
const manifest=JSON.parse(await readFile(option('--manifest')??'bench/german-pdf-competition-manifest.json','utf8'))
const modelStatus=await getOcrModelStatus('de')
if(!modelStatus.every(model=>model.verified))throw new Error('German models must be prepared and SHA verified')
const pdfium=await PDFiumLibrary.init(),engine=await getOcrEngine('de'),documents=[]
let captured=[]
const recognize=engine.recognizePage.bind(engine)
engine.recognizePage=async(...args)=>{const items=await recognize(...args);captured.push(...items);return items}
function inverseBox(item,width,height,angle){
 const t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t),cx=(width-1)/2,cy=(height-1)/2
 const corners=item.quad?item.quad.map(p=>[p.x,p.y]):[[item.x,item.y],[item.x+item.w,item.y],[item.x,item.y+item.h],[item.x+item.w,item.y+item.h]]
 const pts=corners.map(([x,y])=>[c*(x-cx)-s*(y-cy)+cx,s*(x-cx)+c*(y-cy)+cy])
 const x=Math.min(...pts.map(p=>p[0])),y=Math.min(...pts.map(p=>p[1]))
 return {...item,x,y,w:Math.max(...pts.map(p=>p[0]))-x,h:Math.max(...pts.map(p=>p[1]))-y}
}
for(const doc of manifest.documents.filter(d=>split==='all'||d.split===split).slice(0,limit)){
 const bytes=await readFile('bench/corpus/'+(manifest.corpus_dir??'german-pdf-competition')+'/'+doc.pdf)
 if(createHash('sha256').update(bytes).digest('hex')!==doc.pdf_sha256)throw new Error('input hash mismatch: '+doc.id)
 const start=performance.now(),pdf=await pdfium.loadDocument(bytes),page=pdf.getPage(0)
 const image=await page.render({scale:3,render:async({data})=>data}),rgba=new Uint8Array(image.data)
 for(let i=0;i<rgba.length;i+=4){const b=rgba[i];rgba[i]=rgba[i+2];rgba[i+2]=b}
 const upright=deskewPage(rgba,image.width,image.height)
 captured=[]
 const parseStart=performance.now()
 const result=await parse(bytes,{ocr:true,ocrLanguage:'de',images:false})
 const elapsed=(performance.now()-parseStart)/1000
 const sx=doc.source_width/image.width,sy=doc.source_height/image.height
 const items=captured.map(item=>inverseBox(item,image.width,image.height,upright.angle)).map(item=>({...item,x:item.x*sx,y:item.y*sy,w:item.w*sx,h:item.h*sy}))
 documents.push({id:doc.id,pdf_sha256:doc.pdf_sha256,success:result.success,items,text:result.success?blockTexts(result.blocks).join('\n'):'',warnings:(result.warnings??[]).map(w=>w.code),elapsed_seconds:elapsed})
 pdf.destroy()
 await mkdir('bench/out',{recursive:true});await writeFile(out,JSON.stringify({parser:'zero1',split,models:modelStatus.map(model=>({filename:model.spec.filename,sha256:model.spec.sha256})),documents},null,2))
 console.log(doc.id,items.length,Math.round((performance.now()-start)/10)/100)
}
