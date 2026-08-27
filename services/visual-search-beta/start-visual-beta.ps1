param(
  [int]$Port = 8011,
  [switch]$SkipDependencyInstall
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-PortListening {
    param([int]$Port)

    try {
        $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
            Select-Object -First 1
        return $null -ne $listener
    }
    catch {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
            $ok = $iar.AsyncWaitHandle.WaitOne(300)
            if ($ok -and $client.Connected) {
                $client.EndConnect($iar)
                $client.Close()
                return $true
            }
            $client.Close()
        }
        catch {}
        return $false
    }
}

if (Test-PortListening -Port $Port) {
    Write-Host "GMX Visual Search Beta ya esta activo en http://127.0.0.1:$Port" -ForegroundColor Green
    exit 0
}

if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    throw "PYTHON_NOT_FOUND"
}

Push-Location $here
try {
    if (!(Test-Path ".venv")) {
        Write-Host "Creando entorno virtual de Visual Search..." -ForegroundColor Yellow
        python -m venv .venv
    }

    $py = Join-Path $here ".venv\Scripts\python.exe"
    if (!(Test-Path $py)) {
        throw "VENV_PYTHON_NOT_FOUND"
    }

    if (-not $SkipDependencyInstall) {
        $marker = Join-Path $here ".venv\.gmx-requirements-ready"
        $requirements = Join-Path $here "requirements.txt"

        $mustInstall = -not (Test-Path $marker)

        if ((Test-Path $requirements) -and (Test-Path $marker)) {
            $mustInstall = (Get-Item $requirements).LastWriteTimeUtc -gt (Get-Item $marker).LastWriteTimeUtc
        }

        if ($mustInstall) {
            Write-Host "Verificando dependencias de Visual Search..." -ForegroundColor Yellow
            & $py -m pip install -r requirements.txt
            if ($LASTEXITCODE -ne 0) {
                throw "PIP_INSTALL_FAILED"
            }
            New-Item -ItemType File -Path $marker -Force | Out-Null
        }
    }

    if (Test-PortListening -Port $Port) {
        Write-Host "GMX Visual Search Beta ya fue iniciado por otra instancia." -ForegroundColor Green
        exit 0
    }

    Write-Host ""
    Write-Host "GMX Visual Search Beta iniciando en http://127.0.0.1:$Port" -ForegroundColor Cyan
    Write-Host "Integrado al arranque principal de GMX." -ForegroundColor DarkGray

    & $py -m uvicorn service:app --host 127.0.0.1 --port $Port
}
finally {
    Pop-Location
}