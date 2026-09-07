#!/usr/bin/env node
/* SHINY_BACKUP_WEEKLY_TIMER_R142
 * Programa respaldo DBA semanal mediante systemd.
 */
/* SHINY_BACKUP_RUNTIME_REPAIR_R140
 * Se ejecuta como postinstall en Linux/RPi.
 * Instala y CERTIFICA el agente privilegiado que usa la API de Shiny.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function out(m){ console.log(`[SHINY BACKUP R140] ${m}`); }
function die(m){ console.error(`[SHINY BACKUP R140 ERROR] ${m}`); process.exit(40); }
function run(cmd,args,opts={}){
  return spawnSync(cmd,args,{encoding:'utf8',stdio:'pipe',...opts});
}
function sha256(p){ return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

if(process.platform!=='linux'){
  out('No es Linux; se omite runtime repair.');
  process.exit(0);
}
if(typeof process.getuid==='function' && process.getuid()!==0){
  die('ROOT_REQUIRED_FOR_RUNTIME_REPAIR');
}

const appDir=process.env.APP_DIR||'/opt/shiny/app';
const service=process.env.SERVICE_NAME||'shiny-app.service';
const src=path.join(appDir,'backend','scripts','shiny-backup-agent.sh');
const dstDir='/usr/local/lib/shiny-backup';
const dst=path.join(dstDir,'shiny-backup-agent.sh');
const sudoers='/etc/sudoers.d/shiny-backup';

if(!fs.existsSync(src)) die('AGENT_SOURCE_MISSING');

let text=fs.readFileSync(src,'utf8').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
if(!text.includes('SHINY_BACKUP_ENGINE_CLEAN_R140')) die('AGENT_SOURCE_VERSION_MISMATCH');
fs.writeFileSync(src,text,{encoding:'utf8',mode:0o755});

const syntax=run('/bin/bash',['-n',src]);
if((syntax.status??1)!==0){
  die(`AGENT_BASH_SYNTAX_INVALID ${(syntax.stderr||syntax.stdout||'').trim()}`);
}

let appUser=String(process.env.APP_USER||'').trim();
if(!appUser){
  const q=run('/bin/systemctl',['show','-p','User','--value',service]);
  if((q.status??1)===0) appUser=String(q.stdout||'').trim();
}
if(!appUser){
  try{
    const uid=fs.statSync(appDir).uid;
    if(uid>0){
      const q=run('/usr/bin/id',['-nu',String(uid)]);
      if((q.status??1)===0) appUser=String(q.stdout||'').trim();
    }
  }catch{}
}
if(!appUser) appUser='shiny';

const userCheck=run('/usr/bin/id',['-u',appUser]);
if((userCheck.status??1)!==0) die('APP_USER_NOT_FOUND');

fs.mkdirSync(dstDir,{recursive:true,mode:0o755});
fs.mkdirSync('/var/lib/shiny-backup',{recursive:true,mode:0o710});
fs.mkdirSync('/var/lib/shiny-backup/backups',{recursive:true,mode:0o700});
fs.mkdirSync('/var/lib/shiny-backup/tmp',{recursive:true,mode:0o710});

fs.copyFileSync(src,dst);
fs.chmodSync(dst,0o755);

if(sha256(src)!==sha256(dst)) die('AGENT_COPY_SHA_MISMATCH');

fs.writeFileSync(
  sudoers,
  `${appUser} ALL=(root) NOPASSWD: ${dst}\n`,
  {encoding:'utf8',mode:0o440}
);
fs.chmodSync(sudoers,0o440);

const visudo=run('/usr/sbin/visudo',['-cf',sudoers]);
if((visudo.status??1)!==0){
  try{fs.unlinkSync(sudoers)}catch{}
  die(`SUDOERS_INVALID ${(visudo.stderr||visudo.stdout||'').trim()}`);
}

let self;
if(appUser==='root'){
  self=run(dst,['status']);
}else{
  self=run('/usr/sbin/runuser',['-u',appUser,'--','/usr/bin/sudo','-n',dst,'status']);
}
if((self.status??1)!==0){
  die(`RUNTIME_SELFTEST_FAILED ${(self.stderr||self.stdout||'').trim()}`);
}

let status;
try{ status=JSON.parse(String(self.stdout||'').trim()); }
catch{ die('RUNTIME_SELFTEST_JSON_INVALID'); }

if(status?.configured!==true) die('RUNTIME_SELFTEST_NOT_CONFIGURED');

/* SHINY_BACKUP_WEEKLY_SYSTEMD_R142 */
const weeklyService='/etc/systemd/system/shiny-backup-weekly.service';
const weeklyTimer='/etc/systemd/system/shiny-backup-weekly.timer';

const weeklyServiceText=`[Unit]
Description=Shiny - respaldo semanal de continuidad
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=${dst} backup
User=root
Group=root
Nice=10
`;

const weeklyTimerText=`[Unit]
Description=Shiny - respaldo automatico semanal

[Timer]
OnCalendar=Sun *-*-* 03:00:00
Persistent=true
RandomizedDelaySec=15min
AccuracySec=1min
Unit=shiny-backup-weekly.service

[Install]
WantedBy=timers.target
`;

fs.writeFileSync(weeklyService,weeklyServiceText,{encoding:'utf8',mode:0o644});
fs.writeFileSync(weeklyTimer,weeklyTimerText,{encoding:'utf8',mode:0o644});
fs.chmodSync(weeklyService,0o644);
fs.chmodSync(weeklyTimer,0o644);

const daemonReload=run('/bin/systemctl',['daemon-reload']);
if((daemonReload.status??1)!==0){
  die(`WEEKLY_SYSTEMD_DAEMON_RELOAD_FAILED ${(daemonReload.stderr||daemonReload.stdout||'').trim()}`);
}

const enableTimer=run('/bin/systemctl',['enable','--now','shiny-backup-weekly.timer']);
if((enableTimer.status??1)!==0){
  die(`WEEKLY_TIMER_ENABLE_FAILED ${(enableTimer.stderr||enableTimer.stdout||'').trim()}`);
}

const enabled=run('/bin/systemctl',['is-enabled','shiny-backup-weekly.timer']);
if((enabled.status??1)!==0 || String(enabled.stdout||'').trim()!=='enabled'){
  die(`WEEKLY_TIMER_NOT_ENABLED ${(enabled.stderr||enabled.stdout||'').trim()}`);
}

const timerState=run('/bin/systemctl',['show','shiny-backup-weekly.timer','-p','Persistent','-p','TimersCalendar','--no-pager']);
if((timerState.status??1)!==0){
  die(`WEEKLY_TIMER_SELFTEST_FAILED ${(timerState.stderr||timerState.stdout||'').trim()}`);
}
const timerText=String(timerState.stdout||'');
if(!timerText.includes('Persistent=yes')){
  die('WEEKLY_TIMER_PERSISTENT_NOT_ACTIVE');
}
if(!timerText.includes('Sun') || !timerText.includes('03:00:00')){
  die('WEEKLY_TIMER_CALENDAR_MISMATCH');
}

out('Respaldo semanal habilitado: domingo 03:00 hora local.');

out(`Agente certificado para usuario ${appUser}.`);
out(`SHA256 ${sha256(dst)}`);
process.exit(0);
