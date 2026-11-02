# 줄 나눔 폭 탐침: 틀 HWPX(rhwp/SO-SUEOP.hwpx — 글자 모양 10번을 본뜬다) 에 글자 모양을 새로 만들어 글자마다 같은 글자 반복 문단을 둔다.
# 윈도 한글로 재조판(batch-pdf.sh FORMAT=HWPX)한 뒤 reflow-cmp PARADUMP 로 우리 줄 나눔과 맞대고, line-probe-fit.mts 로 글자 폭(em) 구간을 푼다.
# 사용: line-probe.py 틀.hwpx 출력.hwpx spec.json  (출력.rows.json = 문단 순서의 [글자모양 id, 라틴 글꼴, 크기, 진하게, 한글 글꼴, 자간, 장평, 첨자, 글자])
# spec: {"latin":[라틴 글꼴 id…], "hangulL":[한글 글꼴 id…], "sizes":[…], "bold":[0,1], "spacing":[0], "ratio":[100], "chars":"…", "n":150, "pp":"5",
#        "script":["", "supscript", "subscript"], "patch":[["HANGUL"|"LATIN", 글꼴 id, 글꼴 이름, "TTF"|"HFT"]]}  — patch 로 틀의 글꼴 칸을 원하는 글꼴로 바꾼다
import sys,zipfile,subprocess,re,json
from html import escape as _html_escape
escape = lambda s: _html_escape(s, quote=False)  # & < > 만 — xml.sax.saxutils.escape 와 같다
src,out,spec=sys.argv[1],sys.argv[2],json.load(open(sys.argv[3]))
zi=zipfile.ZipFile(src)
raw={it.filename: subprocess.run(['unzip','-p',src,it.filename],capture_output=True).stdout for it in zi.infolist()}
h=raw['Contents/header.xml'].decode('utf8'); s=raw['Contents/section0.xml'].decode('utf8')
# FACEPATCH: spec['patch'] = [[언어, id, 글꼴, 유형]] 로 글꼴 칸 바꾸기
for lang,fid,face,typ in spec.get('patch',[]):
  m=re.search(r'<hh:fontface lang="'+lang+r'".*?</hh:fontface>',h,re.S); blk=m[0]
  blk2=re.sub(r'<hh:font id="'+str(fid)+r'" face="[^"]*" type="\w+"', f'<hh:font id="{fid}" face="{face}" type="{typ}"', blk)
  h=h.replace(blk,blk2)
base=re.search(r'<hh:charPr id="10" .*?</hh:charPr>',h,re.S)[0]
ids=[int(x) for x in re.findall(r'<hh:charPr id="(\d+)"',h)]; nid=max(ids)+1
new=[]; rows=[]
import itertools
for lf,hg,sz,b,sp,ra,sc in itertools.product(spec['latin'],spec.get('hangulL',[spec.get('hangul',4)]),spec['sizes'],spec['bold'],spec.get('spacing',[0]),spec.get('ratio',[100]),spec.get('script',[''])):
    if True:
      cp=base.replace('id="10"',f'id="{nid}"',1); cp=re.sub(r'height="\d+"',f'height="{sz}"',cp,1)
      cp=re.sub(r'<hh:spacing [^>]*/>',f'<hh:spacing hangul="{sp}" latin="{sp}" hanja="{sp}" japanese="{sp}" other="{sp}" symbol="{sp}" user="{sp}"/>',cp)
      cp=re.sub(r'<hh:ratio [^>]*/>',f'<hh:ratio hangul="{ra}" latin="{ra}" hanja="{ra}" japanese="{ra}" other="{ra}" symbol="{ra}" user="{ra}"/>',cp)
      cp=re.sub(r'<hh:fontRef [^>]*/>',f'<hh:fontRef hangul="{hg}" latin="{lf}" hanja="{hg}" japanese="{hg}" other="{hg}" symbol="{hg}" user="{hg}"/>',cp)
      cp=cp.replace('<hh:bold/>','')
      if b: cp=cp.replace('<hh:underline','<hh:bold/><hh:underline',1)
      cp=cp.replace('<hh:supscript/>','').replace('<hh:subscript/>','')
      if sc: cp=cp.replace('<hh:underline',f'<hh:{sc}/><hh:underline',1)
      new.append(cp); rows.append([nid,lf,sz,b,hg,sp,ra,sc]); nid+=1
h=h.replace('</hh:charProperties>',''.join(new)+'</hh:charProperties>')
h=re.sub(r'(<hh:charProperties itemCnt=")(\d+)"',lambda m: m[1]+str(int(m[2])+len(new))+'"',h)
i=s.find('<hp:p '); e=s.find('</hp:p>',i)+7; first=s[i:e]
first=re.sub(r'<hp:t>[^<]*</hp:t>','<hp:t/>',first); first=re.sub(r'<hp:linesegarray>.*?</hp:linesegarray>','',first,flags=re.S)
body=''; prow=[]
for r in rows:
  for ch in spec['chars']:
    prow.append(r+[ch]); body+=f'<hp:p id="0" paraPrIDRef="{spec.get("pp","5")}" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="{r[0]}"><hp:t>{escape(ch*spec.get("n",150))}</hp:t></hp:run></hp:p>'
s2=s[:i]+first+body+'</hs:sec>'
zo=zipfile.ZipFile(out,'w')
for it in zi.infolist():
  d=raw[it.filename]
  if it.filename=='Contents/section0.xml': d=s2.encode('utf8')
  elif it.filename=='Contents/header.xml': d=h.encode('utf8')
  elif re.match(r'Contents/section[1-9]',it.filename): continue
  zo.writestr(it.filename,d,compress_type=zipfile.ZIP_STORED if it.filename=='mimetype' else zipfile.ZIP_DEFLATED)
zo.close(); json.dump(prow,open(out+'.rows.json','w'),ensure_ascii=False); print(len(prow))
