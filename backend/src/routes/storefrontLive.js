import { Router } from 'express';
import { openStorefrontEventStream,getStorefrontVersion,getStorefrontLiveStats } from '../storefrontLiveSync.js';
const router=Router();
router.get('/events',openStorefrontEventStream);
router.get('/version',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({success:true,data:{version:getStorefrontVersion()}});});
router.get('/status',(_req,res)=>{res.setHeader('Cache-Control','no-store');res.json({success:true,data:getStorefrontLiveStats()});});
export default router;
