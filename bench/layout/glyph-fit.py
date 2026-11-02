# 사용: python glyph-fit.py LEFT사본.pdf[,…] glyph-widths.json [최소빈도 8] [스타일 수 6] — 한 스타일만 쓰는 줄의 폭으로 글자 폭을 최소제곱으로 풀어 우리 폭과 다른 글자를 보인다
# (주의: 글꼴에 없어 대체 글꼴로 그린 글자는 그린 폭이 줄 나눔 폭과 다를 수 있다)
# 글꼴 스타일별 글자 폭 최소제곱: 한 스타일만 쓰는 줄(LEFT PDF) — 줄 폭 = Σ 글자 수×폭. 자주 나오는 글자만 미지수
import json, bisect, collections, sys, numpy as np, pymupdf as fitz
P=json.load(open(sys.argv[2])); docs=sys.argv[1].split(',')
texts=[p['t'] for p in P]; big='\x00'.join(texts); starts=[]; acc=0
for t in texts: starts.append(acc); acc+=len(t)+1
lines=collections.defaultdict(list); ours={}
for dp in docs:
  d=fitz.open(dp)
  for pg in d:
    for b in pg.get_text('rawdict')['blocks']:
      for l in b.get('lines',[]):
        ch=[c for s in l['spans'] for c in s['chars']]; txt=''.join(c['c'] for c in ch)
        if len(txt)<10: continue
        i=big.find(txt)
        if i<0 or big.find(txt,i+1)>=0: continue
        k=bisect.bisect_right(starts,i)-1; off=i-starts[k]; p=P[k]
        fs=set(p['f'][off:off+len(txt)-1])
        if len(fs)!=1: continue
        f=fs.pop(); seg=txt[:-1]
        if any(ch[j+1]['origin'][1]!=ch[j]['origin'][1] for j in range(len(ch)-1)): continue
        W=(ch[-1]['origin'][0]-ch[0]['origin'][0])*100
        for j,c in enumerate(seg): ours[(f,c)]=p['w'][off+j]
        lines[f].append((collections.Counter(seg),W))
MIN=int(sys.argv[3]) if len(sys.argv)>3 else 8
for f,L in sorted(lines.items(),key=lambda x:-len(x[1]))[:int(sys.argv[4]) if len(sys.argv)>4 else 6]:
  cnt=collections.Counter()
  for c,_ in L: cnt.update(c)
  var=[c for c,n in cnt.items() if n>=MIN]
  if not var: continue
  A=[];y=[]
  for c,W in L:
    A.append([c.get(v,0) for v in var]); y.append(W-sum(n*ours[(f,ch)] for ch,n in c.items() if ch not in var))
  sol=np.linalg.lstsq(np.array(A,float),np.array(y,float),rcond=None)[0]
  bad=[(v,round(s,1),ours[(f,v)],cnt[v]) for v,s in zip(var,sol) if abs(s-ours[(f,v)])>6]
  print(f, 'lines',len(L),'vars',len(var),'DIFF:',sorted(bad,key=lambda x:-x[3])[:25])
