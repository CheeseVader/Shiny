import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import pg from 'pg';
import { hashPassword } from '../src/security.js';

const {Pool}=pg;
const rl=readline.createInterface({input,output});
try{
  const name=(await rl.question('Nombre del administrador: ')).trim();
  const email=(await rl.question('Email: ')).trim().toLowerCase();
  const password=await rl.question('Password (mínimo 10 caracteres): ');
  if(!email||password.length<10)throw new Error('Email requerido y password mínimo 10 caracteres.');
  const pool=new Pool({
    host:process.env.PGHOST||'127.0.0.1',port:Number(process.env.PGPORT||5432),
    database:process.env.PGDATABASE||'gmx_db',user:process.env.PGUSER||'gmx_app',
    password:process.env.PGPASSWORD
  });
  const existing=await pool.query(`SELECT row_id,id_admin FROM gmx.administradores WHERE LOWER(email)=$1 ORDER BY row_id LIMIT 1`,[email]);
  if(existing.rowCount){
    await pool.query(`UPDATE gmx.administradores SET nombre=$2,password_hash=$3,rol='SUPERADMIN',activo=true,fecha_actualizacion=NOW()
      WHERE row_id=$1`,[existing.rows[0].row_id,name||'Administrador',hashPassword(password)]);
    console.log(`SUPERADMIN actualizado: ${email}`);
  }else{
    await pool.query(`INSERT INTO gmx.administradores(id_admin,nombre,email,password_hash,rol,activo,fecha_creacion,fecha_actualizacion,sucursales_permitidas)
      VALUES($1,$2,$3,$4,'SUPERADMIN',true,NOW(),NOW(),'[]'::jsonb)`,
      [`ADM-LOCAL-${Date.now()}`,name||'Administrador',email,hashPassword(password)]);
    console.log(`SUPERADMIN creado: ${email}`);
  }
  await pool.end();
}catch(e){console.error('ERROR:',e.message);process.exitCode=1;}finally{rl.close();}
