# 사용: python relayout-cls.py 저장본.tsv 재조판.tsv relayout-out/index.json — reflow-cmp PARADUMP 두 벌(원본·윈도 재조판)을 문단 글로 맞대
#   저장=재조판인데 우리만 틀린 문단(고칠 대상)을 문서별로 센다. 원본 폴더는 재조판 번호(0000.hwpx …)로 심볼릭 링크해 같은 이름으로 돌린다
import json,collections,sys
def load(p):
  d={}; occ=collections.Counter()
  for l in open(p):
    f,i,ok,t,g,tx=l.rstrip('\n').split('\t'); occ[(f,tx)]+=1; d[(f,tx,occ[(f,tx)])]=(json.loads(t),json.loads(g),int(i))
  return d
O=load(sys.argv[1]); W=load(sys.argv[2])
I=json.load(open(sys.argv[3]))
c=collections.Counter(); A=[]; perdoc=collections.Counter()
for k,(t,g,i) in O.items():
  w=W.get(k); wt=w[0] if w else None
  if w is None: cls='no-win'
  elif wt==t: cls='S=W ours ok' if g==t else 'S=W OURS BAD'
  else: cls='S≠W ' + ('ours=S' if g==t else 'ours=W' if g==wt else 'neither')
  c[cls]+=1
  if cls=='S=W OURS BAD': A.append((I[k[0]],k[1],t,g)); perdoc[I[k[0]]]+=1
for k,v in sorted(c.items()): print(k,v)
print()
for d,n in perdoc.most_common(30): print(n,d)
if len(sys.argv) > 4: json.dump(A,open(sys.argv[4],'w'),ensure_ascii=False)
