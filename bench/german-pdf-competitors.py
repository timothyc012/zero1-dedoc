"""Pinned competitor PDFs -> text/geometry, independent of reference labels."""
import argparse,hashlib,importlib.metadata,json,time
from pathlib import Path

ap=argparse.ArgumentParser();ap.add_argument('--parser',choices=['rapidocr','docling'],required=True);ap.add_argument('--split',choices=['development','holdout'],default='development');ap.add_argument('--limit',type=int,default=20);ap.add_argument('--out',required=True);ap.add_argument('--capacity',choices=['small','medium'],default='small');ap.add_argument('--model-cache',default='bench/corpus/rapidocr-models');ap.add_argument('--manifest',default='bench/german-pdf-competition-manifest.json')
args=ap.parse_args();root=Path(__file__).resolve().parent.parent
if args.parser=='docling' and args.capacity!='small':ap.error('--capacity applies to the standalone RapidOCR runner; Docling uses its default model resolution')
if importlib.metadata.version('rapidocr')!='3.9.2' or importlib.metadata.version('docling')!='2.131.0':
 raise RuntimeError('Install the pinned benchmark requirements before comparison')
manifest=json.loads((root/args.manifest).read_text())
if args.parser=='rapidocr':
 import numpy as np,pypdfium2 as pdfium
 from rapidocr import RapidOCR,ModelType
 capacity=ModelType(args.capacity)
 engine=RapidOCR(params={'Rec.lang_type':'de','Det.model_type':capacity,'Rec.model_type':capacity,'Global.model_root_dir':args.model_cache,'EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':1})
else:
 from docling.datamodel.base_models import InputFormat
 from docling.datamodel.pipeline_options import PdfPipelineOptions,RapidOcrOptions
 from docling.datamodel.accelerator_options import AcceleratorOptions,AcceleratorDevice
 from docling.document_converter import DocumentConverter,PdfFormatOption
 opts=PdfPipelineOptions(do_ocr=True,do_table_structure=True,generate_parsed_pages=True,ocr_options=RapidOcrOptions(lang=['de'],force_full_page_ocr=True))
 opts.layout_options.model_spec.revision='8f39ad3c0b4c58e9c2d2c84a38465abf757272d8'
 opts.accelerator_options=AcceleratorOptions(num_threads=4,device=AcceleratorDevice.CPU)
 engine=DocumentConverter(format_options={InputFormat.PDF:PdfFormatOption(pipeline_options=opts)})
records=[]
for doc in [d for d in manifest['documents'] if d['split']==args.split][:args.limit]:
 path=root/'bench/corpus'/manifest.get('corpus_dir','german-pdf-competition')/doc['pdf']
 assert hashlib.sha256(path.read_bytes()).hexdigest()==doc['pdf_sha256']
 start=time.perf_counter();items=[];text=''
 if args.parser=='rapidocr':
  pdf=pdfium.PdfDocument(str(path));page=pdf[0];bitmap=page.render(scale=3)
  # PIL input lets RapidOCR perform its documented RGB->BGR conversion.
  image=bitmap.to_pil();result=engine(image)
  if result.txts:
   for box,txt,conf in zip(result.boxes,result.txts,result.scores):
    x=float(min(p[0] for p in box));y=float(min(p[1] for p in box))
    sx=doc['source_width']/image.width;sy=doc['source_height']/image.height
    items.append({'text':txt,'x':x*sx,'y':y*sy,'w':(float(max(p[0] for p in box))-x)*sx,'h':(float(max(p[1] for p in box))-y)*sy,'confidence':float(conf)})
  text='\n'.join(item['text'] for item in items)
  bitmap.close();page.close();pdf.close()
 else:
  result=engine.convert(path)
  document_dir=Path(args.out).parent/(Path(args.out).stem+'-documents')
  document_dir.mkdir(parents=True,exist_ok=True)
  (document_dir/(doc['id']+'.json')).write_text(result.document.model_dump_json())
  # Match Zero1's plain IR text extraction: Markdown table/formatting tokens
  # must not make an otherwise preserved numeric answer fail the value check.
  parts=[]
  for item,_ in result.document.iterate_items():
   if hasattr(item,'data') and hasattr(item.data,'table_cells'):
    parts.extend(cell.text for cell in sorted(item.data.table_cells,key=lambda cell:(cell.start_row_offset_idx,cell.start_col_offset_idx)))
   elif hasattr(item,'text'):
    marker=getattr(item,'marker','') or ''
    parts.append((marker+' ' if marker and not item.text.lstrip().startswith(marker) else '')+item.text)
  text='\n'.join(parts)
  # OCR cells retain the recognizer's lines before layout paragraph/table grouping.
  page=result.pages[0];size=page.size
  for cell in page.cells:
   b=cell.rect.to_bounding_box().to_top_left_origin(page_height=size.height)
   sx=doc['source_width']/size.width;sy=doc['source_height']/size.height
   items.append({'text':cell.text,'x':b.l*sx,'y':b.t*sy,'w':(b.r-b.l)*sx,'h':(b.b-b.t)*sy,'confidence':getattr(cell,'confidence',1)})
 elapsed=time.perf_counter()-start
 records.append({'id':doc['id'],'pdf_sha256':doc['pdf_sha256'],'success':True,'items':items,'text':text,'elapsed_seconds':elapsed})
 print(args.parser,doc['id'],len(items),round(elapsed,2),flush=True)
 Path(args.out).parent.mkdir(parents=True,exist_ok=True)
 Path(args.out).write_text(json.dumps({'parser':args.parser,'version':importlib.metadata.version(args.parser),'rapidocr_version':importlib.metadata.version('rapidocr'),'capacity':args.capacity,'render_scale':3,'output_text_kind':'structured plain text' if args.parser=='docling' else 'OCR line text','split':args.split,'documents':records},ensure_ascii=False))
