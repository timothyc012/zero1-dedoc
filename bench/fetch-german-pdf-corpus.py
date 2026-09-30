"""Fetch only the 40 frozen public German evaluation images and labels."""
import hashlib,json,urllib.request
from pathlib import Path

root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'bench/german-pdf-competition-manifest.json').read_text())
for doc in manifest['documents']:
 folder=doc['label_local'].split('/')[0]
 for part,expected in [(doc['image_path'],doc['image_sha256']),(doc['label_path'],doc['label_sha256'])]:
  target=root/'bench/corpus'/folder/part
  if target.exists():
   if hashlib.sha256(target.read_bytes()).hexdigest()!=expected:raise ValueError('Cached input hash mismatch: '+doc['id'])
   continue
  url=manifest['source_url']+'/resolve/'+manifest['source_revision']+'/'+part
  with urllib.request.urlopen(url,timeout=120) as response:data=response.read()
  if hashlib.sha256(data).hexdigest()!=expected:raise ValueError('Downloaded input hash mismatch: '+doc['id'])
  target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 print(doc['id'],'verified',flush=True)
