param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)
$ErrorActionPreference="Stop"
$envFile=Join-Path $ProjectRoot "backend\.env"
if(!(Test-Path $envFile)){throw "No existe $envFile"}
Get-Content $envFile | ForEach-Object {
  if($_ -match '^\s*([^#][^=]+)=(.*)$'){
    [Environment]::SetEnvironmentVariable($matches[1].Trim(),$matches[2].Trim(),"Process")
  }
}
$backupDir=if($env:SHINY_BACKUP_DIR){$env:SHINY_BACKUP_DIR}else{Join-Path $ProjectRoot "backups"}
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$file=Join-Path $backupDir "shiny_db_$stamp.dump"
& pg_dump -h $env:PGHOST -p $env:PGPORT -U $env:PGUSER -d $env:PGDATABASE -Fc -f $file
if($LASTEXITCODE -ne 0){throw "pg_dump terminó con código $LASTEXITCODE"}
Write-Host "Backup OK: $file"
