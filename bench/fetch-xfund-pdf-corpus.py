"""Reproduce only the frozen XFUND German evaluation PDFs; never rewrite gold."""
import hashlib
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'bench/german-xfund-pdf-manifest.json').read_text())
corpus = root / 'bench/corpus/xfund-de'
corpus.mkdir(parents=True, exist_ok=True)


def checked_download(name, expected):
    with urllib.request.urlopen(manifest['source_url'] + name, timeout=120) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('XFUND release hash mismatch: ' + name)
    return data


def checked_save(path, data, expected):
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('XFUND entry hash mismatch: ' + path.name)
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise ValueError('Cached XFUND entry hash mismatch: ' + path.name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


labels = json.loads(checked_download('de.val.json', manifest['source_label_sha256']))
archive = checked_download('de.val.zip', manifest['source_archive_sha256'])
label_by_id = {str(document['id']): document for document in labels['documents']}
with zipfile.ZipFile(io.BytesIO(archive)) as source_zip:
    for doc in manifest['documents']:
        label = label_by_id[doc['id']]
        filename = Path(label['img']['fname']).name
        member = next(name for name in source_zip.namelist() if Path(name).name == filename)
        image_bytes = source_zip.read(member)
        image_path = corpus / 'images' / filename
        checked_save(image_path, image_bytes, doc['image_sha256'])
        label_bytes = json.dumps(label, ensure_ascii=False).encode('utf-8')
        checked_save(root / 'bench/corpus' / doc['label_local'], label_bytes, doc['label_sha256'])
        with Image.open(io.BytesIO(image_bytes)) as image:
            width, height = image.size
        pdf_path = root / 'bench/corpus' / manifest['corpus_dir'] / doc['pdf']
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_bytes = io.BytesIO()
        pdf = canvas.Canvas(pdf_bytes, pagesize=(width / 2, height / 2), invariant=1, pageCompression=1)
        pdf.drawImage(ImageReader(str(image_path)), 0, 0, width=width / 2, height=height / 2)
        pdf.showPage()
        pdf.save()
        checked_save(pdf_path, pdf_bytes.getvalue(), doc['pdf_sha256'])
        print(doc['id'], 'verified', flush=True)
