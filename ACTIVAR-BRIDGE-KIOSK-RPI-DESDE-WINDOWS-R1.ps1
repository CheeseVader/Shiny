param(
  [Parameter(Mandatory=$true)][string]$RpiHost,
  [Parameter(Mandatory=$true)][string]$RpiUser,
  [string]$ProjectRoot="C:\Users\igarcia\Videos\Shiny"
)
$ErrorActionPreference="Stop"
$src=Join-Path $ProjectRoot "tools\INSTALAR-SHINY-RPI-BRIDGE-R1.sh"
if(!(Test-Path $src)){throw "No existe $src"}
Write-Host "Copiando bootstrap a $RpiUser@$RpiHost..." -ForegroundColor Cyan
scp $src "${RpiUser}@${RpiHost}:/tmp/INSTALAR-SHINY-RPI-BRIDGE-R1.sh"
if($LASTEXITCODE -ne 0){throw "scp fallo"}
Write-Host "Instalando puente seguro y kiosk global..." -ForegroundColor Cyan
ssh -t "${RpiUser}@${RpiHost}" "sudo bash /tmp/INSTALAR-SHINY-RPI-BRIDGE-R1.sh && rm -f /tmp/INSTALAR-SHINY-RPI-BRIDGE-R1.sh"
if($LASTEXITCODE -ne 0){throw "ssh/bootstrap fallo"}
Write-Host "[OK] Puente y kiosk global instalados." -ForegroundColor Green