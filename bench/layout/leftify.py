# 사용: python leftify.py in.hwpx out.hwpx — 윈도에서 PDF 로 찍으면 늘임 없는 줄의 글자 원점 차이가 한컴 글자 폭
# 사본: lineseg 지우고 문단 정렬을 모두 LEFT 로 — 늘임 없는 줄이라 PDF 글자 원점 차이가 한컴 글자 폭
import sys, re, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as o:
    for info in z.infolist():
        b = z.read(info.filename)
        if re.match(r'Contents/section\d+\.xml$', info.filename):
            b = re.sub(rb'<hp:linesegarray>.*?</hp:linesegarray>', b'', b, flags=re.S)
        if info.filename == 'Contents/header.xml':
            b = re.sub(rb'horizontal="(JUSTIFY|DISTRIBUTE|DISTRIBUTE_SPACE|CENTER|RIGHT)"', b'horizontal="LEFT"', b)
        o.writestr(info, b, compress_type=zipfile.ZIP_STORED if info.filename == 'mimetype' else zipfile.ZIP_DEFLATED)
