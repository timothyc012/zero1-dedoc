# 저장본 lineseg ↔ 윈도 한글 재조판 lineseg(strip-lineseg.py → batch-pdf.sh FORMAT=HWPX) 문단별 대조
# 같은 문서의 hp:p 를 문서 순서대로 짝짓고(구조가 같다) 직속 linesegarray 의 줄 시작(textpos)·vertpos 를 비교한다
# 사용: python lineseg-pair.py 재조판폴더(strip index.json 이 있는 폴더) 출력폴더 [out.json]  (defusedxml 필요)
# out.json: {원본경로: {"multi": 두 줄+ 문단 수, "same": 줄 시작 전부 같음, "diff": [[문단 번호, 저장 textpos, 윈도 textpos, 글 앞 40자]]}}
import sys, os, re, json, zipfile
import defusedxml.ElementTree as ET  # 외부 엔티티를 막는 파서(pip install defusedxml)
HP = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'

def paras(path):
    out = []
    with zipfile.ZipFile(path) as z:
        for n in sorted((n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n)), key=lambda n: int(re.findall(r'\d+', n)[-1])):
            for p in ET.fromstring(z.read(n)).iter(HP + 'p'):
                lsa = p.find(HP + 'linesegarray')
                segs = [(int(s.get('textpos')), int(s.get('vertpos'))) for s in lsa.findall(HP + 'lineseg')] if lsa is not None else []
                text = ''.join(t.text or '' for r in p.findall(HP + 'run') for t in r.findall(HP + 't'))
                out.append((segs, text))
    return out

src, outd = sys.argv[1], sys.argv[2]
idx = json.load(open(os.path.join(src, 'index.json'), encoding='utf8'))
res, tot = {}, [0, 0, 0, 0]
for name, orig in sorted(idx.items()):
    o = os.path.join(outd, name)
    if not os.path.exists(o): continue
    a, b = paras(orig), paras(o)
    if len(a) != len(b): res[orig] = {'error': f'문단 수 다름 {len(a)} vs {len(b)}'}; continue
    multi = same = vsame = 0; diff = []
    for i, ((sa, ta), (sb, _)) in enumerate(zip(a, b)):
        if len(sa) < 2: continue
        multi += 1
        if [x[0] for x in sa] == [x[0] for x in sb]:
            same += 1
            if [x[1] for x in sa] == [x[1] for x in sb]: vsame += 1
        else: diff.append([i, [x[0] for x in sa], [x[0] for x in sb], ta[:40]])
    res[orig] = {'multi': multi, 'same': same, 'vsame': vsame, 'diff': diff}
    tot[0] += 1; tot[1] += multi; tot[2] += same; tot[3] += vsame
if len(sys.argv) > 3: json.dump(res, open(sys.argv[3], 'w', encoding='utf8'), ensure_ascii=False)
print(f'docs {tot[0]}  두 줄+ 문단 {tot[1]}  윈도 = 저장 줄 시작 {tot[2]} ({100 * tot[2] / max(tot[1], 1):.2f}%)  그중 vertpos 도 같음 {tot[3]}')
errs = [k for k, v in res.items() if 'error' in v]
if errs: print('구조 다름', len(errs), errs[:3])
