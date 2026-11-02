# 짝 PDF 쪽별 글 조각(공백 단위 낱말 아님 — span 단위) 원점 → json
import sys, json, pymupdf
pymupdf.TOOLS.mupdf_display_errors(False)
out = {}
for p in sys.argv[2:]:
    try: d = pymupdf.open(p)
    except Exception: continue
    pages = []
    for pg in d:
        sp = []
        for b in pg.get_text('rawdict')['blocks']:
            for l in b.get('lines', []):
                for s in l['spans']:
                    ch = s['chars']
                    t = ''.join(c['c'] for c in ch).strip()
                    first = next((c for c in ch if not c['c'].isspace()), None)
                    # 원점은 첫 글자(앞 공백 건너뜀) — 우리 SVG 는 공백 2개+ 를 따로 떼고 글 조각을 그 뒤에서 시작한다
                    # 앞 공백마다의 원점도 담는다 — 우리 조각의 앞 공백 수에 맞춰 고른다
                    lead = [round(c['origin'][0], 2) for c in ch[:ch.index(first)]] if first else []
                    if len(t) >= 4 and first: sp.append([t, round(first['origin'][0], 2), round(first['origin'][1], 2), lead])
        pages.append(sp)
    out[p] = pages
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False)
