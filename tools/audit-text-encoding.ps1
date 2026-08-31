param(
  [string]$Root = "."
)

$ErrorActionPreference = "Stop"
Write-Host "Shiny - Auditoria de textos y codificacion UTF-8" -ForegroundColor Cyan
Write-Host "Raiz: $Root"

$extensions = @(".js",".jsx",".ts",".tsx",".html",".css",".sql",".md",".txt",".ps1")
$badPatterns = @(
  "�",
  "�",
  "–",
  "—",
  "…",
  "�",
  "﻿",
  [char]0xFFFD
)

$hits = @()

Get-ChildItem -Path $Root -Recurse -ErrorAction SilentlyContinue |
  Where-Object { -not $_.PSIsContainer -and $extensions -contains $_.Extension.ToLowerInvariant() } |
  ForEach-Object {
    $path = $_.FullName
    try {
      $lines = Get-Content -LiteralPath $path -Encoding UTF8
      for($i=0; $i -lt $lines.Count; $i++){
        $line = [string]$lines[$i]
        foreach($pattern in $badPatterns){
          if($line.Contains([string]$pattern)){
            $hits += [PSCustomObject]@{
              Archivo = $path
              Linea   = $i + 1
              Texto   = $line.Trim()
            }
            break
          }
        }
      }
    } catch {}
  }

if($hits.Count -gt 0){
  Write-Host ""
  Write-Host "Se encontraron posibles textos mal codificados:" -ForegroundColor Yellow
  $hits | Format-Table -AutoSize
  exit 2
}

Write-Host ""
Write-Host "OK: no se detectaron patrones comunes de mojibake en archivos fuente." -ForegroundColor Green
exit 0
