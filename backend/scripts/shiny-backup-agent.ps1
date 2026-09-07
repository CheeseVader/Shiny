param([Parameter(Position=0)][string]$Action="status")
$ErrorActionPreference="Stop"
Set-StrictMode -Version Latest
# SHINY_BACKUP_AGENT_WINDOWS_R130

$ProgramDataRoot = if($env:ProgramData){$env:ProgramData}else{"C:\ProgramData"}
$CfgDir  = Join-Path $ProgramDataRoot "Shiny\backup"
$Cfg     = Join-Path $CfgDir "backup.env"
$Root    = Join-Path $ProgramDataRoot "Shiny\backup-data"
$Backups = Join-Path $Root "backups"
$Tmp     = Join-Path $Root "tmp"
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Crypto  = Join-Path $Here "shiny-backup-crypto.cjs"

New-Item -ItemType Directory -Force -Path $CfgDir,$Backups,$Tmp | Out-Null

function Fail([string]$m){ throw $m }
function B64D([string]$x){ [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($x)) }
function Read-Cfg {
    if(!(Test-Path $Cfg)){ Fail "BACKUP_NOT_CONFIGURED" }
    $m=@{}
    foreach($line in Get-Content $Cfg){
        if($line -match '^([^=]+)=(.*)$'){ $m[$matches[1]]=$matches[2] }
    }
    return $m
}
function Find-PgTool([string]$Name){
    $c=Get-Command $Name -ErrorAction SilentlyContinue
    if($c){ return $c.Source }
    $roots=@("$env:ProgramFiles\PostgreSQL","${env:ProgramFiles(x86)}\PostgreSQL") | Where-Object { $_ -and (Test-Path $_) }
    foreach($r in $roots){
        $x=Get-ChildItem $r -Directory -ErrorAction SilentlyContinue |
           Sort-Object Name -Descending |
           ForEach-Object { Join-Path $_.FullName "bin\$Name.exe" } |
           Where-Object { Test-Path $_ } |
           Select-Object -First 1
        if($x){ return $x }
    }
    Fail "${Name}_NOT_FOUND"
}
function GitHub-Headers([string]$Token){
    return @{
        Accept="application/vnd.github+json"
        Authorization="Bearer $Token"
        "X-GitHub-Api-Version"="2022-11-28"
    }
}
function Load-Secrets {
    $cfg=Read-Cfg
    $token=B64D $cfg["TOKEN_B64"]
    $pass=B64D $cfg["PASS_B64"]
    return @{Cfg=$cfg;Token=$token;Pass=$pass}
}
function Detect-Repo {
    $owner=$env:GITHUB_OWNER
    $repo=$env:GITHUB_REPO
    $candidates=@(
      (Join-Path $ProgramDataRoot "Shiny\updater\updater.env"),
      "C:\ProgramData\Shiny\updater.env"
    )
    foreach($f in $candidates){
      if(Test-Path $f){
        foreach($line in Get-Content $f){
          if(!$owner -and $line -match '^GITHUB_OWNER=(.*)$'){$owner=$matches[1]}
          if(!$repo  -and $line -match '^GITHUB_REPO=(.*)$'){$repo=$matches[1]}
        }
      }
    }
    return @($owner,$repo)
}
function Get-AppVersion {
    $candidates=@()
    if($env:SHINY_APP_DIR){$candidates += (Join-Path $env:SHINY_APP_DIR "VERSION")}
    $candidates += "C:\Shiny\app\VERSION"
    foreach($f in $candidates){if(Test-Path $f){return (Get-Content $f -Raw).Trim()}}
    return "unknown"
}
function Configure {
    $token64=Read-Host
    $pass64=Read-Host
    $db=Read-Host
    $owner=Read-Host
    $repo=Read-Host
    $token=B64D $token64
    $pass=B64D $pass64
    if($token.Length -lt 20){Fail "TOKEN_INVALID"}
    if($pass.Length -lt 12){Fail "PASSPHRASE_TOO_SHORT"}
    if($db -notmatch '^[A-Za-z0-9_-]+$'){Fail "DB_NAME_INVALID"}

    if(!$owner -or !$repo){
        $d=Detect-Repo
        if(!$owner){$owner=$d[0]}
        if(!$repo){$repo=$d[1]}
    }
    if(!$owner -or !$repo){Fail "GITHUB_REPOSITORY_REQUIRED"}

    try{
        Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$owner/$repo" -Headers (GitHub-Headers $token) | Out-Null
    }catch{ Fail "GITHUB_REPO_ACCESS_FAILED: $($_.Exception.Message)" }

    @(
      "GITHUB_OWNER=$owner"
      "GITHUB_REPO=$repo"
      "TOKEN_B64=$token64"
      "PASS_B64=$pass64"
      "DB_NAME=$db"
    ) | Set-Content -Path $Cfg -Encoding UTF8

    Write-Output "[OK] CONFIGURED"
    Write-Output "REPO=$owner/$repo"
    Write-Output "DB=$db"
}
function Status {
    if(Test-Path $Cfg){
        $c=Read-Cfg;$configured=$true
        $repo="$($c.GITHUB_OWNER)/$($c.GITHUB_REPO)";$db=$c.DB_NAME
    }else{$configured=$false;$repo="";$db=""}
    $items=@(Get-ChildItem $Backups -Filter "*.dump.enc" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
    $latest=if($items.Count){$items[0].Name}else{""}
    [ordered]@{configured=$configured;platform="win32";portable=$true;repo=$repo;db=$db;localCount=$items.Count;latestLocal=$latest} |
      ConvertTo-Json -Compress
}
function Create-Backup {
    $s=Load-Secrets;$c=$s.Cfg
    $pgDump=Find-PgTool "pg_dump"
    $node=(Get-Command node -ErrorAction Stop).Source
    if(!(Test-Path $Crypto)){Fail "CRYPTO_HELPER_NOT_FOUND"}
    $stamp=Get-Date -Format "yyyyMMdd-HHmmss"
    $work=Join-Path $Tmp ("create-"+[guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force $work|Out-Null
    $raw=Join-Path $work "database.dump"
    $enc=Join-Path $Backups "shiny-$($c.DB_NAME)-$stamp.dump.enc"

    & $pgDump -Fc --no-owner --no-privileges -d $c.DB_NAME -f $raw
    if($LASTEXITCODE -ne 0){Fail "PG_DUMP_FAILED_$LASTEXITCODE"}

    $old=$env:SHINY_BACKUP_PASSPHRASE
    try{
      $env:SHINY_BACKUP_PASSPHRASE=$s.Pass
      & $node $Crypto encrypt $raw $enc
      if($LASTEXITCODE -ne 0){Fail "ENCRYPT_FAILED_$LASTEXITCODE"}
    }finally{$env:SHINY_BACKUP_PASSPHRASE=$old}
    Remove-Item $work -Recurse -Force

    $hash=(Get-FileHash $enc -Algorithm SHA256).Hash.ToLowerInvariant()
    "$hash  $([IO.Path]::GetFileName($enc))" | Set-Content "$enc.sha256" -Encoding ASCII
    $meta=[ordered]@{
      format="SHINY_BACKUP";backupVersion=1;appVersion=(Get-AppVersion)
      databaseEngine="postgresql";databaseFormat="custom";database=$c.DB_NAME
      sourcePlatform="win32";portable=$true;cipher="AES-256-GCM"
      kdf="PBKDF2-SHA256";iterations=250000
      createdAt=(Get-Date).ToString("o");bytes=(Get-Item $enc).Length;file=[IO.Path]::GetFileName($enc)
    }
    $meta|ConvertTo-Json -Compress|Set-Content "$enc.json" -Encoding UTF8
    Write-Output "[OK] BACKUP_CREATED"
    Write-Output "FILE=$enc"
}
function Latest-Local {
    return Get-ChildItem $Backups -Filter "*.dump.enc" -File |
      Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
function Upload-Backup {
    $s=Load-Secrets;$c=$s.Cfg
    $enc=Latest-Local
    if(!$enc){Fail "NO_LOCAL_BACKUP"}
    foreach($f in @($enc.FullName,"$($enc.FullName).sha256","$($enc.FullName).json")){if(!(Test-Path $f)){Fail "BACKUP_METADATA_MISSING"}}
    $tag="backup-"+(Get-Date -Format "yyyyMMdd-HHmmss")
    $headers=GitHub-Headers $s.Token
    $body=@{tag_name=$tag;name=$tag;body="Encrypted portable Shiny PostgreSQL backup. Not an application release.";draft=$false;prerelease=$true}|ConvertTo-Json
    $rel=Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/$($c.GITHUB_OWNER)/$($c.GITHUB_REPO)/releases" -Headers $headers -ContentType "application/json" -Body $body
    $upload=($rel.upload_url -replace '\{.*$','')
    foreach($f in @($enc.FullName,"$($enc.FullName).sha256","$($enc.FullName).json")){
      $name=[Uri]::EscapeDataString([IO.Path]::GetFileName($f))
      Invoke-RestMethod -Method Post -Uri "$upload?name=$name" -Headers $headers -ContentType "application/octet-stream" -InFile $f | Out-Null
    }
    Write-Output "[OK] BACKUP_UPLOADED"
    Write-Output "TAG=$tag"
}
function Remote-List {
    $s=Load-Secrets;$c=$s.Cfg
    $r=Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$($c.GITHUB_OWNER)/$($c.GITHUB_REPO)/releases?per_page=100" -Headers (GitHub-Headers $s.Token)
    @($r|Where-Object{$_.prerelease -and $_.tag_name.StartsWith("backup-")}|ForEach-Object{
      [ordered]@{id=$_.id;tag=$_.tag_name;published_at=$_.published_at;assets=@($_.assets|ForEach-Object{[ordered]@{id=$_.id;name=$_.name;size=$_.size}})}
    }) | ConvertTo-Json -Compress -Depth 6
}
function Download-Latest {
    $s=Load-Secrets;$c=$s.Cfg
    $headers=GitHub-Headers $s.Token
    $r=Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$($c.GITHUB_OWNER)/$($c.GITHUB_REPO)/releases?per_page=100" -Headers $headers
    $rel=@($r|Where-Object{$_.prerelease -and $_.tag_name.StartsWith("backup-")}|Sort-Object created_at -Descending|Select-Object -First 1)
    if(!$rel){Fail "NO_REMOTE_BACKUP"}
    $work=Join-Path $Tmp ("restore-"+[guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force $work|Out-Null
    foreach($a in $rel.assets){
      if($a.name -like "*.dump.enc" -or $a.name -like "*.sha256" -or $a.name -like "*.dump.enc.json"){
        $h=$headers.Clone();$h.Accept="application/octet-stream"
        Invoke-WebRequest -Uri "https://api.github.com/repos/$($c.GITHUB_OWNER)/$($c.GITHUB_REPO)/releases/assets/$($a.id)" -Headers $h -OutFile (Join-Path $work $a.name) -UseBasicParsing
      }
    }
    return $work
}
function Restore-Latest {
    $s=Load-Secrets;$c=$s.Cfg
    $pgDump=Find-PgTool "pg_dump";$pgRestore=Find-PgTool "pg_restore"
    $node=(Get-Command node -ErrorAction Stop).Source
    $work=Download-Latest
    $enc=Get-ChildItem $work -Filter "*.dump.enc"|Select-Object -First 1
    $sha=Get-ChildItem $work -Filter "*.sha256"|Select-Object -First 1
    if(!$enc -or !$sha){Fail "REMOTE_BACKUP_INCOMPLETE"}
    $expected=((Get-Content $sha.FullName -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual=(Get-FileHash $enc.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if($expected -ne $actual){Fail "SHA256_MISMATCH"}

    $raw=Join-Path $work "database.dump"
    $old=$env:SHINY_BACKUP_PASSPHRASE
    try{$env:SHINY_BACKUP_PASSPHRASE=$s.Pass;& $node $Crypto decrypt $enc.FullName $raw;if($LASTEXITCODE -ne 0){Fail "DECRYPT_FAILED_$LASTEXITCODE"}}
    finally{$env:SHINY_BACKUP_PASSPHRASE=$old}

    $safety=Join-Path $Backups "pre-restore-$($c.DB_NAME)-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
    & $pgDump -Fc --no-owner --no-privileges -d $c.DB_NAME -f $safety
    if($LASTEXITCODE -ne 0){Fail "SAFETY_PG_DUMP_FAILED_$LASTEXITCODE"}

    & $pgRestore --clean --if-exists --no-owner --no-privileges -d $c.DB_NAME $raw
    if($LASTEXITCODE -ne 0){Fail "PG_RESTORE_FAILED_$LASTEXITCODE"}
    Remove-Item $work -Recurse -Force
    Write-Output "[OK] RESTORE_COMPLETE"
    Write-Output "SAFETY_BACKUP=$safety"
}

switch($Action){
 "configure"{Configure}
 "status"{Status}
 "create"{Create-Backup}
 "upload"{Upload-Backup}
 "backup"{Create-Backup;Upload-Backup}
 "remote"{Remote-List}
 "restore-latest"{Restore-Latest}
 default{Fail "USAGE configure|status|create|upload|backup|remote|restore-latest"}
}