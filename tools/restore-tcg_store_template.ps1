param(
  [Parameter(Mandatory=$true)][string]$BackupFile,
  [string]$Database = "shiny_db"
)
$ErrorActionPreference="Stop"
if(!(Test-Path $BackupFile)){throw "No existe $BackupFile"}
Write-Host "ADVERTENCIA: este comando restaura sobre $Database."
$confirm=Read-Host "Escribe RESTAURAR para continuar"
if($confirm -ne "RESTAURAR"){Write-Host "Cancelado.";exit 1}
pg_restore -U postgres -h localhost -d $Database --clean --if-exists $BackupFile
if($LASTEXITCODE -ne 0){throw "pg_restore terminó con código $LASTEXITCODE"}
Write-Host "Restore finalizado."
