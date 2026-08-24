param(
    [string]$ProjectRoot = "C:\Users\igarcia\Videos\GMX"
)

$ErrorActionPreference = "Stop"

$Launcher = Join-Path $ProjectRoot "tools\GMX_POS_KIOSK\Start-GMX-POS-Kiosk.ps1"
if (!(Test-Path $Launcher)) {
    throw "No se encontró: $Launcher"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "GMX POS Kiosk.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "GMX POS - Edge Kiosk"
$Shortcut.Save()

Write-Host "Acceso directo creado:" -ForegroundColor Green
Write-Host $ShortcutPath
