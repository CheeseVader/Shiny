export function normalizeVisionText(v=''){
  return String(v||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{L}\p{N}#&+\-/. ]+/gu,' ')
    .replace(/\s+/g,' ')
    .trim();
}

export function visionQueries(result,{max=8}={}){
  if(result?.barcode)return [String(result.barcode).trim()].filter(Boolean);

  const rawLines=(result?.lines||[])
    .map(normalizeVisionText)
    .filter(x=>x.length>=3);

  const ranked=[...rawLines].sort((a,b)=>{
    const score=x=>{
      let s=Math.min(x.length,60);
      if(/\d/.test(x))s+=8;
      if(/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(x))s+=6;
      if(x.split(/\s+/).length>=2)s+=6;
      return s;
    };
    return score(b)-score(a);
  });

  const combined=normalizeVisionText(ranked.slice(0,3).join(' '));
  return [...new Set([
    ...ranked.slice(0,max-1),
    combined
  ].filter(Boolean))].slice(0,max);
}

export function scoreVisionCandidate(candidate,result){
  const hay=normalizeVisionText([
    candidate?.name,candidate?.nombre,candidate?.carta,candidate?.sku,
    candidate?.codigo_barras,candidate?.numero_completo,candidate?.set_nombre,
    candidate?.juego,candidate?.rareza
  ].filter(Boolean).join(' ')).toLowerCase();

  const queries=visionQueries(result,{max:10});
  if(result?.barcode){
    const b=String(result.barcode).trim().toLowerCase();
    return hay.includes(b)?1:0;
  }

  const tokens=[...new Set(
    queries.join(' ').toLowerCase().split(/\s+/).filter(x=>x.length>=3)
  )];
  if(!tokens.length)return 0;

  const hits=tokens.filter(t=>hay.includes(t)).length;
  const coverage=hits/tokens.length;

  let bonus=0;
  if(candidate?.numero_completo&&queries.some(q=>String(q).includes(String(candidate.numero_completo))))bonus+=0.2;
  if(candidate?.sku&&queries.some(q=>String(q).toLowerCase().includes(String(candidate.sku).toLowerCase())))bonus+=0.25;

  return Math.min(1,coverage+bonus);
}
