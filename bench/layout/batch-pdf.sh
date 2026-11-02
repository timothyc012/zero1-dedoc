#!/usr/bin/env bash
# 폴더의 *.hwpx → 한글 COM 으로 PDF(기본) 또는 FORMAT=HWPX(재조판 저장), 문서마다 한글을 새로 띄운다(한 세션에서 이어 열면 멈춘다).
# 출력은 OUT 폴더(기본 입력 폴더)에 같은 이름(.pdf / .hwpx). 이미 있으면 건너뛰고, 문서당 ${T:-180}초 넘으면 창 없는 Hwp 만 정리한다.
# HWPX 저장 중에는 close-drm-alerts.ps1 를 곁에 돌린다. 결과 줄은 $OUT/_batch.log
D="$1"; FMT="${FORMAT:-PDF}"; OUTD="${OUT:-$D}"; HERE="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$OUTD"
ext=$(echo "$FMT" | tr 'A-Z' 'a-z')
if [ "$FMT" != PDF ]; then powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/layout/close-drm-alerts.ps1")" -Seconds 86400 >/dev/null 2>&1 & CLOSER=$!; trap 'kill $CLOSER 2>/dev/null' EXIT; fi
for f in "$D"/*.hwpx; do
  o="$OUTD/$(basename "${f%.*}").$ext"; [ -f "$o" ] && continue
  r=$(timeout "${T:-180}" powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/hangul-com-pdf.ps1")" -Src "$(cygpath -w "$f")" -Out "$(cygpath -w "$o")" -Format "$FMT" | tr -d '\r')
  [ -z "$r" ] && { r="TIMEOUT"; powershell -NoProfile -c "Get-Process Hwp -EA 0 | ? { -not \$_.MainWindowTitle } | Stop-Process -Force"; }
  echo "$(basename "$f") $r" | tee -a "$OUTD/_batch.log"
done
