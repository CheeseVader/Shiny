param(
  [string]$Root = "D:\Shiny",
  [string]$Database = "shiny_db",
  [string]$HostName = "localhost",
  [string]$User = "postgres"
)

$ErrorActionPreference="Stop"

Write-Host "Shiny 10.6.2.4.1.1 - Restauración de catálogo geográfico" -ForegroundColor Cyan
Write-Host "Buscando 042_catalogo_cp.csv dentro de $Root ..."

$cpFile = Get-ChildItem $Root -Recurse -Filter "042_catalogo_cp.csv" | Where-Object { -not $_.PSIsContainer } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if(-not $cpFile){
  throw "No se encontró 042_catalogo_cp.csv. Usa -Root con la carpeta/USB que contiene migration\exports."
}

Write-Host "Archivo: $($cpFile.FullName)" -ForegroundColor Green
Write-Host "Tamaño: $([math]::Round($cpFile.Length/1MB,2)) MB"

$escaped=$cpFile.FullName.Replace("'","''").Replace("\","/")

$sql=@"
BEGIN;

CREATE TEMP TABLE shiny_geo_stage(

  cp TEXT,
  estado TEXT,
  municipio TEXT,
  ciudad TEXT,
  colonia TEXT,
  tipo_asentamiento TEXT,
  clave_estado TEXT,
  clave_municipio TEXT,
  clave_ciudad TEXT
);

\copy shiny_geo_stage FROM '$escaped' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

TRUNCATE TABLE shiny.catalogo_cp RESTART IDENTITY;

INSERT INTO shiny.catalogo_cp(
  cp,estado,municipio,ciudad,colonia,tipo_asentamiento,
  clave_estado,clave_municipio,clave_ciudad
)
SELECT
  NULLIF(TRIM(cp),''),
  NULLIF(TRIM(estado),''),
  NULLIF(TRIM(municipio),''),
  NULLIF(TRIM(ciudad),''),
  NULLIF(TRIM(colonia),''),
  NULLIF(TRIM(tipo_asentamiento),''),
  NULLIF(TRIM(clave_estado),''),
  NULLIF(TRIM(clave_municipio),''),
  NULLIF(TRIM(clave_ciudad),'')
FROM shiny_geo_stage
WHERE NULLIF(TRIM(cp),'') IS NOT NULL;

COMMIT;

SELECT
  COUNT(*) AS registros,
  COUNT(DISTINCT estado) AS estados,
  COUNT(DISTINCT cp) AS codigos_postales
FROM shiny.catalogo_cp;
"@

$temp=Join-Path $env:TEMP "shiny_restore_geo_$(Get-Date -Format yyyyMMdd_HHmmss).sql"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($temp, $sql, $utf8NoBom)

try{
  & psql -v ON_ERROR_STOP=1 -U $User -h $HostName -d $Database -f $temp
  if($LASTEXITCODE -ne 0){throw "psql terminó con código $LASTEXITCODE"}
  Write-Host ""
  Write-Host "Catálogo geográfico restaurado correctamente." -ForegroundColor Green
  Write-Host "Reinicia npm run dev y usa Ctrl+F5." -ForegroundColor Green
} finally {
  Remove-Item $temp -Force -ErrorAction SilentlyContinue
}





