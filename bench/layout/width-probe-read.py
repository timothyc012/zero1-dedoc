# width-probe-gen.py 탐침 PDF(한컴이 찍은 것) → 글꼴별 글자 폭 json
# 줄 안 같은 글자 원점 간격 = 한컴 글자 폭(HWPUNIT, 양자화 후). 40pt(q=1000)면 폭/4 = em×1000. PDF 좌표는 0.99945 배로 줄어 찍혀 되돌린다
# (바탕 TTF 96자: 보정 후 4·MulDiv(adv, 1000, unitsPerEm) 와 전부 일치)
# 출력: {"face|type|크기|장평|자간": {"pdfFonts": {PDF글꼴: 글자수}, "w": {글자: [폭 HWPUNIT, PDF글꼴]}, "missing": "못 읽은 글자"}}
# PDF 글꼴이 그 글꼴이 아니면(이 PC 에 없는 TTF → 대체, 한컴바탕 등으로 글자 대체) 그 폭은 대체 글꼴의 폭이다
import sys, os, json, pymupdf
from collections import Counter
pymupdf.TOOLS.mupdf_display_errors(False)
SCALE = 0.99945
d = sys.argv[2]
idx = json.load(open(os.path.join(d, 'index.json'), encoding='utf8'))
out = {}
for name, meta in sorted(idx.items()):
    p = os.path.join(d, name[:-5] + '.pdf')
    if not os.path.exists(p): continue
    w, fonts = {}, Counter()
    for pg in pymupdf.open(p):
        for b in pg.get_text('rawdict')['blocks']:
            for l in b.get('lines', []):
                ch = [(c, s['font']) for s in l['spans'] for c in s['chars']]
                if not ch: continue
                t = ch[0][0]['c']
                xs = [c['origin'][0] for c, _ in ch if c['c'] == t]
                for _, f in ch: fonts[f] += 1
                if len(xs) >= 2 and t not in w:
                    w[t] = [round((xs[-1] - xs[0]) / (len(xs) - 1) * 100 / SCALE, 1), ch[0][1]]
    out[f"{meta['face']}|{meta['type']}|{meta.get('height', 4000)}|{meta.get('ratio', 100)}|{meta.get('spacing', 0)}"] = {'pdfFonts': dict(fonts.most_common()), 'w': w, 'missing': ''.join(c for c in meta['chars'] if c not in w)}
json.dump(out, open(sys.argv[1], 'w', encoding='utf8'), ensure_ascii=False)
for k, v in out.items(): print(f"{len(v['w']):5} ok {len(v['missing']):4} miss  {k:28} {list(v['pdfFonts'])[:4]}")
