import { Router } from 'express';
import { consolidatedReport,auditIntegrity } from '../repositories/reportsRepository.js';

const router=Router();
const bad=(res,e)=>res.status(500).json({success:false,error:e.message,message:e.message});

router.get('/consolidated',async(req,res)=>{
  try{res.json({success:true,data:await consolidatedReport(req.query,req.access?.branchScope)});}
  catch(e){bad(res,e);}
});
router.get('/audit',async(req,res)=>{
  try{res.json({success:true,data:await auditIntegrity(req.access?.branchScope)});}
  catch(e){bad(res,e);}
});
export default router;
