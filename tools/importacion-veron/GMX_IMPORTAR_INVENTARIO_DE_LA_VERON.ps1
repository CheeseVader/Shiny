param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$Workbook = ".\GMX_INVENTARIO_LISTO_IMPORTACION_DE_LA_VERON.xlsx"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "GMX - IMPORTACION CONTROLADA - DE LA VERON" -ForegroundColor Cyan
Write-Host "Sucursal esperada: SUC-000009 / de la veron"
Write-Host ""

# ============================================================
# 1. VALIDAR EXCEL
# ============================================================

if (!(Test-Path $Workbook)) {
    throw "No se encontro el Excel: $Workbook"
}

# ============================================================
# 2. LOGIN SUPERADMIN
# ============================================================

$Email = Read-Host "Correo SUPERADMIN"
$SecurePassword = Read-Host "Contrasena" -AsSecureString

$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)

try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($BSTR)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
}

$loginBody = @{
    email    = $Email
    password = $Password
} | ConvertTo-Json

$login = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/auth/login" `
    -ContentType "application/json" `
    -Body $loginBody

if (!$login.success -or !$login.data.token) {
    throw "LOGIN_FAILED"
}

$Token = $login.data.token

$Headers = @{
    Authorization = "Bearer $Token"
}

# ============================================================
# 3. VALIDAR SUCURSAL
# ============================================================

$branches = Invoke-RestMethod `
    -Method GET `
    -Uri "$BaseUrl/api/v1/branches?includeInactive=true" `
    -Headers $Headers

$branch = @($branches.data) |
    Where-Object {
        $_.id_sucursal -eq "SUC-000009"
    } |
    Select-Object -First 1

if (!$branch) {
    throw "BRANCH_SUC-000009_NOT_FOUND"
}

if ($branch.nombre_sucursal -ne "de la veron") {
    throw "BRANCH_NAME_MISMATCH: esperado 'de la veron', encontrado '$($branch.nombre_sucursal)'"
}

Write-Host ""
Write-Host "Sucursal validada: $($branch.id_sucursal) / $($branch.nombre_sucursal)" -ForegroundColor Green

# ============================================================
# 4. PREPARAR EXCEL COMO DATA URL
# ============================================================

$ResolvedWorkbook = Resolve-Path $Workbook
$Bytes = [IO.File]::ReadAllBytes($ResolvedWorkbook)
$Base64 = [Convert]::ToBase64String($Bytes)

$FilePayload = @{
    name = [IO.Path]::GetFileName($Workbook)
    mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    data = "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,$Base64"
}

$payload = @{
    file = $FilePayload
} | ConvertTo-Json -Depth 10

# ============================================================
# 5. CONFIRMACION
# ============================================================

Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "- Se importara SOLO la hoja Productos."
Write-Host "- TCG_Pendientes NO se importa."
Write-Host "- Precio inicial: 1.00 MXN."
Write-Host "- Costo inicial: 1.00 MXN."
Write-Host "- Sucursal: de la veron / SUC-000009."
Write-Host ""

$confirm = Read-Host "Escribe IMPORTAR para continuar"

if ($confirm -ne "IMPORTAR") {
    Write-Host ""
    Write-Host "Importacion cancelada. No se modifico la base de datos." -ForegroundColor Yellow
    exit 0
}

# ============================================================
# 6. IMPORTAR
# ENDPOINT CORRECTO DE GMX:
# POST /api/v1/products/import-excel
# ============================================================

$result = Invoke-RestMethod `
    -Method POST `
    -Uri "$BaseUrl/api/v1/products/import-excel" `
    -Headers $Headers `
    -ContentType "application/json" `
    -Body $payload

# ============================================================
# 7. SUMMARY
# ============================================================

$data = $result.data

Write-Host ""
Write-Host "================ SUMMARY START ================" -ForegroundColor Magenta

Write-Host "SUCCESS=$($result.success)"
Write-Host "BASE_URL=$BaseUrl"
Write-Host "BRANCH_ID=SUC-000009"
Write-Host "BRANCH_NAME=de la veron"

if ($data) {
    Write-Host "READ=$($data.read)"
    Write-Host "CREATED=$($data.created)"
    Write-Host "UPDATED=$($data.updated)"

    $errors = @($data.errors)

    Write-Host "ERRORS=$($errors.Count)"

    foreach ($e in $errors) {
        Write-Host "ERROR_ROW=$($e.row) SKU=$($e.sku) ERROR=$($e.error)"
    }
}
else {
    Write-Host "READ=UNKNOWN"
    Write-Host "CREATED=UNKNOWN"
    Write-Host "UPDATED=UNKNOWN"
    Write-Host "ERRORS=UNKNOWN"
}

Write-Host "================ SUMMARY END ==================" -ForegroundColor Magenta