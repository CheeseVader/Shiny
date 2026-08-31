import { Router } from 'express';
import { previewBenefits,getClientLoyalty,adjustClientPoints } from '../repositories/benefitsRepository.js';
const router=Router();
// SHINY_FEATURE_LOYALTY_GATE_R1
router.use((req,res,next)=>process.env.SHINY_FEATURE_LOYALTY==='true'?next():res.status(404).json({success:false,error:'FEATURE_DISABLED'}));
const bad=(res,e,status=400)=>res.status(status).json({success:false,error:e.message,message:e.message});

router.post('/quote',async(req,res)=>{try{res.json({success:true,data:await previewBenefits(req.body||{})});}catch(e){bad(res,e);}});
router.get('/clients/:clientId',async(req,res)=>{try{res.json({success:true,data:await getClientLoyalty(req.params.clientId)});}catch(e){bad(res,e,500);}});
router.post('/clients/:clientId/adjust',async(req,res)=>{try{res.json({success:true,data:await adjustClientPoints({
  clientId:req.params.clientId,points:req.body?.points,reason:req.body?.reason,user:req.user
})});}catch(e){bad(res,e);}});
export default router;
