import { Router } from 'express';
import { getTrafficMetrics,resetTrafficHistogram } from '../trafficMetrics.js';
import { resetRequestMetrics } from '../requestMetrics.js';
const router=Router();
router.get('/',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({success:true,data:getTrafficMetrics()});});
router.post('/reset',(_req,res)=>{resetTrafficHistogram();resetRequestMetrics();res.json({success:true,at:new Date().toISOString()});});
router.post('/event-loop/reset',(_req,res)=>{resetTrafficHistogram();res.json({success:true});});
export default router;
