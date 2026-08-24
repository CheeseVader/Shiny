import { Router } from 'express';
import {listSuppliers,listPurchases,getPurchase,createPurchase,receivePurchase,attachFiscalDocument,cancelPurchase} from '../repositories/purchasesRepository.js';
const router=Router();

router.get('/suppliers',async(req,res)=>{try{const r=await listSuppliers(String(req.query.search||''));res.json({success:true,data:r.rows});}catch(e){res.status(500).json({success:false,error:e.message});}});
router.get('/',async(req,res)=>{try{const r=await listPurchases(req.query);res.json({success:true,data:r.rows});}catch(e){res.status(500).json({success:false,error:e.message});}});
router.get('/:rowId',async(req,res)=>{try{const data=await getPurchase(Number(req.params.rowId));if(!data)return res.status(404).json({success:false,error:'PURCHASE_NOT_FOUND'});res.json({success:true,data});}catch(e){res.status(500).json({success:false,error:e.message});}});
router.post('/',async(req,res)=>{try{res.status(201).json({success:true,data:await createPurchase(req.body,req.user||{})});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/receive',async(req,res)=>{try{res.json({success:true,data:await receivePurchase(Number(req.params.rowId),{...req.body,actor:req.user||{}})});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/fiscal-document',async(req,res)=>{try{res.json({success:true,data:await attachFiscalDocument(Number(req.params.rowId),req.body)});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/cancel',async(req,res)=>{try{res.json({success:true,data:await cancelPurchase(Number(req.params.rowId),String(req.body.reason||''))});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
export default router;
