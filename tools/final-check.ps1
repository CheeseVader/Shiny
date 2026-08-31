param(
  [string]$ProjectRoot = "C:\Shiny"
)
$ErrorActionPreference="Stop"
Write-Host "=== Shiny FINAL CHECK ==="
Set-Location $ProjectRoot

Write-Host "`n[1/6] Git"
git status --short

Write-Host "`n[2/6] Node"
node --version
npm --version

Write-Host "`n[3/6] PostgreSQL"
psql -U postgres -h localhost -d shiny_db -c "SELECT current_database(), version();"

Write-Host "`n[4/6] Migraciones"
psql -U postgres -h localhost -d shiny_db -c "SELECT version,description,applied_at FROM shiny.schema_migrations ORDER BY applied_at,version;"

Write-Host "`n[5/6] Administradores / sesiones"
psql -U postgres -h localhost -d shiny_db -c "SELECT rol,activo,COUNT(*) FROM shiny.administradores GROUP BY rol,activo ORDER BY rol;"
psql -U postgres -h localhost -d shiny_db -c "SELECT COUNT(*) AS sesiones_activas FROM shiny.admin_sessions WHERE revoked_at IS NULL AND expires_at > NOW();"

Write-Host "`n[6/6] Health API"
try {
  Invoke-RestMethod http://127.0.0.1:8787/api/health | Format-List
} catch {
  Write-Warning "API no está activa. Ejecuta npm run dev y repite esta prueba."
}

Write-Host "`n=== FIN ==="
