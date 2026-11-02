# 윈도 사용자 단위 글꼴 설치(관리자 불필요): 복사 + HKCU 등록 + AddFontResource + WM_FONTCHANGE — 한글이 새로 뜰 때 바로 인식
# 사용: python install-fonts.py 기준폴더 목록.txt(기준폴더 기준 상대 경로, 한 줄에 하나)
import sys, os, shutil, winreg, ctypes
from fontTools.ttLib import TTFont
base, lst = sys.argv[1], sys.argv[2]
dst = os.path.join(os.environ['LOCALAPPDATA'], 'Microsoft', 'Windows', 'Fonts'); os.makedirs(dst, exist_ok=True)
k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts', 0, winreg.KEY_ALL_ACCESS)
for rel in open(lst, encoding='utf8').read().split('\n'):
    if not rel.strip(): continue
    src = os.path.normpath(os.path.join(base, rel)); to = os.path.join(dst, os.path.basename(src))
    shutil.copy2(src, to)
    f = TTFont(to, lazy=True)
    full = next((r.toUnicode() for r in f['name'].names if r.nameID == 4 and r.langID == 0x412), None) or f['name'].getDebugName(4)
    winreg.SetValueEx(k, f"{full} ({'OpenType' if to.lower().endswith('.otf') else 'TrueType'})", 0, winreg.REG_SZ, to)
    print(ctypes.windll.gdi32.AddFontResourceW(to), full)
ctypes.windll.user32.SendMessageTimeoutW(0xffff, 0x1D, 0, 0, 2, 2000, ctypes.byref(ctypes.c_ulong()))
