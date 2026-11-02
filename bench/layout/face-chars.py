# 코퍼스 HWPX → 글꼴(이름|유형)별로 그 글꼴로 찍히는 글자와 빈도 json — width-probe.ps1 입력 목록
# 사용: python face-chars.py out.json bench/corpus/seoul bench/corpus/rhwp ...
# 글자의 언어 칸은 대략 가른다(모호한 기호 구간은 영문·기호 칸 글꼴 둘 다에 넣는다 — 더 재도 손해 없음)
import sys, os, re, json, zipfile
from collections import defaultdict, Counter

LANGS = ['HANGUL', 'LATIN', 'HANJA', 'JAPANESE', 'OTHER', 'SYMBOL', 'USER']
REF = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user']

def slots(cp):
    if 0xac00 <= cp <= 0xd7a3 or 0x1100 <= cp <= 0x11ff or 0x3130 <= cp <= 0x318f or 0xa960 <= cp <= 0xa97f or 0xd7b0 <= cp <= 0xd7ff: return ['hangul']
    if 0x4e00 <= cp <= 0x9fff or 0x3400 <= cp <= 0x4dbf or 0xf900 <= cp <= 0xfaff: return ['hanja']
    if 0x3040 <= cp <= 0x30ff: return ['japanese']
    if cp >= 0xe000 and cp <= 0xf8ff or cp >= 0xf0000: return ['user', 'symbol']
    if cp < 0x2000: return ['latin']
    return ['latin', 'symbol']

out = defaultdict(Counter)
for d in sys.argv[2:]:
    for fn in sorted(os.listdir(d)):
        if not fn.lower().endswith('.hwpx'): continue
        try: z = zipfile.ZipFile(os.path.join(d, fn))
        except Exception: continue
        try: hd = z.read('Contents/header.xml').decode('utf8', 'replace')
        except KeyError: continue
        fonts = {}
        for lang, body in re.findall(r'<hh:fontface[^>]*lang="(\w+)"[^>]*>(.*?)</hh:fontface>', hd, re.S):
            for fid, attrs in re.findall(r'<hh:font\s+id="(\d+)"([^>]*)>', body):
                face = re.search(r'face="([^"]*)"', attrs); typ = re.search(r'type="([^"]*)"', attrs)
                fonts[(lang.lower(), fid)] = f'{face.group(1) if face else "?"}|{typ.group(1) if typ else "?"}'
        cpr = {}
        for cid, body in re.findall(r'<hh:charPr\s+id="(\d+)"[^>]*>(.*?)</hh:charPr>', hd, re.S):
            m = re.search(r'<hh:fontRef([^>]*)/>', body)
            if m: cpr[cid] = {k: v for k, v in re.findall(r'(\w+)="(\d+)"', m.group(1))}
        for name in z.namelist():
            if not re.match(r'Contents/section\d+\.xml$', name): continue
            sx = z.read(name).decode('utf8', 'replace')
            for cid, body in re.findall(r'<hp:run\s+charPrIDRef="(\d+)"[^>]*>(.*?)</hp:run>', sx, re.S):
                ref = cpr.get(cid)
                if not ref: continue
                text = ''.join(re.findall(r'<hp:t>([^<]*)</hp:t>', body))
                for ch in text:
                    cp = ord(ch)
                    if ch in ' \t\r\n': continue
                    for s in slots(cp):
                        f = fonts.get((s, ref.get(s, '')))
                        if f: out[f][ch] += 1
res = {f: {'n': sum(c.values()), 'chars': ''.join(sorted(c))} for f, c in sorted(out.items(), key=lambda kv: -sum(kv[1].values()))}
json.dump(res, open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(res), 'faces')
for f, v in list(res.items())[:40]: print(f'{v["n"]:9} {len(v["chars"]):6}  {f}')
