import { Router } from 'express';
import { enrichMissingProductImages } from '../productImageEnrichmentService.js';

const router=Router();

function n(v,def=100){
  const x=Number(v);
  return Number.isFinite(x)?Math.min(Math.max(Math.floor(x),1),500):def;
}

router.get('/preview',async(req,res)=>{
  try{
    const data=await enrichMissingProductImages({
      mode:'preview',
      limit:n(req.query.limit,100)
    });
    res.json({success:true,data});
  }catch(e){
    res.status(500).json({success:false,error:'PRODUCT_IMAGE_PREVIEW_FAILED',message:String(e?.message||e)});
  }
});

router.post('/apply',async(req,res)=>{
  try{
    const data=await enrichMissingProductImages({
      mode:'apply',
      limit:n(req.body?.limit,100)
    });
    res.json({success:true,data});
  }catch(e){
    res.status(500).json({success:false,error:'PRODUCT_IMAGE_APPLY_FAILED',message:String(e?.message||e)});
  }
});

export default router;
