param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True([bool]$Condition,[string]$Message){
  if(-not $Condition){ throw $Message }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " SHINY AUTH USERNAME - DIAGNOSTICO R62B" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$ProjectRoot=[System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
Assert-True (Test-Path -LiteralPath $ProjectRoot) "ProjectRoot no existe: $ProjectRoot"

$OutFile=Join-Path $ProjectRoot "DIAGNOSTICO-SHINY-AUTH-USERNAME-R62B.txt"

$roots=@(
  (Join-Path $ProjectRoot "frontend\src"),
  (Join-Path $ProjectRoot "backend"),
  (Join-Path $ProjectRoot "server"),
  (Join-Path $ProjectRoot "api"),
  (Join-Path $ProjectRoot "src")
) | Where-Object { Test-Path -LiteralPath $_ }

$extensions=@('.js','.jsx','.ts','.tsx','.sql','.json','.prisma','.mjs','.cjs')

$patterns=@(
  'email',
  'username',
  'password',
  'login',
  'signin',
  'authenticate',
  'auth',
  'usuarios',
  'users',
  'CREATE TABLE',
  'ALTER TABLE',
  'bcrypt',
  'argon',
  'jwt',
  '/login',
  '/auth',
  'role',
  'rol',
  'sucursal'
)

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("SHINY AUTH USERNAME - DIAGNOSTICO R62B")
$lines.Add("Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$lines.Add("Proyecto: $ProjectRoot")
$lines.Add("")

$files=@()
foreach($root in $roots){
  $files += Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $extensions -contains $_.Extension.ToLowerInvariant() -and
      $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\build\\|\\coverage\\|\\_gmx_backups\\|\\.git\\'
    }
}
$files=@($files | Sort-Object FullName -Unique)

$lines.Add("ARCHIVOS ESCANEADOS: $($files.Count)")
$lines.Add("")

foreach($pattern in $patterns){
  $lines.Add("====================================================================")
  $lines.Add("PATRON: $pattern")
  $lines.Add("====================================================================")

  $found=0
  foreach($f in $files){
    try{
      $content=[System.IO.File]::ReadAllLines($f.FullName)
      for($i=0;$i -lt $content.Length;$i++){
        if($content[$i] -match [regex]::Escape($pattern)){
          $found++
          if($found -le 80){
            $rel=$f.FullName.Substring($ProjectRoot.Length).TrimStart('\')
            $start=[Math]::Max(0,$i-2)
            $end=[Math]::Min($content.Length-1,$i+2)
            $lines.Add("")
            $lines.Add("FILE: $rel")
            for($j=$start;$j -le $end;$j++){
              $lines.Add(("{0,5}: {1}" -f ($j+1),$content[$j]))
            }
          }
        }
      }
    } catch {}
  }

  if($found -eq 0){
    $lines.Add("(sin coincidencias)")
  } elseif($found -gt 80){
    $lines.Add("")
    $lines.Add("Coincidencias totales: $found (se muestran primeras 80)")
  } else {
    $lines.Add("")
    $lines.Add("Coincidencias totales: $found")
  }
  $lines.Add("")
}

$likely=@(
  "frontend\src\pages\LoginPage.jsx",
  "frontend\src\components\ProtectedRoute.jsx",
  "frontend\src\hooks\useAuth.js",
  "frontend\src\context\AuthContext.jsx",
  "frontend\src\contexts\AuthContext.jsx",
  "backend\src\routes\auth.js",
  "backend\src\routes\authRoutes.js",
  "backend\src\controllers\authController.js",
  "backend\src\repositories\userRepository.js",
  "backend\src\repositories\usersRepository.js",
  "backend\src\db.js",
  "backend\src\database.js",
  "backend\prisma\schema.prisma"
)

$lines.Add("====================================================================")
$lines.Add("ARCHIVOS PROBABLES EXISTENTES")
$lines.Add("====================================================================")
foreach($rel in $likely){
  $p=Join-Path $ProjectRoot $rel
  if(Test-Path -LiteralPath $p){
    $status="EXISTE"
  } else {
    $status="NO"
  }
  $lines.Add(("{0,-8} {1}" -f $status,$rel))
}

$enc = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($OutFile,$lines,$enc)

Write-Host ""
Write-Host "[OK] Diagnostico generado:" -ForegroundColor Green
Write-Host $OutFile -ForegroundColor White
Write-Host ""
Write-Host "No se modifico ningun archivo del proyecto." -ForegroundColor Yellow
Write-Host "No se realizo commit ni push." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan
