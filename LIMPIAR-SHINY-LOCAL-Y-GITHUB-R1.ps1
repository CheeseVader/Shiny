param(
    [string]$Repo = "C:\Users\igarcia\Videos\Shiny",
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Banner($t) {
    Write-Host ""
    Write-Host "====================================================================" -ForegroundColor Cyan
    Write-Host " $t" -ForegroundColor Cyan
    Write-Host "====================================================================" -ForegroundColor Cyan
}

function Step($t) {
    Write-Host ""
    Write-Host "==> $t" -ForegroundColor Yellow
}

function Ok($t) {
    Write-Host "[OK] $t" -ForegroundColor Green
}

function Warn($t) {
    Write-Host "[AVISO] $t" -ForegroundColor DarkYellow
}

Banner "SHINY - LIMPIEZA CONTROLADA LOCAL + GITHUB R1"

$Repo = (Resolve-Path $Repo).Path
Set-Location $Repo

if (-not (Test-Path ".git")) {
    throw "La ruta no parece ser un repositorio Git: $Repo"
}

# -------------------------------------------------------------------
# 1. Validar que lo esencial exista ANTES de tocar nada
# -------------------------------------------------------------------
Step "Validando estructura esencial"

$Required = @(
    "backend",
    "frontend",
    "database",
    "scripts",
    "services",
    "kiosk",
    "package.json",
    "package-lock.json",
    ".gitignore"
)

$Missing = @()
foreach ($item in $Required) {
    if (-not (Test-Path $item)) {
        $Missing += $item
    }
}

if ($Missing.Count -gt 0) {
    throw "Faltan elementos esenciales. NO se limpia nada. Faltantes: $($Missing -join ', ')"
}

Ok "Estructura esencial presente"

# -------------------------------------------------------------------
# 2. Mostrar remoto y estado actual
# -------------------------------------------------------------------
Step "Repositorio y remoto"
git remote -v
git status --short

# -------------------------------------------------------------------
# 3. Definir SOLO basura conocida.
#    IMPORTANTE: NO eliminamos .shiny-cloudflare-autostart.
# -------------------------------------------------------------------
$GarbageDirectoriesExact = @(
    "node_modules",
    "runtime-logs",
    "release-output"
)

$GarbageNamePatterns = @(
    ".shiny-*-backup-*",
    ".shiny-*-prepublish-*",
    "*.bak",
    "*.bak-*",
    "*.backup",
    "*.backup-*",
    "*.tmp",
    "*.temp",
    "*.log"
)

# Archivos secretos/locales que NO deben ir a GitHub.
# Se conservan localmente salvo que el usuario decida eliminarlos aparte.
$SecretPatterns = @(
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.*.local",
    "updater.env"
)

# -------------------------------------------------------------------
# 4. Crear cuarentena FUERA del repo.
#    Así la limpieza local es reversible.
# -------------------------------------------------------------------
$Parent = Split-Path $Repo -Parent
$Stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$Quarantine = Join-Path $Parent ("SHINY-CUARENTENA-" + $Stamp)

Step "Preparando cuarentena local"
New-Item -ItemType Directory -Force -Path $Quarantine | Out-Null
Ok "Cuarentena: $Quarantine"

# -------------------------------------------------------------------
# 5. Construir lista de basura encontrada
# -------------------------------------------------------------------
Step "Detectando basura"

$Candidates = New-Object System.Collections.Generic.List[string]

foreach ($d in $GarbageDirectoriesExact) {
    $p = Join-Path $Repo $d
    if (Test-Path $p) {
        $Candidates.Add($p)
    }
}

$rootItems = Get-ChildItem -LiteralPath $Repo -Force
foreach ($pattern in $GarbageNamePatterns) {
    foreach ($i in ($rootItems | Where-Object { $_.Name -like $pattern })) {
        if (-not $Candidates.Contains($i.FullName)) {
            $Candidates.Add($i.FullName)
        }
    }
}

if ($Candidates.Count -eq 0) {
    Ok "No se encontró basura local con los patrones definidos"
} else {
    Write-Host ""
    Write-Host "Se moverán FUERA del repo a cuarentena:" -ForegroundColor Magenta
    foreach ($c in $Candidates) {
        Write-Host "  - $(Split-Path $c -Leaf)"
    }
}

# -------------------------------------------------------------------
# 6. Asegurar .gitignore
# -------------------------------------------------------------------
Step "Actualizando .gitignore"

$IgnoreBlock = @'

# ============================================================
# SHINY - artefactos locales / temporales / secretos
# ============================================================

# Dependencias
node_modules/

# Salidas generadas
runtime-logs/
release-output/
*.log
*.tmp
*.temp

# Backups / prepublish
.shiny-*-backup-*
.shiny-*-prepublish-*
*.bak
*.bak-*
*.backup
*.backup-*

# Entorno local / secretos
.env
.env.local
.env.production
.env.development
.env.*.local
updater.env

# SO / editor
.DS_Store
Thumbs.db
desktop.ini
.vscode/
.idea/
'@

$gitignore = Join-Path $Repo ".gitignore"
$currentIgnore = Get-Content $gitignore -Raw -ErrorAction SilentlyContinue
if ($null -eq $currentIgnore) { $currentIgnore = "" }

$marker = "# SHINY - artefactos locales / temporales / secretos"
if ($currentIgnore -notmatch [regex]::Escape($marker)) {
    Add-Content -LiteralPath $gitignore -Value $IgnoreBlock -Encoding UTF8
    Ok ".gitignore actualizado"
} else {
    Ok ".gitignore ya contiene el bloque de limpieza"
}

# -------------------------------------------------------------------
# 7. Confirmación ÚNICA
# -------------------------------------------------------------------
Write-Host ""
Write-Host "La siguiente operación hará DOS cosas:" -ForegroundColor Cyan
Write-Host "  1) moverá basura local a: $Quarantine"
Write-Host "  2) registrará esas eliminaciones en Git para borrarlas también de GitHub"
Write-Host ""
$answer = Read-Host "Escribe LIMPIAR para continuar"

if ($answer -ne "LIMPIAR") {
    Warn "Cancelado. No se movió ni publicó nada."
    exit 0
}

# -------------------------------------------------------------------
# 8. Mover basura local a cuarentena
# -------------------------------------------------------------------
Step "Purgando localmente hacia cuarentena"

foreach ($src in $Candidates) {
    if (-not (Test-Path $src)) { continue }

    $name = Split-Path $src -Leaf
    $dst = Join-Path $Quarantine $name

    if (Test-Path $dst) {
        $dst = Join-Path $Quarantine ($name + "-" + (Get-Date -Format "HHmmssfff"))
    }

    Move-Item -LiteralPath $src -Destination $dst
    Write-Host "  movido: $name"
}

Ok "Limpieza local terminada sin borrar permanentemente"

# -------------------------------------------------------------------
# 9. Dejar fuera del índice secretos que ya hubieran sido trackeados.
#    NO borra la copia local de secretos.
# -------------------------------------------------------------------
Step "Sacando secretos/locales del índice Git si estaban rastreados"

foreach ($pattern in $SecretPatterns) {
    $tracked = git ls-files -- $pattern 2>$null
    foreach ($f in $tracked) {
        if ($f) {
            git rm --cached --ignore-unmatch -- "$f" | Out-Null
            Write-Host "  fuera de Git, conservado localmente: $f"
        }
    }
}

# -------------------------------------------------------------------
# 10. Registrar eliminaciones de basura y .gitignore
# -------------------------------------------------------------------
Step "Preparando cambios Git"
git add -A

# -------------------------------------------------------------------
# 11. Protección: jamás permitir node_modules o backups staged
# -------------------------------------------------------------------
Step "Validando que GitHub quede limpio"

$badTracked = @()

$trackedAll = git ls-files
foreach ($f in $trackedAll) {
    if (
        $f -match '(^|/)node_modules/' -or
        $f -match '(^|/)runtime-logs/' -or
        $f -match '(^|/)release-output/' -or
        $f -match '(^|/)\.shiny-.*-backup-' -or
        $f -match '(^|/)\.shiny-.*-prepublish-' -or
        $f -match '(^|/)\.env$' -or
        $f -match '(^|/)\.env\.(local|production|development)$' -or
        $f -match '(^|/)updater\.env$'
    ) {
        $badTracked += $f
    }
}

if ($badTracked.Count -gt 0) {
    Write-Host ""
    Write-Host "Todavía existen archivos prohibidos rastreados:" -ForegroundColor Red
    $badTracked | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "Se cancela antes del commit para no publicar basura o secretos."
}

Ok "No quedan node_modules, backups, logs ni secretos rastreados"

# -------------------------------------------------------------------
# 12. Protección: confirmar esenciales todavía presentes
# -------------------------------------------------------------------
foreach ($item in $Required) {
    if (-not (Test-Path $item)) {
        throw "PROTECCION: desapareció un elemento esencial durante limpieza: $item"
    }
}

Ok "Los componentes esenciales siguen intactos"

# -------------------------------------------------------------------
# 13. Resumen exacto antes del commit
# -------------------------------------------------------------------
Step "Cambios que se publicarán"
git status --short

$changes = git status --porcelain
if (-not $changes) {
    Warn "No hay cambios para commit."
    exit 0
}

# -------------------------------------------------------------------
# 14. Commit
# -------------------------------------------------------------------
Step "Creando commit de limpieza"
git commit -m "chore: purge local artifacts backups logs and secrets from repo"
Ok "Commit creado"

# -------------------------------------------------------------------
# 15. Push
# -------------------------------------------------------------------
if ($NoPush) {
    Warn "NoPush activado. El commit quedó local y NO se envió a GitHub."
} else {
    Step "Publicando limpieza en GitHub"
    git push
    Ok "GitHub actualizado"
}

# -------------------------------------------------------------------
# 16. Resultado final
# -------------------------------------------------------------------
Banner "LIMPIEZA COMPLETADA"

Write-Host "Repo:        $Repo"
Write-Host "Cuarentena:  $Quarantine"
Write-Host ""
Write-Host "Conservado expresamente:" -ForegroundColor Green
Write-Host "  - backend"
Write-Host "  - frontend"
Write-Host "  - database"
Write-Host "  - scripts"
Write-Host "  - services"
Write-Host "  - kiosk"
Write-Host "  - tools (si existe)"
Write-Host "  - docs (si existe)"
Write-Host "  - .shiny-cloudflare-autostart (NO se toca)"
Write-Host "  - archivos .env locales (NO se borran; solo se excluyen de Git)"
Write-Host ""
Write-Host "Si después de probar una clonación limpia todo funciona,"
Write-Host "puedes borrar manualmente la carpeta de cuarentena."
