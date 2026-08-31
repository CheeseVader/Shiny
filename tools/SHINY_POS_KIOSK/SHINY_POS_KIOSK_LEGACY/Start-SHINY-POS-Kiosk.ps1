param(
    [string]$Url = "http://127.0.0.1:5173/login?kiosk=1",
    [ValidateSet("AUTO","CHROME","EDGE")]
    [string]$Browser = "AUTO"
)

$ErrorActionPreference = "Stop"

$chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$edgeCandidates = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$edge   = $edgeCandidates   | Where-Object { Test-Path $_ } | Select-Object -First 1

switch ($Browser.ToUpperInvariant()) {
    "CHROME" {
        if (-not $chrome) { throw "Google Chrome no fue encontrado." }
        $selected=$chrome; $selectedName="Google Chrome"
    }
    "EDGE" {
        if (-not $edge) { throw "Microsoft Edge no fue encontrado." }
        $selected=$edge; $selectedName="Microsoft Edge"
    }
    default {
        if ($chrome) { $selected=$chrome; $selectedName="Google Chrome" }
        elseif ($edge) { $selected=$edge; $selectedName="Microsoft Edge" }
        else { throw "No se encontró Google Chrome ni Microsoft Edge." }
    }
}

$profileRoot = Join-Path $env:LOCALAPPDATA "Shiny\POS_KIOSK"
$profileDir = if ($selectedName -eq "Google Chrome") {
    Join-Path $profileRoot "Chrome"
} else {
    Join-Path $profileRoot "Edge"
}
New-Item -ItemType Directory -Path $profileDir -Force | Out-Null

Write-Host "Shiny POS KIOSK R11" -ForegroundColor Cyan
Write-Host "Navegador: $selectedName" -ForegroundColor Green
Write-Host "URL: $Url"
Write-Host "Perfil: $profileDir"

$args=@(
    "--user-data-dir=$profileDir",
    "--kiosk",
    $Url,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble"
)
if($selectedName -eq "Microsoft Edge"){
    $args += "--edge-kiosk-type=fullscreen"
}

Start-Process -FilePath $selected -ArgumentList $args
