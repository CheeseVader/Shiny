$ErrorActionPreference = "SilentlyContinue"

Write-Host "================ SUMMARY START ================" -ForegroundColor Cyan

$conn = Get-NetTCPConnection -LocalPort 5173 -State Listen
Write-Host "VITE_5173_LISTEN=$([bool]$conn)"

$all = Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq "chrome.exe" -or $_.Name -eq "msedge.exe") -and
    $_.CommandLine -match "--kiosk" -and
    $_.CommandLine -match "GMX\\POS_KIOSK"
}

$k = $all | Select-Object -First 1

Write-Host "KIOSK_INSTANCE_FOUND=$([bool]$k)"
if ($k) {
    $browser = if ($k.Name -eq "chrome.exe") { "Google Chrome" } else { "Microsoft Edge" }
    Write-Host "ACTIVE_KIOSK_BROWSER=$browser"
    Write-Host "KIOSK_PID=$($k.ProcessId)"
    Write-Host "HAS_KIOSK_FLAG=$($k.CommandLine -match '--kiosk')"
    Write-Host "HAS_DEDICATED_PROFILE=$($k.CommandLine -match 'GMX\\POS_KIOSK')"
    Write-Host "KIOSK_COMMAND=$($k.CommandLine)"
} else {
    Write-Host "ACTIVE_KIOSK_BROWSER=NONE"
    Write-Host "HAS_KIOSK_FLAG=False"
    Write-Host "HAS_DEDICATED_PROFILE=False"
}

Write-Host "================ SUMMARY END ==================" -ForegroundColor Cyan
