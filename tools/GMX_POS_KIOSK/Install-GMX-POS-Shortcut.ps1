param(
    [string]$ProjectRoot = "C:\Users\igarcia\Videos\GMX"
)

$ErrorActionPreference = "Stop"

$Launcher = Join-Path $ProjectRoot "tools\GMX_POS_KIOSK\INICIAR_GMX_POS_KIOSK.cmd"
if (!(Test-Path $Launcher)) { throw "No se encontró: $Launcher" }

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "GMX POS.lnk"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Launcher
$Shortcut.WorkingDirectory = Split-Path $Launcher -Parent
$Shortcut.Description = "GMX POS - navegador kiosco dedicado"
$Shortcut.Save()

Write-Host "Acceso directo creado/actualizado:" -ForegroundColor Green
Write-Host $ShortcutPath
