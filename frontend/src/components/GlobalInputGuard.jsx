import { useEffect } from 'react';

function labelText(el){
  const label=el.closest('label');
  return String(label?.textContent||el.getAttribute('aria-label')||el.placeholder||el.name||'').trim();
}

function classify(el){
  const ignoredTypes=new Set([
    'radio',
    'checkbox',
    'hidden',
    'button',
    'submit',
    'reset',
    'file',
    'image',
    'range',
    'color'
  ]);

  if(el instanceof HTMLInputElement && ignoredTypes.has(el.type))return '';

  const key=`${el.name||''} ${labelText(el)} ${el.placeholder||''}`.toLowerCase();

  // SHINY-GLOBAL-INPUT-001 / DEV-001-UI-01:
  // Los campos de búsqueda/filtro son texto libre. No deben heredar validaciones
  // de email, teléfono, SKU, referencia, etc. sólo porque el placeholder enumere
  // los campos sobre los que busca (ej. "Pedido, cliente, teléfono, email...").
  const placeholder=String(el.placeholder||'').toLowerCase();
  const isExplicitTypedInput=el.type==='email'||el.type==='tel'||el.type==='number';
  const looksLikeFreeSearch=
    el.type==='search' ||
    /\b(buscar|búsqueda|busqueda|search|filtrar|filtro)\b/.test(key) ||
    (!isExplicitTypedInput && (
      (/pedido/.test(placeholder) && /cliente/.test(placeholder)) ||
      placeholder.split(',').filter(Boolean).length>=3
    ));

  if(looksLikeFreeSearch)return '';

  if(el.type==='email'||/\b(email|correo)\b/.test(key))return 'email';
  if(el.type==='tel'||/\b(teléfono|telefono|celular|phone|móvil|movil)\b/.test(key))return 'phone';
  if(/\b(código postal|codigo postal|\bcp\b|\bzip\b)\b/.test(key))return 'postal';
  if(el.type==='number')return 'number';
  if(/\b(sku|código|codigo|id sucursal|referencia)\b/.test(key))return 'code';
  if(/^(nombre completo|nombre del cliente|nombre receptor|nombre del administrador|titular|contacto)$/i.test(labelText(el)))return 'person';
  return '';
}

function sanitize(value,type){
  switch(type){
    case 'phone':
      return value.replace(/\D/g,'').slice(0,15);
    case 'postal':
      return value.replace(/\D/g,'').slice(0,5);
    case 'code':
      return value.replace(/[^\p{L}\p{N}._/#:+\-]/gu,'').slice(0,100);
    case 'person':
      return value.replace(/[^\p{L}\p{M}'’. -]/gu,'').replace(/\s{2,}/g,' ').slice(0,120);
    case 'email':
      return value.replace(/\s/g,'').slice(0,254);
    default:
      return value;
  }
}

function validate(el,type){
  const value=String(el.value||'').trim();
  if(!value&&!el.required)return '';
  if(type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(value))return 'Escribe un correo electrónico válido.';
  if(type==='phone'){
    const digits=value.replace(/\D/g,'');
    if(digits.length<10||digits.length>15)return 'El teléfono debe contener entre 10 y 15 dígitos.';
  }
  if(type==='postal'&&!/^\d{5}$/u.test(value))return 'El código postal debe contener 5 dígitos.';
  if(type==='person'&&/\d/u.test(value))return 'Este campo no admite números.';
  if(type==='code'&&!/^[\p{L}\p{N}._/#:+\-]+$/u.test(value))return 'El código contiene caracteres no permitidos.';
  if(type==='number'){
    const n=Number(value);
    if(value&&!Number.isFinite(n))return 'Escribe un valor numérico válido.';
    if(el.min!==''&&Number.isFinite(n)&&n<Number(el.min))return `El valor mínimo es ${el.min}.`;
    if(el.max!==''&&Number.isFinite(n)&&n>Number(el.max))return `El valor máximo es ${el.max}.`;
  }
  return '';
}

export default function GlobalInputGuard(){
  useEffect(()=>{
    function prepare(el){
      if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return;
      const type=classify(el);

      // React puede reutilizar el mismo nodo INPUT al cambiar de pestaña/vista.
      // Si antes era email/teléfono/código y ahora es búsqueda/texto libre,
      // eliminamos por completo la validación anterior.
      if(!type){
        delete el.dataset.shinyValidation;
        el.setCustomValidity('');
        return;
      }

      el.dataset.shinyValidation=type;
      if(type==='phone'){el.inputMode='numeric';el.maxLength=15;}
      if(type==='postal'){el.inputMode='numeric';el.maxLength=5;}
      if(type==='email'){el.autocapitalize='none';el.spellcheck=false;}
      if(type==='code'){el.autocapitalize='characters';el.spellcheck=false;}
    }

    function onInput(e){
      const el=e.target;
      if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return;
      prepare(el);
      const type=el.dataset.shinyValidation||'';
      if(!type)return;
      const cleaned=sanitize(el.value,type);
      if(cleaned!==el.value){
        const start=el.selectionStart;
        el.value=cleaned;
        el.dispatchEvent(new Event('change',{bubbles:true}));
        try{el.setSelectionRange(start,start);}catch{}
      }
      el.setCustomValidity(validate(el,type));
    }

    function onBlur(e){
      const el=e.target;
      if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return;
      prepare(el);
      const type=el.dataset.shinyValidation||'';
      el.setCustomValidity(validate(el,type));
    }

    function onSubmit(e){
      const form=e.target;
      if(!(form instanceof HTMLFormElement))return;
      const fields=[...form.querySelectorAll('input,textarea,select')];
      for(const el of fields){
        prepare(el);
        if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement){
          const type=el.dataset.shinyValidation||'';
          if(type)el.setCustomValidity(validate(el,type));
        }
        if(!el.checkValidity()){
          e.preventDefault();
          e.stopPropagation();
          el.reportValidity();
          window.shinyNotify?.(`${labelText(el)||'Campo'}: ${el.validationMessage||'valor no válido'}`,{type:'error',duration:6000});
          el.focus();
          return;
        }
      }
    }

    document.querySelectorAll('input,textarea').forEach(prepare);
    document.addEventListener('input',onInput,true);
    document.addEventListener('blur',onBlur,true);
    document.addEventListener('submit',onSubmit,true);

    const observer=new MutationObserver(records=>{
      for(const rec of records)for(const n of rec.addedNodes){
        if(!(n instanceof Element))continue;
        if(n.matches?.('input,textarea'))prepare(n);
        n.querySelectorAll?.('input,textarea').forEach(prepare);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true});

    return()=>{
      observer.disconnect();
      document.removeEventListener('input',onInput,true);
      document.removeEventListener('blur',onBlur,true);
      document.removeEventListener('submit',onSubmit,true);
    };
  },[]);

  return null;
}
