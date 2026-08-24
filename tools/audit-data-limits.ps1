param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$patterns = @(
  'rows\.length\s*>\s*\d+',
  'slice\(\s*0\s*,\s*(100|200|500|1000|2000|3000|5000)\s*\)',
  'LIMIT\s+(100|200|500|1000|2000|3000|5000)\b',
  'Math\.min\([^)]*(100|200|500|1000|2000|3000|5000)',
  'Hasta\s+\d+\s+filas',
  'máximo\s+\d+\s+filas',
  'maxRows|max_rows|maxFiles'
)

$files = Get-ChildItem -Path $Root -Recurse -File -Include *.js,*.jsx,*.ts,*.tsx,*.sql,*.md |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\legacy\\|\\dist\\|\\.git\\' }

$findings = foreach($f in $files){
  $lineNo=0
  foreach($line in Get-Content $f.FullName){
    $lineNo++
    foreach($p in $patterns){
      if($line -match $p){
        [pscustomobject]@{
          File = $f.FullName.Substring($Root.Length).TrimStart('\')
          Line = $lineNo
          Text = $line.Trim()
          Pattern = $p
        }
        break
      }
    }
  }
}

$findings | Sort-Object File,Line | Format-Table -AutoSize
Write-Host ""
Write-Host "NOTA: LIMIT usados para paginacion/listados no son un limite funcional de importacion/exportacion." -ForegroundColor Yellow
Write-Host "Import/export debe procesarse por lotes internos sin tope total." -ForegroundColor Green
