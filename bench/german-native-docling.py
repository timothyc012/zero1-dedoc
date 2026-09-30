"""Native official BMF PDF through pinned Docling; keep its table coordinates."""
import hashlib,json
from pathlib import Path
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions,RapidOcrOptions
from docling.datamodel.accelerator_options import AcceleratorOptions,AcceleratorDevice
from docling.document_converter import DocumentConverter,PdfFormatOption

root=Path(__file__).resolve().parent.parent;path=root/'bench/corpus/office-pdf/bmf-tax-tables.pdf'
assert hashlib.sha256(path.read_bytes()).hexdigest()=='1bbaae9366524c2830b52092b9e6a5f9b9bdb5a801402e48dd9e58d32385c4b2'
opts=PdfPipelineOptions(do_ocr=True,do_table_structure=True,ocr_options=RapidOcrOptions(lang=['de']))
opts.layout_options.model_spec.revision='8f39ad3c0b4c58e9c2d2c84a38465abf757272d8'
opts.accelerator_options=AcceleratorOptions(num_threads=4,device=AcceleratorDevice.CPU)
result=DocumentConverter(format_options={InputFormat.PDF:PdfFormatOption(pipeline_options=opts)}).convert(path)
blocks=[]
for item,level in result.document.iterate_items():
 if not item.prov:continue
 page=item.prov[0].page_no
 if hasattr(item,'data') and hasattr(item.data,'table_cells'):
  data=item.data;rows=[]
  for r in range(data.num_rows):
   row=[];c=0
   while c<data.num_cols:
    cell=next((x for x in data.table_cells if x.start_row_offset_idx==r and x.start_col_offset_idx==c),None)
    if cell:
     row.append({'text':cell.text,'rowSpan':cell.row_span,'colSpan':cell.col_span})
     if page<=3:
      row.extend({'text':''} for _ in range(cell.col_span-1))
     c+=cell.col_span
    else:row.append({'text':''});c+=1
   rows.append(row)
  blocks.append({'type':'table','pageNumber':page,'table':{'rows':data.num_rows,'cols':data.num_cols,'cells':rows}})
 elif hasattr(item,'text'):blocks.append({'type':'paragraph','pageNumber':page,'text':item.text})
(root/'bench/out/docling-bmf-blocks.json').write_text(json.dumps({'blocks':blocks},ensure_ascii=False))
print('Docling BMF pages',len(result.pages),'tables',sum(x['type']=='table' for x in blocks),flush=True)
