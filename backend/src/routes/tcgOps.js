import { Router } from 'express';
import {
  searchVariants,quickScan,transfer,adjust,createTcgSale,cancelTcgSale,listTcgSales,
  listMovements,createCount,listCounts,getCount,captureCount,closeCount,applyCountAdjustment,bulkOperations
} from '../repositories/tcgOpsRepository.js';

const router=Router();
const ok=(res,p)=>res.json({success:true,data:p});
const bad=(res,e,status=400)=>res.status(status).json({success:false,error:e.message,message:e.message});

router.get('/variants',async(req,res)=>{try{const r=await searchVariants(req.query);ok(res,r.rows);}catch(e){bad(res,e,500);}});
router.post('/scan',async(req,res)=>{try{ok(res,await quickScan(req.body||{},req.user));}catch(e){bad(res,e);}});
router.post('/transfer',async(req,res)=>{try{ok(res,await transfer(req.body||{},req.user));}catch(e){bad(res,e);}});
router.post('/adjust',async(req,res)=>{try{ok(res,await adjust(req.body||{},req.user));}catch(e){bad(res,e);}});
router.get('/movements',async(req,res)=>{try{const r=await listMovements(req.query);ok(res,r.rows);}catch(e){bad(res,e,500);}});

router.get('/sales',async(req,res)=>{try{const r=await listTcgSales(req.query);ok(res,r.rows);}catch(e){bad(res,e,500);}});
router.post('/sales',async(req,res)=>{try{res.status(201).json({success:true,data:await createTcgSale(req.body||{},req.user)});}catch(e){bad(res,e);}});
router.post('/sales/:id/cancel',async(req,res)=>{try{ok(res,await cancelTcgSale(req.params.id,req.body||{},req.user));}catch(e){bad(res,e);}});

router.get('/counts',async(req,res)=>{try{const r=await listCounts(req.query);ok(res,r.rows);}catch(e){bad(res,e,500);}});
router.post('/counts',async(req,res)=>{try{res.status(201).json({success:true,data:await createCount(req.body||{},req.user)});}catch(e){bad(res,e);}});
router.get('/counts/:id',async(req,res)=>{try{const d=await getCount(req.params.id);if(!d)return res.status(404).json({success:false,error:'COUNT_NOT_FOUND'});ok(res,d);}catch(e){bad(res,e,500);}});
router.post('/counts/:id/capture',async(req,res)=>{try{ok(res,await captureCount(req.params.id,req.body||{},req.user));}catch(e){bad(res,e);}});
router.post('/counts/:id/close',async(req,res)=>{try{ok(res,await closeCount(req.params.id,req.body||{},req.user));}catch(e){bad(res,e);}});
router.post('/counts/:id/apply-adjustment',async(req,res)=>{try{ok(res,await applyCountAdjustment(req.params.id,req.user));}catch(e){bad(res,e);}});

router.post('/bulk',async(req,res)=>{try{ok(res,await bulkOperations(req.body||{},req.user));}catch(e){bad(res,e);}});

export default router;
