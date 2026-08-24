import fs from 'node:fs';
import { Router } from 'express';
import { listBanners,saveBanner,runtimeContent,createAppearanceRevision,listAppearanceRevisions,restoreAppearanceRevision,storefrontRuntime,getCmsMediaMeta,resolveCmsMediaPath,deleteBannerSafe} from '../repositories/cmsRepository.js';
const router=Router();
const bad=(res,e,status=400)=>res.status(status).json({success:false,error:e.message,message:e.message});
router.get('/banners',async(req,res)=>{try{const r=await listBanners(req.query);res.json({success:true,data:r.rows});}catch(e){bad(res,e,500);}});
router.post('/banners',async(req,res)=>{try{res.status(201).json({success:true,data:await saveBanner(null,req.body||{},req.user)});}catch(e){bad(res,e);}});
router.put('/banners/:rowId',async(req,res)=>{try{res.json({success:true,data:await saveBanner(Number(req.params.rowId),req.body||{},req.user)});}catch(e){bad(res,e);}});

router.delete('/banners/:rowId',async(req,res)=>{
  try{
    res.json({success:true,data:await deleteBannerSafe(Number(req.params.rowId),req.user)});
  }catch(e){
    const status=e.message==='CANNOT_DELETE_LAST_FALLBACK'?409:400;
    bad(res,e,status);
  }
});
router.get('/runtime',async(req,res)=>{try{res.json({success:true,data:await runtimeContent(req.query)});}catch(e){bad(res,e,500);}});
router.get('/storefront-runtime',async(req,res)=>{try{res.json({success:true,data:await storefrontRuntime({preview:String(req.query.preview||'').toLowerCase()==='true'})});}catch(e){bad(res,e,500);}});
router.get('/appearance-revisions',async(req,res)=>{try{const r=await listAppearanceRevisions(req.query.scope);res.json({success:true,data:r.rows});}catch(e){bad(res,e,500);}});
router.post('/appearance-revisions',async(req,res)=>{try{res.status(201).json({success:true,data:await createAppearanceRevision(req.body?.scope,req.user,req.body?.comment)});}catch(e){bad(res,e);}});
router.post('/appearance-revisions/:id/restore',async(req,res)=>{try{res.json({success:true,data:await restoreAppearanceRevision(req.params.id,req.user)});}catch(e){bad(res,e);}});


router.get('/media-preview/:id/status',async(req,res)=>{
  try{
    const m=await getCmsMediaMeta(req.params.id);
    if(!m)return res.status(404).json({success:false,error:'MEDIA_NOT_FOUND'});
    const resolved=resolveCmsMediaPath(m);
    res.json({success:true,data:{
      id_media:m.id_media,nombre:m.nombre||m.nombre_archivo,mime_type:m.mime_type,
      tamano_bytes:Number(m.tamano_bytes||0),activo:m.activo!==false,
      file_exists:!!resolved,
      stored_path:m.ruta||null,
      resolved_path:resolved||null
    }});
  }catch(e){bad(res,e,500);}
});

router.get('/media-preview/:id/file',async(req,res)=>{
  try{
    const m=await getCmsMediaMeta(req.params.id);
    if(!m)return res.status(404).json({success:false,error:'MEDIA_NOT_FOUND'});
    const resolved=resolveCmsMediaPath(m);
    if(!resolved)return res.status(404).json({success:false,error:'MEDIA_FILE_NOT_FOUND'});
    res.setHeader('Content-Type',m.mime_type||'application/octet-stream');
    res.setHeader('Cache-Control','private, max-age=60');
    fs.createReadStream(resolved).pipe(res);
  }catch(e){bad(res,e,500);}
});

export default router;
