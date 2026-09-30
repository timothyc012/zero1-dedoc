"""Wrap frozen German source images as deterministic image-only PDFs."""
import hashlib,json
from pathlib import Path
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

root=Path(__file__).resolve().parent.parent
old=json.loads((root/'bench/ocr-holdout-manifest.json').read_text())['languages']['de']
blind=json.loads((root/'bench/german-ocr-blind-manifest.json').read_text())
documents=[]
out=root/'bench/corpus/german-pdf-competition';out.mkdir(parents=True,exist_ok=True)
for split,source,folder in [('development',old,'ocr-de-belege'),('holdout',blind,'ocr-de-belege-blind')]:
 for doc in source['documents']:
  image=root/'bench/corpus'/folder/doc['image_path'];label=root/'bench/corpus'/folder/doc['label_path']
  assert hashlib.sha256(image.read_bytes()).hexdigest()==doc['image_sha256']
  assert hashlib.sha256(label.read_bytes()).hexdigest()==doc['label_sha256']
  with Image.open(image) as im:w,h=im.size
  pdf=out/(doc['id']+'.pdf')
  # At 144 dpi each source pixel is preserved by both PDFium renderers at 2x.
  c=canvas.Canvas(str(pdf),pagesize=(w/2,h/2),invariant=1,pageCompression=1)
  c.drawImage(ImageReader(str(image)),0,0,width=w/2,height=h/2);c.showPage();c.save()
  documents.append({**doc,'split':split,'pdf':pdf.name,'pdf_sha256':hashlib.sha256(pdf.read_bytes()).hexdigest(),'source_width':w,'source_height':h,'label_local':folder+'/'+doc['label_path']})
manifest={'schema_version':'zero1-german-pdf-competition.v1','source_url':old['source_url'],'source_revision':old['revision'],'construction':'ReportLab invariant image-only PDF; 144 source pixels/inch. No selectable text.','documents':documents}
manifest_path=root/'bench/german-pdf-competition-manifest.json'
if manifest_path.exists():
 if json.loads(manifest_path.read_text())!=manifest:raise ValueError('Derived PDF hashes differ from the frozen manifest; do not regenerate gold')
else:manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'pdfs':len(documents),'development':20,'holdout':20}))
