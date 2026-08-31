import 'dotenv/config';
import { query, pool } from './src/db.js';

try {
  const r = await query(`
    SELECT
      row_id,
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

  console.log('ROWS=', r.rowCount);

  console.table(
    r.rows.map(x => ({
      row_id: x.row_id,
      nombre: x.nombre,
      email: x.email,
      rol: x.rol,
      activo: x.activo,
      tiene_password: Boolean(x.password_hash),
      hash_len: String(x.password_hash || '').length
    }))
  );
}
catch (e) {
  console.error('ERROR=', e);
}
finally {
  await pool.end();
}
