import { Router } from 'express';
import { query } from '../db.js';
import { hashToken,newToken,verifyPassword } from '../security.js';
import { requireAuth,audit } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { requestAdminPasswordReset,completeAdminPasswordReset } from '../adminRecoveryService.js';

const router=Router();


router.post('/recover',rateLimit({keyPrefix:'ADMIN_RECOVER',max:6}),async(req,res)=>{
  try{
    const baseUrl=`${req.protocol}://${req.get('host')}`.replace(':8787',':5173');
    const r=await requestAdminPasswordReset({
      email:req.body?.email,
      ip:req.ip,
      baseUrl,
      requestedBy:'PUBLIC_ADMIN_RECOVERY'
    });

    // La respuesta pública nunca revela si la cuenta existe.
    const data={accepted:true};
    if(r.development_reset_url)data.development_reset_url=r.development_reset_url;
    res.json({success:true,data});
  }catch(_e){
    res.json({success:true,data:{accepted:true}});
  }
});

router.post('/reset-password',rateLimit({keyPrefix:'ADMIN_RESET',max:8}),async(req,res)=>{
  try{
    const r=await completeAdminPasswordReset({
      token:req.body?.token,
      password:req.body?.password,
      ip:req.ip
    });
    res.json({success:true,data:{reset:r.reset,revoked:r.revoked}});
  }catch(e){
    const known=new Set([
      'ADMIN_PASSWORD_MIN_10',
      'ADMIN_PASSWORD_LETTER_AND_NUMBER_REQUIRED',
      'INVALID_OR_EXPIRED_ADMIN_RESET_TOKEN'
    ]);
    const code=known.has(e.message)?e.message:'ADMIN_PASSWORD_RESET_FAILED';
    res.status(known.has(e.message)?400:500).json({success:false,error:code});
  }
});

router.post('/login',rateLimit({keyPrefix:'ADMIN_LOGIN',max:10}),async(req,res)=>{
  try{
    const email=String(req.body?.email||'').trim().toLowerCase();
    const password=String(req.body?.password||'');
    if(!email||!password)return res.status(400).json({success:false,error:'CREDENTIALS_REQUIRED'});

    const r=await query(`SELECT * FROM gmx.administradores
      WHERE LOWER(email)=$1 AND COALESCE(activo,true)=true
      ORDER BY row_id LIMIT 1`,[email]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_hash))
      return res.status(401).json({success:false,error:'INVALID_CREDENTIALS'});

    const admin=r.rows[0];
    const token=newToken();
    const hours=Math.min(Math.max(Number(process.env.GMX_SESSION_HOURS||12),1),72);
    await query(`INSERT INTO gmx.admin_sessions(token_hash,id_admin,email,expires_at,ip_address,user_agent)
      VALUES($1,$2,$3,NOW()+($4||' hours')::interval,$5,$6)`,
      [hashToken(token),admin.id_admin,admin.email,String(hours),req.ip,String(req.headers['user-agent']||'').slice(0,500)]);

    req.user={email:admin.email};
    await audit(req,'AUTH','LOGIN',admin.id_admin,'Inicio de sesión local');

    res.json({success:true,data:{
      token,expiresInHours:hours,user:{
        id_admin:admin.id_admin,nombre:admin.nombre,email:admin.email,rol:admin.rol,
        sucursal_principal:admin.sucursal_principal,sucursales_permitidas:admin.sucursales_permitidas
      }
    }});
  }catch(_e){res.status(500).json({success:false,error:'LOGIN_FAILED'});}
});

router.get('/me',requireAuth,async(req,res)=>{
  res.json({success:true,data:{user:req.user,access:req.access}});
});

router.post('/verify-password',requireAuth,rateLimit({keyPrefix:'POS_PROTECTED_EXIT',max:8}),async(req,res)=>{
  try{
    const password=String(req.body?.password||'');
    if(!password)return res.status(400).json({success:false,error:'PASSWORD_REQUIRED'});
    const r=await query(`SELECT password_hash FROM gmx.administradores
      WHERE id_admin=$1 AND COALESCE(activo,true)=true
      ORDER BY row_id LIMIT 1`,[req.user.id_admin]);
    if(!r.rowCount||!verifyPassword(password,r.rows[0].password_hash)){
      await audit(req,'AUTH','POS_EXIT_DENIED',req.user.id_admin,'Contraseña incorrecta para salida protegida del POS');
      return res.status(401).json({success:false,error:'INVALID_CREDENTIALS'});
    }
    await audit(req,'AUTH','POS_EXIT_AUTHORIZED',req.user.id_admin,'Salida protegida del POS autorizada');
    res.json({success:true,data:{authorized:true}});
  }catch(e){
    res.status(500).json({success:false,error:'PASSWORD_VERIFY_FAILED',message:e.message});
  }
});

router.post('/logout',requireAuth,async(req,res)=>{
  try{
    await query(`UPDATE gmx.admin_sessions SET revoked_at=NOW() WHERE id=$1`,[req.user.session_id]);
    await audit(req,'AUTH','LOGOUT',req.user.id_admin,'Cierre de sesión');
    res.json({success:true});
  }catch(e){res.status(500).json({success:false,error:'LOGOUT_FAILED',message:e.message});}
});

export default router;
