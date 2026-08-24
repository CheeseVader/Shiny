import crypto from 'node:crypto';

export function hashToken(token){
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export function newToken(){
  return crypto.randomBytes(48).toString('base64url');
}

export function hashPassword(password){
  const salt=crypto.randomBytes(16);
  const derived=crypto.scryptSync(String(password),salt,64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(password,stored){
  const [kind,saltHex,hashHex]=String(stored||'').split('$');
  if(kind!=='scrypt'||!saltHex||!hashHex)return false;
  const derived=crypto.scryptSync(String(password),Buffer.from(saltHex,'hex'),64);
  const expected=Buffer.from(hashHex,'hex');
  return expected.length===derived.length && crypto.timingSafeEqual(expected,derived);
}
