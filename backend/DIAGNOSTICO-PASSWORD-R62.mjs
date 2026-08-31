import 'dotenv/config';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { query, pool } from './src/db.js';
import { verifyPassword } from './src/security.js';

const rl = readline.createInterface({ input, output });

try {
  const password = await new Promise(resolve => {
    rl.question('Contraseña: ', resolve);
  });

  const r = await query(`
    SELECT
      id_admin,
      nombre,
      email,
      rol,
      activo,
      password_hash
    FROM shiny.administradores
    WHERE LOWER(SPLIT_PART(email,'@',1)) = LOWER($1)
    LIMIT 1
  `, ['masterivangt']);

  console.log('USUARIO_ENCONTRADO=', r.rowCount === 1);

  if (r.rowCount === 1) {
    const admin = r.rows[0];

    console.log('EMAIL=', admin.email);
    console.log('ROL=', admin.rol);
    console.log('ACTIVO=', admin.activo);

    const ok = verifyPassword(password, admin.password_hash);
    console.log('PASSWORD_OK=', ok);
  }
}
catch (e) {
  console.error('ERROR_REAL=', e);
}
finally {
  rl.close();
  await pool.end();
}
