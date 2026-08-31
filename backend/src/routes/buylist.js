import { Router } from 'express';
import { effectiveUsdMxn } from '../fxService.js';
import { parseBuylistWorkbook,buildBuylistTemplate } from '../excelImportService.js';
import {
  listRules,saveRule,toggleRule,previewValuation,listBuylists,getBuylist,createDraft,
  decide,pay,convert,cancelBuylist
} from '../repositories/buylistRepository.js';

const router=Router();

function friendlyBuylistError(error){
  const code=String(error?.message||error||'');
  if(code==='BUYLIST_USD_MXN_RATE_REQUIRED')
    return 'Existe precio de mercado en USD, pero este TCG no tiene TDC configurado. Configúralo en TCG → Auto Sync.';
  if(code==='BUYLIST_PRICE_REQUIRED'||code==='PRICE_REFERENCE_REQUIRED')
    return 'No hay precio de mercado ni precio de tienda disponible para esta carta.';
  if(code.startsWith('BUYLIST_UNSUPPORTED_MARKET_CURRENCY:'))
    return `La fuente de mercado está en ${code.split(':')[1]||'otra moneda'} y todavía no existe conversión configurada.`;
  if(code==='INVALID_FX_RATE')
    return 'El tipo de cambio debe ser mayor a cero.';
  return code;
}
const bad=(res,e,status=400)=>{
  const message=friendlyBuylistError(e);
  return res.status(status).json({success:false,error:message,message});
};



router.get('/fx/status',async(_req,res)=>{
  try{res.json({success:true,data:await effectiveUsdMxn({autoRefresh:true})});}
  catch(e){bad(res,e,500);}
});

router.get('/rules',async(_req,res)=>{try{const r=await listRules();res.json({success:true,data:r.rows});}catch(e){res.status(500).json({success:false,error:e.message});}});
router.post('/rules',async(req,res)=>{try{res.status(201).json({success:true,data:await saveRule(req.body||{})});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.patch('/rules/:rowId',async(req,res)=>{try{res.json({success:true,data:await toggleRule(Number(req.params.rowId),req.body?.active!==false)});}catch(e){res.status(400).json({success:false,error:e.message});}});
router.post('/preview',async(req,res)=>{try{res.json({success:true,data:await previewValuation(req.body||{})});}catch(e){bad(res,e);}});
router.post('/import-preview',async(req,res)=>{
  try{
    const file=req.body?.file;

    if(!file?.data){
      return res.status(400).json({
        success:false,
        error:'BUYLIST_IMPORT_FILE_REQUIRED',
        message:'Selecciona un archivo Excel.'
      });
    }

    const parsed=parseBuylistWorkbook(file);

    res.json({
      success:true,
      data:parsed
    });
  }catch(e){
    const code=String(e?.message||e);

    let message=code;

    if(code==='EMPTY_IMPORT_FILE')
      message='El archivo está vacío.';

    if(code==='IMPORT_FILE_TOO_LARGE')
      message='El archivo supera el límite permitido de 25 MB.';

    if(code==='BUYLIST_WORKBOOK_EMPTY')
      message='El archivo Excel no contiene hojas.';

    if(code==='BUYLIST_SHEET_EMPTY')
      message='La hoja de Buylist no contiene registros.';

    res.status(400).json({
      success:false,
      error:code,
      message
    });
  }
});
router.get('/',async(req,res)=>{try{const r=await listBuylists(req.query);res.json({success:true,data:r.rows});}catch(e){res.status(500).json({success:false,error:e.message});}});

/*
 * BUY-003
 * Plantilla Buylist XLSX nativa.
 *
 * IMPORTANTE:
 * Esta ruta debe permanecer ANTES de /:rowId para evitar que
 * Express interprete "template.xlsx" como un rowId.
 */
router.get('/template.xlsx',(_req,res)=>{
  try{
    const buffer=buildBuylistTemplate();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="SHINY_Buylist_Plantilla.xlsx"'
    );

    res.setHeader(
      'Content-Length',
      String(buffer.length)
    );

    res.status(200).end(buffer);

  }catch(e){
    bad(res,e,500);
  }
});
router.get('/:rowId',async(req,res)=>{try{const d=await getBuylist(Number(req.params.rowId));if(!d)return res.status(404).json({success:false,error:'BUYLIST_NOT_FOUND'});res.json({success:true,data:d});}catch(e){res.status(500).json({success:false,error:e.message});}});
router.post('/',async(req,res)=>{try{res.status(201).json({success:true,data:await createDraft(req.body||{})});}catch(e){bad(res,e);}});
router.post('/:rowId/decision',async(req,res)=>{try{res.json({success:true,data:await decide(Number(req.params.rowId),req.body||{})});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/pay',async(req,res)=>{try{res.json({success:true,data:await pay(Number(req.params.rowId))});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/convert',async(req,res)=>{try{res.json({success:true,data:await convert(Number(req.params.rowId))});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});
router.post('/:rowId/cancel',async(req,res)=>{try{res.json({success:true,data:await cancelBuylist(Number(req.params.rowId),String(req.body?.reason||''))});}catch(e){res.status(400).json({success:false,error:e.message,message:e.message});}});

export default router;
