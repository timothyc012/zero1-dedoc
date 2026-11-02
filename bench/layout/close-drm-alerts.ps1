param([int]$Seconds = 0)
# 문서보안 에이전트(SDSEnc)의 알림 창을 닫는다(WM_CLOSE) — 이 PC 에서 한글이 HWPX/HWP 로 저장하면 "범주 정보를 찾을 수 없습니다" 알림을 띄우고
# 확인할 때까지 저장이 멈춘다(PDF 저장은 해당 없음). 닫으면 저장이 그대로 끝나고 파일은 암호화되지 않는다. Seconds>0 이면 그동안 1초마다 반복
Add-Type @'
using System; using System.Runtime.InteropServices;
public static class W { [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l); }
'@
$end = (Get-Date).AddSeconds($Seconds); $n = 0
do {
  Get-Process SDSEnc -EA 0 | ? { $_.MainWindowHandle -ne [IntPtr]::Zero } | % { [W]::PostMessage($_.MainWindowHandle, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null; $n++ }
  if ($Seconds -gt 0) { Start-Sleep 1 }
} while ((Get-Date) -lt $end)
"closed $n"
