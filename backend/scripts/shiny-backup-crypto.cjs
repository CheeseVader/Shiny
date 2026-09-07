#!/usr/bin/env node
/* SHINY_BACKUP_CRYPTO_R130
 * Formato portable:
 *   magic: SHINYBK1 (8 bytes)
 *   salt: 16 bytes
 *   iv: 12 bytes
 *   authTag: 16 bytes
 *   ciphertext...
 * KDF: PBKDF2-SHA256 250000
 * Cipher: AES-256-GCM
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const MAGIC = Buffer.from('SHINYBK1');
const ITER = 250000;

function die(m){ console.error(`[ERROR] ${m}`); process.exit(2); }
function derive(pass,salt){ return crypto.pbkdf2Sync(Buffer.from(pass,'utf8'),salt,ITER,32,'sha256'); }

const [,,cmd,input,output] = process.argv;
const pass = process.env.SHINY_BACKUP_PASSPHRASE || '';
if(!cmd || !input || !output) die('USAGE encrypt|decrypt <input> <output>');
if(pass.length < 12) die('PASSPHRASE_TOO_SHORT');

if(cmd === 'encrypt'){
  const plain = fs.readFileSync(input);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = derive(pass,salt);
  const cipher = crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted = Buffer.concat([cipher.update(plain),cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(output,Buffer.concat([MAGIC,salt,iv,tag,encrypted]),{mode:0o600});
  console.log('[OK] ENCRYPTED');
}else if(cmd === 'decrypt'){
  const data = fs.readFileSync(input);
  if(data.length < 52 || !data.subarray(0,8).equals(MAGIC)) die('INVALID_BACKUP_FORMAT');
  const salt = data.subarray(8,24);
  const iv = data.subarray(24,36);
  const tag = data.subarray(36,52);
  const encrypted = data.subarray(52);
  const key = derive(pass,salt);
  try{
    const decipher = crypto.createDecipheriv('aes-256-gcm',key,iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(encrypted),decipher.final()]);
    fs.writeFileSync(output,plain,{mode:0o600});
    console.log('[OK] DECRYPTED');
  }catch{
    die('DECRYPT_FAILED_BAD_KEY_OR_CORRUPT_FILE');
  }
}else{
  die('UNKNOWN_COMMAND');
}