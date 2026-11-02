# 짝 PDF 의 쪽별 그림 bbox → json (경로들을 인자로)
import sys, json, pymupdf
pymupdf.TOOLS.mupdf_display_errors(False)
out = {}
for p in sys.argv[2:]:
    try: d = pymupdf.open(p)
    except Exception: continue
    out[p] = [[[round(v, 2) for v in im["bbox"]] for im in pg.get_image_info()] for pg in d]
json.dump(out, open(sys.argv[1], "w"))
