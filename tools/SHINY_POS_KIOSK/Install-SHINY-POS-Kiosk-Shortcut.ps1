param(
    [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)

$ErrorActionPreference = "Stop"

$Launcher = Join-Path $ProjectRoot "tools\SHINY_POS_KIOSK\Start-SHINY-POS-Kiosk.ps1"
if (!(Test-Path $Launcher)) {
    throw "No se encontró: $Launcher"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Shiny POS Kiosk.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.Description = "Shiny POS - Edge Kiosk"
$Shortcut.Save()

Write-Host "Acceso directo creado:" -ForegroundColor Green
Write-Host $ShortcutPath
