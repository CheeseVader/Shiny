import { Router } from 'express';
import {
  listCashSessions,getOpenCash,listCashMovements,openCash,addCashMovement,closeCash
} from '../repositories/cashRepository.js';

const router=Router();

router.get('/sessions',async(req,res)=>{
  try{const r=await listCashSessions(req.query);res.json({success:true,data:r.rows});}
  catch(e){res.status(500).json({success:false,error:e.message});}
});
router.get('/open/:branchId',async(req,res)=>{
  try{res.json({success:true,data:await getOpenCash(req.params.branchId)});}
  catch(e){res.status(500).json({success:false,error:e.message});}
});
router.get('/movements',async(req,res)=>{
  try{const r=await listCashMovements(req.query);res.json({success:true,data:r.rows});}
  catch(e){res.status(500).json({success:false,error:e.message});}
});
router.post('/open',async(req,res)=>{
  try{/* SHINY_CAJA_AUTH_001 */res.status(201).json({success:true,data:await openCash(req.body,req.user)});}
  catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}
});
router.post('/movements',async(req,res)=>{
  try{res.status(201).json({success:true,data:await addCashMovement(req.body,req.user)});}
  catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}
});
router.post('/close',async(req,res)=>{
  try{res.json({success:true,data:await closeCash(req.body,req.user)});}
  catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}
});
export default router;
