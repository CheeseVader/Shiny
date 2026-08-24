param(
  [int]$Port=8011
)

$ErrorActionPreference="Stop"
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$brandPath=Join-Path (Split-Path (Split-Path $here -Parent) -Parent) "brand.config.json"
$appName="TCG Store"
$visionName="TCG Store Vision"
if(Test-Path $brandPath){
  $brand=Get-Content $brandPath -Raw | ConvertFrom-Json
  if($brand.name){ $appName=[string]$brand.name }
  if($brand.visionName){ $visionName=[string]$brand.visionName } else { $visionName="$appName Vision" }
}

if(!(Get-Command python -ErrorAction SilentlyContinue)){
  throw "PYTHON_NOT_FOUND"
}

Push-Location $here
try{
  if(!(Test-Path ".venv")){
    python -m venv .venv
  }

  $py=Join-Path $here ".venv\Scripts\python.exe"
  if(!(Test-Path $py)){ throw "VENV_PYTHON_NOT_FOUND" }

  & $py -m pip install --upgrade pip
  & $py -m pip install -r requirements.txt

  Write-Host ""
  Write-Host "$visionName Beta starting on http://127.0.0.1:$Port" -ForegroundColor Cyan
  Write-Host "Keep this window open while testing the Beta module." -ForegroundColor Yellow
  & $py -m uvicorn service:app --host 127.0.0.1 --port $Port
}finally{
  Pop-Location
}
