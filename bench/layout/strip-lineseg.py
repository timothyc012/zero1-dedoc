# HWPX 사본에서 <hp:linesegarray> 를 모두 지운다 — 한컴이 열 때 줄을 처음부터 다시 나눈다(hangul-com-pdf.ps1 -Format HWPX 로 재조판 저장)
# 사용: python strip-lineseg.py 목록.txt(한 줄에 hwpx 경로) 출력폴더 → 출력폴더/NNN.hwpx + index.json(NNN → 원본 경로)
import sys, os, re, json, zipfile
paths = [l.strip() for l in open(sys.argv[1], encoding='utf8') if l.strip()]
out = sys.argv[2]; os.makedirs(out, exist_ok=True); idx = {}
for i, p in enumerate(paths):
    name = f'{i:04d}.hwpx'
    with zipfile.ZipFile(p) as z, zipfile.ZipFile(os.path.join(out, name), 'w', zipfile.ZIP_DEFLATED) as o:
        for info in z.infolist():
            b = z.read(info.filename)
            if re.match(r'Contents/section\d+\.xml$', info.filename):
                b = re.sub(rb'<hp:linesegarray>.*?</hp:linesegarray>', b'', b, flags=re.S)
            o.writestr(info, b, compress_type=zipfile.ZIP_STORED if info.filename == 'mimetype' else zipfile.ZIP_DEFLATED)
    idx[name] = p
json.dump(idx, open(os.path.join(out, 'index.json'), 'w', encoding='utf8'), ensure_ascii=False, indent=0)
print(len(idx), 'stripped')
