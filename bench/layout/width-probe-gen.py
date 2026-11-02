# 글꼴 폭 탐침 HWPX 생성 — 한컴 저장 HWPX 하나를 틀로 글꼴(이름·유형)마다 문서 하나:
# 글꼴 칸 7개 모두 그 글꼴 하나, 글자 모양 전부 같은 크기·장평·자간(기본 40pt(q=1000 → 폭 = 4·em×1000)·100·0)·굵게/기울임 없음,
# 문단 모양 전부 왼쪽 정렬·여백 0, 본문 = 글자마다 10번 반복한 문단. 한컴으로 PDF 를 찍어 width-probe-read.py 로 읽는다.
# 사용: python width-probe-gen.py 틀.hwpx faces.json(face-chars.py) 출력폴더 [최대 글꼴 수]
# 환경변수 PROBE_H(크기 pt×100, 기본 4000)·PROBE_RATIO(장평, 100)·PROBE_SPACING(자간, 0)·PROBE_FACES(글꼴|유형 목록, 쉼표)
import sys, os, re, json, zipfile
from html import escape as _html_escape
escape = lambda s: _html_escape(s, quote=False)  # & < > 만 — xml.sax.saxutils.escape 와 같다

tpl, faces_json, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
limit = int(sys.argv[4]) if len(sys.argv) > 4 else 10**9
PH, PR, PS = (int(os.environ.get(k, d)) for k, d in (('PROBE_H', 4000), ('PROBE_RATIO', 100), ('PROBE_SPACING', 0)))
ONLY = set(filter(None, os.environ.get('PROBE_FACES', '').split(',')))
z = zipfile.ZipFile(tpl)
files = {n: z.read(n) for n in z.namelist() if not n.startswith('Preview/')}
H = files['Contents/header.xml'].decode('utf8')
S = files['Contents/section0.xml'].decode('utf8')
LANG_ATTRS = 'hangul latin hanja japanese other symbol user'.split()

def header_for(face, typ):
    font = f'<hh:font id="0" face="{escape(face, {chr(34): "&quot;"})}" type="{typ}" isEmbedded="0"/>'
    h = re.sub(r'(<hh:fontface [^>]*fontCnt=")\d+("[^>]*>).*?(</hh:fontface>)', lambda m: m.group(1) + '1' + m.group(2) + font + m.group(3), H, flags=re.S)
    all0 = lambda tag, v: f'<hh:{tag} ' + ' '.join(f'{a}="{v}"' for a in LANG_ATTRS) + '/>'
    def cp(m):
        b = re.sub(r'height="\d+"', f'height="{PH}"', m.group(0), count=1)
        b = re.sub(r'<hh:fontRef [^>]*/>', all0('fontRef', 0), b)
        b = re.sub(r'<hh:ratio [^>]*/>', all0('ratio', PR), b)
        b = re.sub(r'<hh:spacing [^>]*/>', all0('spacing', PS), b)
        b = re.sub(r'<hh:relSz [^>]*/>', all0('relSz', 100), b)
        b = re.sub(r'<hh:offset [^>]*/>', all0('offset', 0), b)
        return re.sub(r'<hh:(bold|italic)/>', '', b)
    h = re.sub(r'<hh:charPr .*?</hh:charPr>', cp, h, flags=re.S)
    def pp(m):
        b = re.sub(r'horizontal="\w+"', 'horizontal="LEFT"', m.group(0))
        b = re.sub(r'condense="\d+"', 'condense="0"', b)
        return re.sub(r'<hc:(intent|left|right) value="-?\d+"', r'<hc:\1 value="0"', b)
    return re.sub(r'<hh:paraPr .*?</hh:paraPr>', pp, h, flags=re.S)

head = S[:S.index('<hp:p ')]
sec = re.search(r'<hp:secPr.*?</hp:secPr>', S, re.S).group(0)
col = re.search(r'<hp:ctrl><hp:colPr[^>]*/></hp:ctrl>', S)
first = re.search(r'<hp:p [^>]*>', S).group(0)
pid = re.search(r'paraPrIDRef="(\d+)"', first).group(1)
cid = re.search(r'<hp:run charPrIDRef="(\d+)"', S).group(1)

def section_for(chars):
    ps = [f'{first}<hp:run charPrIDRef="{cid}">{sec}{col.group(0) if col else ""}</hp:run></hp:p>']
    for ch in chars:
        ps.append(f'<hp:p id="0" paraPrIDRef="{pid}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="{cid}"><hp:t>{escape(ch * 10)}</hp:t></hp:run></hp:p>')
    return head + ''.join(ps) + '</hs:sec>'

os.makedirs(outdir, exist_ok=True)
faces = json.load(open(faces_json, encoding='utf8'))
index = {}
for i, (key, v) in enumerate(faces.items()):
    if i >= limit: break
    if ONLY and key not in ONLY: continue
    face, typ = key.rsplit('|', 1)
    chars = [c for c in v['chars'] if not (0x1100 <= ord(c) <= 0x11ff) and ord(c) not in (0x200b, 0xfeff)]
    name = f'{i:03d}.hwpx'
    with zipfile.ZipFile(os.path.join(outdir, name), 'w', zipfile.ZIP_DEFLATED) as o:
        o.writestr(zipfile.ZipInfo('mimetype'), files['mimetype'], compress_type=zipfile.ZIP_STORED)
        for n, b in files.items():
            if n == 'mimetype': continue
            if n == 'Contents/header.xml': b = header_for(face, typ).encode('utf8')
            elif n == 'Contents/section0.xml': b = section_for(chars).encode('utf8')
            o.writestr(n, b)
    index[name] = {'face': face, 'type': typ, 'chars': ''.join(chars), 'height': PH, 'ratio': PR, 'spacing': PS}
json.dump(index, open(os.path.join(outdir, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(index), 'probe docs')
