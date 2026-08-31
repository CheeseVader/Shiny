param(
  [string]$ProjectRoot = "C:\Users\igarcia\Videos\Shiny",
  [string]$AdminUser = "admin",
  [string]$AdminPassword = "admin",
  [string]$AdminEmail = "admin@local",
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Banner([string]$Text){
  Write-Host ""
  Write-Host "====================================================================" -ForegroundColor Cyan
  Write-Host " $Text" -ForegroundColor Cyan
  Write-Host "====================================================================" -ForegroundColor Cyan
}

function Assert-True([bool]$Condition,[string]$Message){
  if(-not $Condition){ throw $Message }
}

function Write-Utf8NoBom([string]$Path,[string]$Text){
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path,$Text,$enc)
}

function Read-DotEnv([string]$Path){
  $map = @{}
  if(-not (Test-Path -LiteralPath $Path)){ return $map }

  foreach($line in [System.IO.File]::ReadAllLines($Path)){
    $s = $line.Trim()
    if(-not $s -or $s.StartsWith('#')){ continue }

    $eq = $s.IndexOf('=')
    if($eq -lt 1){ continue }

    $key = $s.Substring(0,$eq).Trim()
    $value = $s.Substring($eq+1).Trim()

    if(
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ){
      if($value.Length -ge 2){
        $value = $value.Substring(1,$value.Length-2)
      }
    }

    $map[$key] = $value
  }

  return $map
}

function Find-PostgresTool([string]$Name){
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if($cmd){ return $cmd.Source }

  $root = "C:\Program Files\PostgreSQL"
  if(Test-Path -LiteralPath $root){
    $found = Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Sort-Object {
        $v = 0
        [void][int]::TryParse($_.Name,[ref]$v)
        $v
      } -Descending |
      ForEach-Object {
        $p = Join-Path $_.FullName ("bin\"+$Name+".exe")
        if(Test-Path -LiteralPath $p){ $p }
      } |
      Select-Object -First 1

    if($found){ return $found }
  }

  return $null
}

function Backup-Directory([string]$Source,[string]$Destination){
  if(-not (Test-Path -LiteralPath $Source)){ return }

  New-Item -ItemType Directory -Force -Path $Destination | Out-Null

  $null = & robocopy $Source $Destination /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
  $rc = $LASTEXITCODE
  if($rc -gt 7){
    throw "Robocopy fallo respaldando $Source. Codigo: $rc"
  }
}

function Clear-DirectoryContents([string]$Path){
  if(-not (Test-Path -LiteralPath $Path)){
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
    return
  }

  Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop |
    Remove-Item -Recurse -Force -ErrorAction Stop
}

function Restore-Directory([string]$Backup,[string]$Target){
  if(Test-Path -LiteralPath $Target){
    Get-ChildItem -LiteralPath $Target -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    New-Item -ItemType Directory -Force -Path $Target | Out-Null
  }

  if(Test-Path -LiteralPath $Backup){
    $null = & robocopy $Backup $Target /E /COPY:DAT /DCOPY:DAT /R:2 /W:1 /NFL /NDL /NJH /NJS /NP
  }
}

$ProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot.TrimEnd('\'))
$Backend = Join-Path $ProjectRoot "backend"
$Security = Join-Path $Backend "src\security.js"
$DbFile = Join-Path $Backend "src\db.js"
$BackendPackage = Join-Path $Backend "package.json"

Assert-True (Test-Path -LiteralPath $ProjectRoot) "No existe ProjectRoot: $ProjectRoot"
Assert-True (Test-Path -LiteralPath $Backend) "No existe backend: $Backend"
Assert-True (Test-Path -LiteralPath $Security) "No existe backend\src\security.js"
Assert-True (Test-Path -LiteralPath $DbFile) "No existe backend\src\db.js"
Assert-True (Test-Path -LiteralPath $BackendPackage) "No existe backend\package.json"

Banner "SHINY - INICIALIZACION TOTAL / FACTORY RESET R1"

Write-Host "Proyecto       : $ProjectRoot"
Write-Host "Usuario final  : $AdminUser"
Write-Host "Password final : $AdminPassword"
Write-Host "Email interno  : $AdminEmail"
Write-Host ""
Write-Host "ESTA OPERACION ELIMINA LOS DATOS DE CLIENTE Y DE PRUEBAS." -ForegroundColor Yellow
Write-Host "El codigo, estructura de BD y migraciones se conservan." -ForegroundColor Yellow

if(-not $Force){
  Write-Host ""
  $confirm = Read-Host "Escribe RESET para continuar"
  if($confirm -cne "RESET"){
    Write-Host "Operacion cancelada." -ForegroundColor Yellow
    exit 0
  }
}

# ----------------------------------------------------------------------
# Cargar .env sin modificarlo
# ----------------------------------------------------------------------
$envCandidates = @(
  (Join-Path $Backend ".env"),
  (Join-Path $ProjectRoot ".env")
)

$envFile = $envCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$dotenv = @{}
if($envFile){
  $dotenv = Read-DotEnv $envFile
  Write-Host "[OK] ENV detectado: $envFile" -ForegroundColor Green
} else {
  Write-Host "[AVISO] No encontre .env; se usaran defaults del backend." -ForegroundColor Yellow
}

foreach($key in @('DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD')){
  if($dotenv.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$dotenv[$key])){
    [Environment]::SetEnvironmentVariable($key,[string]$dotenv[$key],'Process')
  }
}

if(-not $env:PGHOST){ $env:PGHOST = '127.0.0.1' }
if(-not $env:PGPORT){ $env:PGPORT = '5432' }
if(-not $env:PGDATABASE){ $env:PGDATABASE = 'shiny_db' }
if(-not $env:PGUSER){ $env:PGUSER = 'shiny_app' }

# ----------------------------------------------------------------------
# Herramientas
# ----------------------------------------------------------------------
$pgDump = Find-PostgresTool "pg_dump"
Assert-True ($null -ne $pgDump) "No encontre pg_dump.exe. PostgreSQL debe estar instalado y accesible."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
Assert-True ($null -ne $nodeCmd) "No encontre node.exe."

# ----------------------------------------------------------------------
# Detener solamente procesos Node relacionados con ESTE proyecto.
# No mata otros proyectos Node.
# ----------------------------------------------------------------------
Banner "DETENIENDO PROCESOS SHINY"

$stopped = @()
try{
  $needle = $ProjectRoot.ToLowerInvariant()
  $nodeProcesses = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle)
    }

  foreach($p in @($nodeProcesses)){
    Write-Host ("Deteniendo PID {0}: {1}" -f $p.ProcessId,$p.CommandLine) -ForegroundColor DarkGray
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    $stopped += $p.ProcessId
  }

  if($stopped.Count -eq 0){
    Write-Host "[OK] No habia procesos Node de Shiny activos." -ForegroundColor Green
  } else {
    Write-Host "[OK] Procesos Shiny detenidos: $($stopped -join ', ')" -ForegroundColor Green
  }
}catch{
  Write-Host "[AVISO] No pude revisar/detener algun proceso: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ----------------------------------------------------------------------
# Backup obligatorio de BD
# ----------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = Join-Path $ProjectRoot ("_shiny_backups\FACTORY-RESET-"+$stamp)
$DbBackup = Join-Path $BackupRoot "database"
$FilesBackup = Join-Path $BackupRoot "runtime-files"

New-Item -ItemType Directory -Force -Path $DbBackup | Out-Null
New-Item -ItemType Directory -Force -Path $FilesBackup | Out-Null

$DumpFile = Join-Path $DbBackup ($env:PGDATABASE+"-PRE-RESET.dump")
$SchemaFile = Join-Path $DbBackup ($env:PGDATABASE+"-SCHEMA-ONLY.sql")

Banner "BACKUP PREVIO"

$commonArgs = @()
if($env:DATABASE_URL){
  $commonArgs += @('--dbname',$env:DATABASE_URL)
}else{
  $commonArgs += @(
    '--host',$env:PGHOST,
    '--port',$env:PGPORT,
    '--username',$env:PGUSER,
    '--dbname',$env:PGDATABASE
  )
}

Write-Host "Creando backup completo..."
& $pgDump @commonArgs --format=custom --file=$DumpFile
if($LASTEXITCODE -ne 0){ throw "pg_dump completo fallo. NO se realizo el reset." }

Write-Host "Creando backup de estructura..."
& $pgDump @commonArgs --schema=shiny --schema-only --no-owner --no-privileges --file=$SchemaFile
if($LASTEXITCODE -ne 0){ throw "pg_dump schema-only fallo. NO se realizo el reset." }

Assert-True (Test-Path -LiteralPath $DumpFile) "No se genero el dump de respaldo."
Assert-True ((Get-Item -LiteralPath $DumpFile).Length -gt 0) "El dump de respaldo quedo vacio."

Write-Host "[OK] Backup PostgreSQL creado." -ForegroundColor Green
Write-Host "     $DumpFile" -ForegroundColor DarkGray

# ----------------------------------------------------------------------
# Backup y limpieza de archivos runtime
# Solo directorios de datos/subidas; NO toca codigo ni assets fuente.
# ----------------------------------------------------------------------
$RuntimeDirs = @(
  @{ Name='backend-uploads'; Source=(Join-Path $Backend 'uploads') },
  @{ Name='backend-tcg-images'; Source=(Join-Path $Backend 'storage\tcg-images') },
  @{ Name='backend-media'; Source=(Join-Path $Backend 'storage\media') },
  @{ Name='backend-imports'; Source=(Join-Path $Backend 'storage\imports') }
)

$runtimeBackups = @()

Banner "LIMPIANDO ARCHIVOS DE CLIENTE / PRUEBAS"

try{
  foreach($entry in $RuntimeDirs){
    $source = [string]$entry.Source
    if(-not (Test-Path -LiteralPath $source)){ continue }

    $dest = Join-Path $FilesBackup ([string]$entry.Name)
    Write-Host "Respaldando: $source"
    Backup-Directory $source $dest
    $runtimeBackups += @{ Backup=$dest; Target=$source }

    Write-Host "Limpiando  : $source"
    Clear-DirectoryContents $source
  }

  Write-Host "[OK] Archivos runtime limpiados." -ForegroundColor Green
}catch{
  Write-Host "ERROR limpiando archivos: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Restaurando archivos runtime..." -ForegroundColor Yellow

  foreach($r in $runtimeBackups){
    Restore-Directory ([string]$r.Backup) ([string]$r.Target)
  }

  throw
}

# ----------------------------------------------------------------------
# Helper Node:
# - usa la misma conexion PostgreSQL del backend
# - usa el hashPassword REAL de Shiny (scrypt)
# - conserva SOLO shiny.schema_migrations
# - TRUNCATE del resto de tablas
# - crea UNICO admin
# Todo dentro de UNA transaccion.
# ----------------------------------------------------------------------
$ResetJs = Join-Path $Backend "_factory-reset-r1.mjs"

$js = @'
import 'dotenv/config';
import { Pool } from 'pg';
import { hashPassword, verifyPassword } from './src/security.js';

const schema='shiny';
const adminUser=process.env.SHINY_RESET_ADMIN_USER || 'admin';
const adminPassword=process.env.SHINY_RESET_ADMIN_PASSWORD || 'admin';
const adminEmail=process.env.SHINY_RESET_ADMIN_EMAIL || 'admin@local';

const pool = process.env.DATABASE_URL
  ? new Pool({connectionString:process.env.DATABASE_URL})
  : new Pool({
      host:process.env.PGHOST || '127.0.0.1',
      port:Number(process.env.PGPORT || 5432),
      database:process.env.PGDATABASE || 'shiny_db',
      user:process.env.PGUSER || 'shiny_app',
      password:process.env.PGPASSWORD
    });

const qi=(s)=>`"${String(s).replaceAll('"','""')}"`;
const client=await pool.connect();

try{
  await client.query('BEGIN');

  const schemaCheck=await client.query(
    `SELECT 1 FROM information_schema.schemata WHERE schema_name=$1`,
    [schema]
  );
  if(!schemaCheck.rowCount)throw new Error(`No existe schema ${schema}.`);

  const adminTable=await client.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema=$1
        AND table_name='administradores'
        AND table_type='BASE TABLE'`,
    [schema]
  );
  if(!adminTable.rowCount)throw new Error(`${schema}.administradores no existe.`);

  const columns=await client.query(
    `SELECT column_name,is_nullable,column_default
       FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='administradores'`,
    [schema]
  );
  const names=new Set(columns.rows.map(x=>x.column_name));
  const required=['id_admin','nombre','email','username','password_hash','rol','activo'];
  const missing=required.filter(x=>!names.has(x));
  if(missing.length)throw new Error(
    `administradores no tiene columnas esperadas: ${missing.join(', ')}`
  );

  const tableRows=await client.query(
    `SELECT tablename
       FROM pg_tables
      WHERE schemaname=$1
      ORDER BY tablename`,
    [schema]
  );

  // schema_migrations es estructura/control del producto, no dato de cliente.
  const preserve=new Set(['schema_migrations']);
  const clearTables=tableRows.rows
    .map(r=>r.tablename)
    .filter(t=>!preserve.has(t));

  if(clearTables.length){
    const qualified=clearTables.map(t=>`${qi(schema)}.${qi(t)}`).join(', ');
    await client.query(`TRUNCATE TABLE ${qualified} RESTART IDENTITY CASCADE`);
  }

  const hash=hashPassword(adminPassword);
  if(!verifyPassword(adminPassword,hash)){
    throw new Error('Autoverificacion del hash admin fallo.');
  }

  const id=`ADM-FACTORY-${Date.now()}`;

  // Las columnas adicionales se dejan en sus defaults/null.
  const insertCols=[
    'id_admin','nombre','email','username',
    'password_hash','rol','activo','fecha_creacion','fecha_actualizacion',
    'sucursales_permitidas'
  ].filter(c=>names.has(c));

  const values={
    id_admin:id,
    nombre:'Administrador',
    email:adminEmail,
    username:adminUser.toLowerCase(),
    password_hash:hash,
    rol:'SUPERADMIN',
    activo:true,
    fecha_creacion:new Date(),
    fecha_actualizacion:new Date(),
    sucursales_permitidas:[]
  };

  const params=insertCols.map((c,i)=>`$${i+1}`);
  const vals=insertCols.map(c=>values[c]);

  await client.query(
    `INSERT INTO ${qi(schema)}.${qi('administradores')}
      (${insertCols.map(qi).join(',')})
     VALUES (${params.join(',')})`,
    vals
  );

  const admins=await client.query(
    `SELECT row_id,id_admin,nombre,email,username,rol,activo
       FROM ${qi(schema)}.${qi('administradores')}
      ORDER BY row_id`
  );

  if(admins.rowCount!==1){
    throw new Error(`Validacion: esperaba 1 administrador y hay ${admins.rowCount}.`);
  }

  const a=admins.rows[0];
  if(String(a.username).toLowerCase()!==adminUser.toLowerCase()){
    throw new Error(`Validacion username fallo: ${a.username}`);
  }
  if(a.rol!=='SUPERADMIN' || a.activo!==true){
    throw new Error('Validacion rol/activo del administrador fallo.');
  }

  // Confirmar que todas las tablas de datos quedaron vacias,
  // excepto administradores (1) y schema_migrations (preservada).
  const residual=[];
  for(const t of clearTables){
    const r=await client.query(
      `SELECT COUNT(*)::bigint AS n FROM ${qi(schema)}.${qi(t)}`
    );
    const n=Number(r.rows[0].n);
    const expected=t==='administradores'?1:0;
    if(n!==expected)residual.push(`${t}=${n}`);
  }

  if(residual.length){
    throw new Error(`Quedaron datos residuales: ${residual.join(', ')}`);
  }

  await client.query('COMMIT');

  console.log('SHINY_FACTORY_RESET=OK');
  console.log(`ADMIN_USER=${adminUser}`);
  console.log(`ADMIN_EMAIL=${adminEmail}`);
  console.log(`ADMIN_ROLE=${a.rol}`);
  console.log(`ADMIN_COUNT=${admins.rowCount}`);
  console.log(`TABLES_CLEARED=${clearTables.length}`);
  console.log(`MIGRATIONS_PRESERVED=${preserve.has('schema_migrations')}`);
}catch(error){
  try{ await client.query('ROLLBACK'); }catch{}
  console.error('SHINY_FACTORY_RESET=ERROR');
  console.error(error?.stack || error?.message || error);
  process.exitCode=1;
}finally{
  client.release();
  await pool.end();
}
'@

Write-Utf8NoBom $ResetJs ($js.Trim()+"`n")

$env:SHINY_RESET_ADMIN_USER = $AdminUser
$env:SHINY_RESET_ADMIN_PASSWORD = $AdminPassword
$env:SHINY_RESET_ADMIN_EMAIL = $AdminEmail

Banner "REINICIALIZANDO BASE DE DATOS"

$resetSucceeded = $false
try{
  Push-Location $Backend
  try{
    & node $ResetJs
    if($LASTEXITCODE -ne 0){
      throw "El reset PostgreSQL fallo. La transaccion fue revertida."
    }
    $resetSucceeded = $true
  } finally {
    Pop-Location
  }
}catch{
  Write-Host ""
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "La BD no fue confirmada; PostgreSQL hizo ROLLBACK de la transaccion." -ForegroundColor Yellow
  Write-Host "Restaurando archivos runtime..." -ForegroundColor Yellow

  foreach($r in $runtimeBackups){
    Restore-Directory ([string]$r.Backup) ([string]$r.Target)
  }

  throw
}finally{
  Remove-Item -LiteralPath $ResetJs -Force -ErrorAction SilentlyContinue
  Remove-Item Env:SHINY_RESET_ADMIN_USER -ErrorAction SilentlyContinue
  Remove-Item Env:SHINY_RESET_ADMIN_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:SHINY_RESET_ADMIN_EMAIL -ErrorAction SilentlyContinue
}

Assert-True $resetSucceeded "Reset no confirmado."

# ----------------------------------------------------------------------
# Validacion final ligera: estructura/codigo siguen presentes.
# ----------------------------------------------------------------------
Banner "VALIDACION FINAL"

Assert-True (Test-Path -LiteralPath $Security) "security.js desaparecio."
Assert-True (Test-Path -LiteralPath $DbFile) "db.js desaparecio."
Assert-True (Test-Path -LiteralPath $DumpFile) "Backup DB desaparecio."

Write-Host "[OK] Codigo conservado." -ForegroundColor Green
Write-Host "[OK] Estructura PostgreSQL conservada." -ForegroundColor Green
Write-Host "[OK] schema_migrations conservada." -ForegroundColor Green
Write-Host "[OK] Datos operativos/pruebas eliminados." -ForegroundColor Green
Write-Host "[OK] Catalogo e inventario vacios." -ForegroundColor Green
Write-Host "[OK] Clientes/ventas/pedidos/sesiones vacios." -ForegroundColor Green
Write-Host "[OK] Configuracion/personalizacion de cliente vacia." -ForegroundColor Green
Write-Host "[OK] Archivos runtime/subidas limpiados." -ForegroundColor Green
Write-Host "[OK] Unico administrador creado." -ForegroundColor Green

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " SHINY LISTO COMO INSTALACION LIMPIA" -ForegroundColor Green
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Usuario    : $AdminUser" -ForegroundColor Cyan
Write-Host "Password   : $AdminPassword" -ForegroundColor Cyan
Write-Host "Rol        : SUPERADMIN" -ForegroundColor Cyan
Write-Host "Backup     : $BackupRoot" -ForegroundColor DarkGray
Write-Host ""
Write-Host "IMPORTANTE: cambia la password 'admin' despues de validar la entrega." -ForegroundColor Yellow
Write-Host ""
