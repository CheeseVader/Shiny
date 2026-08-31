param([string]$ProjectRoot="C:\Shiny")
$ErrorActionPreference="Stop"
$gitignore=Join-Path $ProjectRoot ".gitignore"
$required=@(
  "backend/.env",
  "backups/",
  "*.dump",
  "*.backup",
  "*.sql.gz",
  "node_modules/",
  "backend/node_modules/",
  "frontend/node_modules/"
)
$content=if(Test-Path $gitignore){Get-Content $gitignore}else{@()}
foreach($line in $required){
  if($content -notcontains $line){Add-Content -Path $gitignore -Value $line; $content+=$line}
}
Write-Host ".gitignore hardened."
