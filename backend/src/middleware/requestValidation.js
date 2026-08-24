const EMAIL_KEYS=new Set(['email','correo']);
const PHONE_KEYS=new Set(['telefono','phone','celular','mobile']);
const POSTAL_KEYS=new Set(['cp','zip','codigo_postal','postal_code']);
const NUMERIC_KEYS=/^(cantidad|stock|stock_minimo|precio|precio_venta|precio_oferta|costo|costo_unitario|orden|total_cartas|puntos|descuento|subtotal|total)$/i;
const CODE_KEYS=/^(sku|codigo|id|id_[a-z0-9_]+|numero_completo|numero_carta|numero_set|referencia)$/i;

function str(v){return String(v??'').trim();}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(v);}
function validPhone(v){
  const raw=str(v);
  if(!/^[+()\-\s\d.]+$/u.test(raw))return false;
  const digits=raw.replace(/\D/g,'');
  return digits.length>=10&&digits.length<=15;
}
function validPostal(v){return /^\d{5}$/u.test(str(v));}
function validCode(v){return /^[\p{L}\p{N}._/#:+\-]+$/u.test(str(v));}

function walk(value,path=[],errors=[]){
  if(value===null||value===undefined)return errors;
  if(Array.isArray(value)){
    value.forEach((x,i)=>walk(x,[...path,String(i)],errors));
    return errors;
  }
  if(typeof value!=='object')return errors;

  for(const [key,val] of Object.entries(value)){
    if(val&&typeof val==='object'){walk(val,[...path,key],errors);continue;}
    if(typeof val!=='string'&&typeof val!=='number')continue;

    const current=[...path,key].join('.');
    const text=str(val);
    if(typeof val==='string'&&/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(val)){
      errors.push({field:current,code:'CONTROL_CHARACTERS_NOT_ALLOWED'});continue;
    }
    if(typeof val==='string'&&val.length>200000&&key!=='data'){
      errors.push({field:current,code:'FIELD_TOO_LONG'});continue;
    }
    if(!text)continue;

    const lower=key.toLowerCase();
    if(EMAIL_KEYS.has(lower)&&!validEmail(text))errors.push({field:current,code:'INVALID_EMAIL'});
    else if(PHONE_KEYS.has(lower)&&!validPhone(text))errors.push({field:current,code:'INVALID_PHONE'});
    else if(POSTAL_KEYS.has(lower)&&!validPostal(text))errors.push({field:current,code:'INVALID_POSTAL_CODE'});
    else if(NUMERIC_KEYS.test(key)&&!Number.isFinite(Number(val)))errors.push({field:current,code:'INVALID_NUMBER'});
    else if(CODE_KEYS.test(key)&&typeof val==='string'&&!validCode(text))errors.push({field:current,code:'INVALID_CODE_FORMAT'});
  }
  return errors;
}

export function validateStructuredInput(req,res,next){
  if(!['POST','PUT','PATCH'].includes(req.method))return next();
  if(!req.is('application/json'))return next();
  const errors=walk(req.body);
  if(errors.length){
    return res.status(400).json({
      success:false,
      error:'INPUT_VALIDATION_FAILED',
      fields:errors.slice(0,20)
    });
  }
  next();
}
