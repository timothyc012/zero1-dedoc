# faces.json(face-chars.py) 의 글꼴 이름 → 이 PC 의 글꼴 파일 (TTF/OTF/TTC 는 name 표, HFT 는 한컴 hftinfo.dat 매핑)
# 사용: python face-files.py faces.json out.json  — 맥으로 글꼴 파일을 옮겨 hmtx·HFT 폭을 직접 읽기 위한 목록
import sys, os, json, re
from fontTools.ttLib import TTFont, TTCollection

HNC = r'C:\Program Files (x86)\Hnc\Office 2024\HOffice130'
DIRS = [r'C:\Windows\Fonts', os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Windows\Fonts'),
        HNC + r'\Shared\TTF\All', HNC + r'\Shared\TTF\Hwp',   # 한컴 비공개 글꼴(FontDB/PrivateFontList.ini — 윈도 글꼴 등록 없이 한글만 쓴다)
        HNC + r'\Shared\Fonts', HNC + r'\Bin\Shared\Fonts', HNC + r'\Bin\Shared\HwordFont', HNC + r'\Bin\Shared\DocTheme\Fonts']

names = {}  # 이름 → [파일, ttc 번호]
for d in DIRS:
    if not os.path.isdir(d): continue
    for fn in os.listdir(d):
        p = os.path.join(d, fn); ext = fn.lower().rsplit('.', 1)[-1]
        try:
            fonts = TTCollection(p).fonts if ext == 'ttc' else [TTFont(p, lazy=True)] if ext in ('ttf', 'otf') else []
        except Exception: continue
        for i, f in enumerate(fonts):
            try:
                for r in f['name'].names:
                    if r.nameID in (1, 4, 16):
                        try: names.setdefault(r.toUnicode().strip(), [p, i])
                        except Exception: pass
            except Exception: pass

hft = {}
t = open(HNC + r'\Bin\FontDB\hftinfo.dat', encoding='utf-16').read()
for m in re.finditer(r'^([^;\[\r\n=][^=\r\n]*)=([^,\r\n]+\.HFT)', t, re.M | re.I):
    hft.setdefault(m.group(1).strip(), m.group(2).strip())
hftdirs = [d for d in DIRS if os.path.isdir(d)]

faces = json.load(open(sys.argv[1], encoding='utf8'))
out = {}
for key in faces:
    face, typ = key.rsplit('|', 1)
    if typ == 'HFT' or face not in names:   # 유형이 TTF 라도 그 이름의 TTF 가 없으면 한컴은 같은 이름 HFT 를 쓴다(한양신명조 등)
        fn = hft.get(face)
        path = next((os.path.join(d, x) for d in hftdirs if fn for x in os.listdir(d) if x.lower() == fn.lower()), None)
        out[key] = {'file': path, 'hft': fn}
    else:
        hit = names.get(face)
        out[key] = {'file': hit[0], 'index': hit[1]} if hit else {'file': None}
json.dump(out, open(sys.argv[2], 'w', encoding='utf8'), ensure_ascii=False, indent=1)
miss = [k for k, v in out.items() if not v['file']]
print(len(out) - len(miss), 'found /', len(out)); print('missing:', miss)
