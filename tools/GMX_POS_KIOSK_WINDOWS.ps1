param(
  [string]$Url = "http://127.0.0.1:5173/admin/pedidos"
)

$edgeCandidates = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$edge = $edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) {
  Write-Host "Microsoft Edge no fue encontrado." -ForegroundColor Red
  exit 1
}

Start-Process -FilePath $edge -ArgumentList @(
  "--kiosk",
  $Url,
  "--edge-kiosk-type=fullscreen",
  "--no-first-run"
)
