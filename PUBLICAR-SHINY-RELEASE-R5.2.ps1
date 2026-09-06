param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [string]$ReleaseRepo = 'CheeseVader/Shiny-Release',
    [string]$BaseVersion = '',
    [switch]$RunMigrations
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

function Write-Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text)   { Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "[AVISO] $Text" -ForegroundColor Yellow }
function Fail([string]$Text)       { throw $Text }

function Normalize-RelPath([string]$Path) {
    return ($Path -replace '\\','/').TrimStart('./')
}

# Rutas que pueden existir en el paquete completo para una instalación NUEVA,
# pero que NUNCA se declaran en files[]/delete[] de una actualización incremental.
$LocalPreserveExact = @(
    'backend/.env',
    '.env',
    'brand.config.json',
    'frontend/public/brand.config.json'
)

$LocalPreservePrefixes = @(
    'backend/uploads',
    'uploads',
    'user-data',
    'data',
    'config-local',
    'local-data',
    'frontend/public/uploads',
    'frontend/public/images'
)

# Rutas que ni siquiera deben empaquetarse.
$PackageExcludePrefixes = @(
    'node_modules',
    'backend/node_modules',
    'frontend/node_modules',
    'release-output',
    'BACKUP-PWA-20260902-125029',
    'SHINY-RPI-MANAGED-R1',
    '.git'
)

function Test-PathUnder([string]$RelativePath, [string[]]$Prefixes) {
    $p = Normalize-RelPath $RelativePath
    foreach ($root in $Prefixes) {
        $r = Normalize-RelPath $root
        if ($p -eq $r -or $p.StartsWith($r + '/', [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

function Test-LocalPreserved([string]$RelativePath) {
    $p = Normalize-RelPath $RelativePath
    foreach ($exact in $LocalPreserveExact) {
        if ($p.Equals((Normalize-RelPath $exact), [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return (Test-PathUnder $p $LocalPreservePrefixes)
}

function Test-PackageExcluded([string]$RelativePath) {
    return (Test-PathUnder $RelativePath $PackageExcludePrefixes)
}

function Get-GitHubCredential {
    $credentialRequest = "protocol=https`nhost=github.com`n`n"
    $credentialResponse = $credentialRequest | & git credential fill 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $credentialResponse) {
        Fail 'No pude obtener las credenciales de GitHub desde Git Credential Manager.'
    }

    $passwordLine = $credentialResponse | Where-Object { $_ -like 'password=*' } | Select-Object -First 1
    if (-not $passwordLine) {
        Fail 'Git Credential Manager no devolvio un token. Ejecuta primero: git ls-remote release HEAD'
    }

    return $passwordLine.Substring('password='.Length)
}

function Invoke-GitHubJson {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [Parameter(Mandatory = $true)][string]$Method,
        [object]$Body = $null,
        [Parameter(Mandatory = $true)][hashtable]$Headers
    )

    if ($null -eq $Body) {
        return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers
    }

    $json = $Body | ConvertTo-Json -Depth 30 -Compress
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $jsonBytes = $utf8.GetBytes($json)
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -ContentType 'application/json; charset=utf-8' -Body $jsonBytes
}

function Get-ReleaseByTag {
    param([string]$ApiBase, [string]$Tag, [hashtable]$Headers)
    try {
        return Invoke-GitHubJson -Uri "$ApiBase/releases/tags/$Tag" -Method 'Get' -Headers $Headers
    }
    catch {
        $status = $null
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        }
        if ($status -eq 404) { return $null }
        throw
    }
}

function Download-Asset {
    param(
        [Parameter(Mandatory = $true)][object]$Release,
        [Parameter(Mandatory = $true)][string]$AssetName,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][hashtable]$Headers
    )
    $asset = @($Release.assets | Where-Object { [string]$_.name -eq $AssetName } | Select-Object -First 1)
    if ($asset.Count -ne 1 -or -not $asset[0].url) {
        Fail "La Release $($Release.tag_name) no contiene $AssetName."
    }
    $assetHeaders = @{}
    foreach ($k in $Headers.Keys) { $assetHeaders[$k] = $Headers[$k] }
    $assetHeaders['Accept'] = 'application/octet-stream'
    Invoke-WebRequest -UseBasicParsing -Uri ([string]$asset[0].url) -Method Get -Headers $assetHeaders -OutFile $Destination
}

$Root = (Get-Location).Path
$OutputDir = Join-Path $Root 'release-output'
$PackageName = "shiny-rpi-$Version.tar.gz"
$ManifestName = "manifest-$Version.json"
$PackagePath = Join-Path $OutputDir $PackageName
$ManifestPath = Join-Path $OutputDir $ManifestName
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("shiny-release-r5-{0}-{1}" -f $Version, [Guid]::NewGuid().ToString('N'))
$Stage = Join-Path $TempRoot 'full-package'
$BaseManifestPath = Join-Path $TempRoot 'base-manifest.json'

try {
    # Crear el directorio temporal ANTES de descargar el manifest de la version base.
    # R5 original intentaba escribir base-manifest.json antes de crear $TempRoot.
    New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null

    Write-Step 'Validando repositorio local'
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fail 'Git no esta disponible en PATH.' }
    if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) { Fail 'tar.exe no esta disponible en Windows.' }

    & git rev-parse --is-inside-work-tree *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Ejecuta este script dentro del repositorio Shiny.' }

    $trackedChanges = @(& git status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) { Fail 'No pude consultar git status.' }
    if ($trackedChanges.Count -gt 0) {
        Write-Host ($trackedChanges -join "`n") -ForegroundColor Yellow
        Fail 'Hay cambios TRACKED sin commit. Haz commit antes de publicar.'
    }

    $SourceCommit = (& git rev-parse HEAD).Trim()
    $SourceShort = (& git rev-parse --short HEAD).Trim()
    $Branch = (& git branch --show-current).Trim()
    Write-Ok "Codigo fuente: $SourceShort ($Branch)"

    Write-Step 'Comprobando acceso a GitHub'
    & git ls-remote release HEAD *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'No pude acceder al remoto release.' }

    $Token = Get-GitHubCredential
    $Headers = @{
        'Accept' = 'application/vnd.github+json'
        'Authorization' = "Bearer $Token"
        'X-GitHub-Api-Version' = '2022-11-28'
        'User-Agent' = 'Shiny-RPI-Release-Publisher-R5.2'
    }
    $ApiBase = "https://api.github.com/repos/$ReleaseRepo"

    # Resolver automáticamente la versión base desde la Release anterior.
    if ([string]::IsNullOrWhiteSpace($BaseVersion)) {
        $latest = Invoke-GitHubJson -Uri "$ApiBase/releases/latest" -Method 'Get' -Headers $Headers
        $BaseVersion = ([string]$latest.tag_name).TrimStart('v')
    } else {
        $latest = Get-ReleaseByTag -ApiBase $ApiBase -Tag ("v$BaseVersion") -Headers $Headers
        if (-not $latest) { Fail "No existe la Release base v$BaseVersion." }
    }

    if ([version]$Version -le [version]$BaseVersion) {
        Fail "La nueva version $Version debe ser mayor que la base $BaseVersion."
    }

    Write-Ok "Base incremental detectada: $BaseVersion"

    $BaseManifestName = "manifest-$BaseVersion.json"
    Download-Asset -Release $latest -AssetName $BaseManifestName -Destination $BaseManifestPath -Headers $Headers
    $BaseManifest = Get-Content -LiteralPath $BaseManifestPath -Raw | ConvertFrom-Json

    # Compatibilidad de manifests:
    # - R5/R5.1: source_commit
    # - releases 1.0.12/1.0.13: source_sha
    $BaseCommit = ''
    if ($BaseManifest.PSObject.Properties.Name -contains 'source_commit') {
        $BaseCommit = [string]$BaseManifest.source_commit
    }
    if ([string]::IsNullOrWhiteSpace($BaseCommit) -and
        ($BaseManifest.PSObject.Properties.Name -contains 'source_sha')) {
        $BaseCommit = [string]$BaseManifest.source_sha
        Write-Warn "Manifest base usa source_sha; se acepta como commit Git compatible."
    }
    if ([string]::IsNullOrWhiteSpace($BaseCommit)) {
        Fail "El manifest $BaseManifestName no contiene source_commit ni source_sha."
    }

    & git cat-file -e "$BaseCommit^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Fail "El commit base $BaseCommit no existe en este repositorio local. No puedo calcular un delta seguro."
    }

    Write-Ok "Commit base: $($BaseCommit.Substring(0,[Math]::Min(7,$BaseCommit.Length)))"

    Write-Step "Calculando SOLO cambios $BaseVersion -> $Version"

    $ChangedFiles = New-Object System.Collections.Generic.List[string]
    $DeleteFiles = New-Object System.Collections.Generic.List[string]
    $SkippedProtected = New-Object System.Collections.Generic.List[string]

    $diffLines = @(& git diff --name-status --find-renames $BaseCommit $SourceCommit)
    if ($LASTEXITCODE -ne 0) { Fail 'git diff fallo.' }

    foreach ($line in $diffLines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        $parts = $line -split "`t"
        $status = $parts[0]

        if ($status -match '^R') {
            if ($parts.Count -lt 3) { Fail "Rename invalido: $line" }
            $oldRel = Normalize-RelPath $parts[1]
            $newRel = Normalize-RelPath $parts[2]

            if (Test-LocalPreserved $oldRel) { $SkippedProtected.Add("$oldRel (delete)") }
            elseif (-not (Test-PackageExcluded $oldRel) -and $oldRel -ne 'VERSION') { $DeleteFiles.Add($oldRel) }

            if (Test-LocalPreserved $newRel) { $SkippedProtected.Add("$newRel (write)") }
            elseif (-not (Test-PackageExcluded $newRel) -and $newRel -ne 'VERSION') { $ChangedFiles.Add($newRel) }
            continue
        }

        if ($parts.Count -lt 2) { continue }
        $rel = Normalize-RelPath $parts[1]

        if ($rel -eq 'VERSION' -or (Test-PackageExcluded $rel)) { continue }

        if (Test-LocalPreserved $rel) {
            $SkippedProtected.Add("$rel ($status)")
            continue
        }

        if ($status -eq 'D') {
            $DeleteFiles.Add($rel)
        }
        elseif ($status -match '^[AMTC]') {
            $ChangedFiles.Add($rel)
        }
    }

    $ChangedFiles = @($ChangedFiles | Sort-Object -Unique)
    $DeleteFiles = @($DeleteFiles | Sort-Object -Unique)
    $SkippedProtected = @($SkippedProtected | Sort-Object -Unique)

    if (($ChangedFiles.Count + $DeleteFiles.Count) -eq 0) {
        if ($SkippedProtected.Count -gt 0) {
            Write-Warn 'Solo cambiaron archivos locales protegidos; no se publicara una actualizacion.'
            foreach ($p in $SkippedProtected) { Write-Host "  = PRESERVADO: $p" -ForegroundColor Yellow }
        }
        Fail "No hay cambios desplegables entre $BaseVersion y $Version."
    }

    if ($SkippedProtected.Count -gt 0) {
        Write-Host "`nCambios que NO se enviaran porque pertenecen a configuracion local:" -ForegroundColor Yellow
        foreach ($p in $SkippedProtected) { Write-Host "  = $p" -ForegroundColor Yellow }
    }

    Write-Host "`nArchivos que SI se actualizaran en la Raspberry:" -ForegroundColor White
    foreach ($rel in $ChangedFiles) { Write-Host "  + $rel" }
    foreach ($rel in $DeleteFiles) { Write-Host "  - $rel" }
    Write-Host "`nTotal write : $($ChangedFiles.Count)"
    Write-Host "Total delete: $($DeleteFiles.Count)"
    Write-Host "Base real   : $BaseVersion"

    New-Item -ItemType Directory -Force -Path $OutputDir, $Stage | Out-Null
    Remove-Item -LiteralPath $PackagePath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ManifestPath -Force -ErrorAction SilentlyContinue

    # El TAR se genera COMPLETO para que siga sirviendo a instalaciones nuevas.
    # El updater R4 SOLO copia manifest.files[] y SOLO elimina manifest.delete[].
    Write-Step 'Creando paquete completo compatible con instalaciones nuevas'
    $TrackedFiles = @(& git ls-files) | ForEach-Object { Normalize-RelPath $_ } | Sort-Object -Unique
    foreach ($rel in $TrackedFiles) {
        if ([string]::IsNullOrWhiteSpace($rel)) { continue }
        if (Test-PackageExcluded $rel) { continue }

        $src = Join-Path $Root ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $src -PathType Leaf)) { continue }

        $dst = Join-Path $Stage ($rel -replace '/', [IO.Path]::DirectorySeparatorChar)
        $dstDir = Split-Path -Parent $dst
        if ($dstDir) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }

    # VERSION dentro del paquete completo representa esta Release.
    [System.IO.File]::WriteAllText((Join-Path $Stage 'VERSION'), $Version + "`n", (New-Object System.Text.UTF8Encoding($false)))

    Push-Location $Stage
    try {
        & tar.exe -czf $PackagePath .
        if ($LASTEXITCODE -ne 0) { Fail 'tar.exe no pudo crear el paquete.' }
    } finally { Pop-Location }

    $Sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PackagePath).Hash.ToLowerInvariant()

    $AllTouched = @($ChangedFiles + $DeleteFiles)
    $npmBackend = @($AllTouched | Where-Object { $_ -match '^backend/package(-lock)?\.json$' }).Count -gt 0
    $npmFrontend = @($AllTouched | Where-Object { $_ -match '^frontend/package(-lock)?\.json$' }).Count -gt 0
    $buildFrontend = @($AllTouched | Where-Object { $_ -like 'frontend/*' }).Count -gt 0

    $Manifest = [ordered]@{
        schema = 4
        release_mode = 'delta'
        version = $Version
        base_version = $BaseVersion
        source_commit = $SourceCommit
        base_source_commit = $BaseCommit
        sha256 = $Sha256
        files = @($ChangedFiles)
        delete = @($DeleteFiles)
        local_preserve = @($LocalPreserveExact + $LocalPreservePrefixes)
        npm_backend = [bool]$npmBackend
        npm_frontend = [bool]$npmFrontend
        build_frontend = [bool]$buildFrontend
        run_migrations = [bool]$RunMigrations
    }

    $ManifestJson = $Manifest | ConvertTo-Json -Depth 30
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, $Utf8NoBom)

    Write-Ok "Paquete: $PackagePath"
    Write-Ok "Manifest: $ManifestPath"
    Write-Ok "SHA256: $Sha256"

    Write-Step 'Validando manifest R4'
    $ManifestCheck = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
    if ($ManifestCheck.release_mode -ne 'delta') { Fail 'Manifest no es delta.' }
    if ($ManifestCheck.version -ne $Version) { Fail 'Manifest version invalida.' }
    if ($ManifestCheck.base_version -ne $BaseVersion) { Fail 'Manifest base_version invalida.' }

    foreach ($rel in @($ManifestCheck.files)) {
        if (Test-LocalPreserved ([string]$rel)) { Fail "SEGURIDAD: files[] contiene ruta local protegida: $rel" }
        $insidePackage = Join-Path $Stage (([string]$rel) -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path -LiteralPath $insidePackage -PathType Leaf)) { Fail "El paquete no contiene: $rel" }
    }
    foreach ($rel in @($ManifestCheck.delete)) {
        if (Test-LocalPreserved ([string]$rel)) { Fail "SEGURIDAD: delete[] contiene ruta local protegida: $rel" }
    }

    $VerifySha = (Get-FileHash -Algorithm SHA256 -LiteralPath $PackagePath).Hash.ToLowerInvariant()
    if ($VerifySha -ne $ManifestCheck.sha256.ToLowerInvariant()) { Fail 'SHA256 no coincide.' }
    Write-Ok 'Manifest delta valido'

    $Tag = "v$Version"
    $release = Get-ReleaseByTag -ApiBase $ApiBase -Tag $Tag -Headers $Headers
    if ($release) {
        Fail "La Release $Tag ya existe. Usa una version nueva para evitar sobrescribir una Release publicada."
    }

    $repoInfo = Invoke-GitHubJson -Uri $ApiBase -Method 'Get' -Headers $Headers
    $defaultBranch = [string]$repoInfo.default_branch
    if ([string]::IsNullOrWhiteSpace($defaultBranch)) { $defaultBranch = 'main' }

    $ReleaseBody = @"
Shiny RPi $Version

Actualizacion incremental: $BaseVersion -> $Version
Codigo fuente base: $BaseCommit
Codigo fuente nuevo: $SourceCommit
Archivos reemplazados: $($ChangedFiles.Count)
Archivos eliminados: $($DeleteFiles.Count)

El updater R4 solo aplica files[]/delete[] cuando VERSION instalada es menor.
Configuracion local del cliente se preserva.
"@

    $releaseRequest = [ordered]@{
        tag_name = $Tag
        target_commitish = $defaultBranch
        name = "Shiny RPi $Version"
        body = $ReleaseBody
        draft = $false
        prerelease = $false
    }

    Write-Step "Creando Release $Tag en $ReleaseRepo"
    $release = Invoke-GitHubJson -Uri "$ApiBase/releases" -Method 'Post' -Headers $Headers -Body $releaseRequest
    Write-Ok "Release $Tag creada"

    if (-not $release.upload_url) { Fail 'GitHub no devolvio upload_url.' }
    $UploadBase = ([string]$release.upload_url).Split('{')[0]

    foreach ($assetPath in @($PackagePath, $ManifestPath)) {
        $assetName = [IO.Path]::GetFileName($assetPath)
        $encoded = [Uri]::EscapeDataString($assetName)
        $uploadUri = ('{0}?name={1}' -f $UploadBase, $encoded)
        $localSize = (Get-Item -LiteralPath $assetPath).Length

        Write-Step "Subiendo $assetName"
        $uploaded = Invoke-RestMethod -Uri $uploadUri -Method Post -Headers $Headers -ContentType 'application/octet-stream' -InFile $assetPath
        if (-not $uploaded -or [string]$uploaded.name -ne $assetName) { Fail "GitHub no confirmo $assetName." }
        if ([int64]$uploaded.size -ne [int64]$localSize) { Fail "Tamano incorrecto para $assetName." }
        Write-Ok "$assetName subido ($localSize bytes)"
    }

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host " RELEASE $Tag PUBLICADA CORRECTAMENTE - PUBLICADOR R5.2" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
    Write-Host "Repositorio : $ReleaseRepo"
    Write-Host "Base        : $BaseVersion"
    Write-Host "Version     : $Version"
    Write-Host "Commit      : $SourceShort"
    Write-Host "Writes      : $($ChangedFiles.Count)"
    Write-Host "Deletes     : $($DeleteFiles.Count)"
    Write-Host "SHA256      : $Sha256"
    Write-Host ""
    Write-Host "La RPI con Updater R4 instalara SOLO el delta del manifest." -ForegroundColor Green
    Write-Host "Archivos locales protegidos no se restauran desde GitHub." -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $TempRoot) {
        Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
