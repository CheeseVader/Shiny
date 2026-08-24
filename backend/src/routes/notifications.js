import { Router } from 'express';
import {
  listNotifications,
  notificationSummary,
  markNotification,
  resolveNotification,
  generateAlerts,
  getAlertSettings,
  saveAlertSettings
} from '../repositories/notificationsRepository.js';

const router=Router();

const bad=(res,e,status=400)=>{
  const code=String(e?.message||'ERROR');
  const resolvedStatus=
    Number(e?.statusCode) ||
    (code==='BRANCH_FORBIDDEN' ? 403 : status);

  return res.status(resolvedStatus).json({
    success:false,
    error:code,
    message:code,
    ...(e?.branchId ? {branchId:e.branchId} : {}),
    ...(Array.isArray(e?.allowedBranches)
      ? {allowedBranches:e.allowedBranches}
      : {})
  });
};

router.get('/',async(req,res)=>{
  try{
    const [rows,summary]=await Promise.all([
      listNotifications(req.query,req.access?.branchScope),
      notificationSummary(req.access?.branchScope)
    ]);

    res.json({
      success:true,
      data:rows.rows,
      summary
    });
  }catch(e){
    bad(res,e,500);
  }
});

router.get('/summary',async(req,res)=>{
  try{
    res.json({
      success:true,
      data:await notificationSummary(req.access?.branchScope)
    });
  }catch(e){
    bad(res,e,500);
  }
});

router.post('/generate',async(req,res)=>{
  try{
    res.json({
      success:true,
      data:await generateAlerts(
        req.user,
        {scope:req.access?.branchScope}
      )
    });
  }catch(e){
    bad(res,e);
  }
});

router.post('/:rowId/read',async(req,res)=>{
  try{
    res.json({
      success:true,
      data:await markNotification(
        Number(req.params.rowId),
        req.body?.read!==false,
        req.user,
        req.access?.branchScope
      )
    });
  }catch(e){
    bad(res,e);
  }
});

router.post('/:rowId/resolve',async(req,res)=>{
  try{
    res.json({
      success:true,
      data:await resolveNotification(
        Number(req.params.rowId),
        req.body||{},
        req.user,
        req.access?.branchScope
      )
    });
  }catch(e){
    bad(res,e);
  }
});

router.get('/settings/config',async(_req,res)=>{
  try{
    res.json({
      success:true,
      data:await getAlertSettings()
    });
  }catch(e){
    bad(res,e,500);
  }
});

router.put('/settings/config',async(req,res)=>{
  try{
    res.json({
      success:true,
      data:await saveAlertSettings(
        req.body||{},
        req.user
      )
    });
  }catch(e){
    bad(res,e);
  }
});

export default router;