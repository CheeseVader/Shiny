
const fs=require('fs');
const path=require('path');
const {spawnSync}=require('child_process');

const root=process.argv[2]||'C:\\Users\\SrsGarciaEspinoza\\Videos\\Shiny';
const front=path.join(root,'frontend','src','pages','CommercialPage.jsx');
const back=path.join(root,'backend','src','repositories','commercialRepository.js');

for(const f of [front,back]){
  if(!fs.existsSync(f)){
    console.error(`No se encontró ${f}`);
    process.exit(2);
  }
}

const stamp=new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backups=[];

function backup(file,label){
  const b=`${file}.${label}_${stamp}.bak`;
  fs.copyFileSync(file,b);
  backups.push([file,b]);
}
function restore(){
  for(const [f,b] of backups){
    try{fs.copyFileSync(b,f);}catch(_){}
  }
}
function fail(msg){
  restore();
  console.error(msg);
  console.error('Los archivos fueron restaurados automáticamente.');
  process.exit(3);
}
function rep(src,a,b,label){
  const i=src.indexOf(a);
  if(i<0)fail(`No se encontró el ancla: ${label}`);
  return src.slice(0,i)+b+src.slice(i+a.length);
}

let fsrc=fs.readFileSync(front,'utf8');
if(!fsrc.includes('SHINY_DEV_001D_CONDICION_DESTINO')){
  backup(front,'DEV_001D');

  fsrc=rep(
    fsrc,
    "  const [returnQty,setReturnQty]=useState({});\n  const [returnOptions,setReturnOptions]=useState({reason:'',reintegrateStock:true,refund:false,refundMethod:'EFECTIVO',refundReference:'',notes:''});",
    "  const [returnQty,setReturnQty]=useState({});\n  const [returnCondition,setReturnCondition]=useState({});\n  // SHINY_DEV_001D_CONDICION_DESTINO\n  const [returnOptions,setReturnOptions]=useState({reason:'',refund:false,refundMethod:'EFECTIVO',refundReference:'',notes:''});",
    'estado devolución'
  );

  fsrc=fsrc.replace(
    "        setReturnOrder(r.data);\n        setReturnQty({});\n        setMessage('');",
    "        setReturnOrder(r.data);\n        setReturnQty({});\n        setReturnCondition(Object.fromEntries((r.data?.detalles||[]).map(d=>[d.id_detalle,'VENDIBLE'])));\n        setMessage('');"
  );
  fsrc=fsrc.replace("          reintegrateStock:true,\n","");

  fsrc=rep(
    fsrc,
    "      setReturnOrder(r.data);setReturnQty({});setMessage('');",
    "      setReturnOrder(r.data);setReturnQty({});setReturnCondition(Object.fromEntries((r.data?.detalles||[]).map(d=>[d.id_detalle,'VENDIBLE'])));setMessage('');",
    'loadReturnOrder init'
  );

  fsrc=rep(
    fsrc,
    "    const items=(returnOrder.detalles||[]).filter(d=>Number(returnQty[d.id_detalle]||0)>0).map(d=>({detailId:d.id_detalle,quantity:Number(returnQty[d.id_detalle])}));",
    `    const items=(returnOrder.detalles||[])
      .filter(d=>Number(returnQty[d.id_detalle]||0)>0)
      .map(d=>{
        const condition=String(returnCondition[d.id_detalle]||'VENDIBLE').toUpperCase();
        const destination=condition==='VENDIBLE'
          ?'INVENTARIO_DISPONIBLE'
          :condition==='DANADO'
            ?'MERMA'
            :condition==='DEFECTUOSO'
              ?'GARANTIA'
              :condition==='INCOMPLETO'
                ?'REVISION'
                :'NO_VENDIBLE';
        return {
          detailId:d.id_detalle,
          quantity:Number(returnQty[d.id_detalle]),
          condition,
          destination
        };
      });`,
    'payload items devolución'
  );

  fsrc=fsrc.replace(
    "      setReturnOrder(null);setReturnOrderId('');setReturnQty({});",
    "      setReturnOrder(null);setReturnOrderId('');setReturnQty({});setReturnCondition({});"
  );

  fsrc=rep(
    fsrc,
    "headers={['Tipo','Producto','SKU','Vendido','Devuelto','Disponible','Precio','Devolver']}>",
    "headers={['Tipo','Producto','SKU','Vendido','Devuelto','Disponible','Precio','Devolver','Condición','Destino']}>",
    'headers devoluciones'
  );

  const qtyCell=`<td><input className="qty-small" type="number" min="0" max={d.cantidad_disponible_devolver} disabled={Number(d.cantidad_disponible_devolver)<=0} value={returnQty[d.id_detalle]||0} onChange={e=>setReturnQty(x=>({...x,[d.id_detalle]:Math.min(Number(d.cantidad_disponible_devolver),Math.max(0,Number(e.target.value)||0))}))}/></td>`;
  const qtyReplacement=`<td><input className="qty-small" type="number" min="0" max={d.cantidad_disponible_devolver} disabled={Number(d.cantidad_disponible_devolver)<=0} value={returnQty[d.id_detalle]||0} onChange={e=>setReturnQty(x=>({...x,[d.id_detalle]:Math.min(Number(d.cantidad_disponible_devolver),Math.max(0,Number(e.target.value)||0))}))}/></td>
              <td>
                <select
                  value={returnCondition[d.id_detalle]||'VENDIBLE'}
                  disabled={Number(d.cantidad_disponible_devolver)<=0}
                  onChange={e=>setReturnCondition(x=>({...x,[d.id_detalle]:e.target.value}))}
                >
                  <option value="VENDIBLE">Vendible / Buen estado</option>
                  <option value="DANADO">Dañado</option>
                  <option value="DEFECTUOSO">Defectuoso</option>
                  <option value="INCOMPLETO">Incompleto</option>
                  <option value="NO_VENDIBLE">No vendible</option>
                </select>
              </td>
              <td>
                <small className="table-subline">
                  {(returnCondition[d.id_detalle]||'VENDIBLE')==='VENDIBLE'
                    ?'Inventario disponible'
                    :(returnCondition[d.id_detalle]||'')==='DANADO'
                      ?'Merma'
                      :(returnCondition[d.id_detalle]||'')==='DEFECTUOSO'
                        ?'Garantía'
                        :(returnCondition[d.id_detalle]||'')==='INCOMPLETO'
                          ?'Revisión'
                          :'No vendible'}
                </small>
              </td>`;
  fsrc=rep(fsrc,qtyCell,qtyReplacement,'celda cantidad devolución');

  const stockCheck=`            <label className="check-field"><input type="checkbox" checked={returnOptions.reintegrateStock} onChange={e=>setReturnOptions(x=>({...x,reintegrateStock:e.target.checked}))}/><span>Reintegrar stock</span></label>
`;
  fsrc=rep(fsrc,stockCheck,"",'checkbox Reintegrar stock');

  fs.writeFileSync(front,fsrc,'utf8');
}else{
  console.log('Frontend DEV-001D ya aplicado.');
}

let bsrc=fs.readFileSync(back,'utf8');
if(!bsrc.includes('SHINY_DEV_001D_CONDICION_DESTINO')){
  backup(back,'DEV_001D');

  bsrc=rep(
    bsrc,
    "      const itemType=String(det.tipo||'PRODUCTO').toUpperCase()==='TCG'?'TCG':'PRODUCTO';\n",
    `      const itemType=String(det.tipo||'PRODUCTO').toUpperCase()==='TCG'?'TCG':'PRODUCTO';
      // SHINY_DEV_001D_CONDICION_DESTINO
      const condition=String(x.condition||'VENDIBLE').trim().toUpperCase();
      const allowedConditions=new Set(['VENDIBLE','DANADO','DEFECTUOSO','INCOMPLETO','NO_VENDIBLE']);
      if(!allowedConditions.has(condition))throw new Error('RETURN_ITEM_CONDITION_INVALID');
      const destination=condition==='VENDIBLE'
        ?'INVENTARIO_DISPONIBLE'
        :condition==='DANADO'
          ?'MERMA'
          :condition==='DEFECTUOSO'
            ?'GARANTIA'
            :condition==='INCOMPLETO'
              ?'REVISION'
              :'NO_VENDIBLE';
      const reintegrateItem=condition==='VENDIBLE';
`,
    'itemType devolución'
  );

  bsrc=rep(
    bsrc,
    "      if(input.reintegrateStock!==false){",
    "      if(reintegrateItem){",
    'reintegrateStock backend'
  );

  bsrc=rep(
    bsrc,
`      await client.query(\`INSERT INTO shiny.devoluciones_detalle(
        id_devolucion,linea,id_detalle_pedido,tipo_item,id_producto,id_inventario,id_carta,sku,producto,
        cantidad,precio_unitario,importe,stock_anterior,stock_nuevo,id_sucursal,sucursal)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)\`,[`,
`      await client.query(\`INSERT INTO shiny.devoluciones_detalle(
        id_devolucion,linea,id_detalle_pedido,tipo_item,id_producto,id_inventario,id_carta,sku,producto,
        cantidad,precio_unitario,importe,stock_anterior,stock_nuevo,id_sucursal,sucursal,
        condicion_articulo,destino_articulo,reintegra_stock)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)\`,[`,
    'insert devoluciones_detalle columns'
  );

  bsrc=rep(
    bsrc,
`          branch.id_sucursal,branch.nombre_sucursal
        ]);`,
`          branch.id_sucursal,branch.nombre_sucursal,
          condition,destination,reintegrateItem
        ]);`,
    'insert devoluciones_detalle values'
  );

  bsrc=rep(
    bsrc,
    "    let refundRef=null;\n    if(input.refund===true){\n      const method=String(input.refundMethod||order.metodo_pago||'EFECTIVO').toUpperCase();",
    "    let refundRef=null;\n    let refundMethod=null;\n    if(input.refund===true){\n      refundMethod=String(input.refundMethod||order.metodo_pago||'EFECTIVO').toUpperCase();\n      const method=refundMethod;",
    'refund method scope'
  );

  bsrc=rep(
    bsrc,
`        input.refund===true?\`REEMBOLSO:\${refundRef}\`:'SIN_REEMBOLSO',
        input.reintegrateStock!==false,input.notes||null
      ]);`,
`        input.refund===true?\`REEMBOLSO:\${refundRef}\`:'SIN_REEMBOLSO',
        items.some(x=>String(x.condition||'VENDIBLE').toUpperCase()==='VENDIBLE'),input.notes||null
      ]);`,
    'header reintegra_stock'
  );

  const afterHeader=`      ]);
    await audit(client,user,'DEVOLUCIONES','CREAR',id,\`\${order.id_pedido} total \${total}\`);`;
  const afterHeaderReplacement=`      ]);

    if(input.refund===true && refundRef){
      const refundId=uid('REEMB');
      const idem='DEVOLUCION:'+id+':'+String(refundRef);
      const provider=refundMethod==='EFECTIVO'?'CAJA':(refundMethod==='TARJETA'?'MERCADO_PAGO':'LOCAL');
      await client.query(\`INSERT INTO shiny.devoluciones_reembolsos(
        id_reembolso,id_devolucion,id_pedido,fecha,metodo,proveedor,estado,monto,moneda,
        payment_id,refund_id_proveedor,idempotency_key,referencia,integracion_habilitada,
        id_admin_crea,usuario_crea,id_admin_autoriza,usuario_autoriza,fecha_autorizacion,
        error_codigo,error_detalle,fecha_actualizacion)
        VALUES($1,$2,$3,NOW(),$4,$5,'COMPLETADO',$6,'MXN',$7,$8,$9,$10,false,$11,$12,$11,$12,NOW(),NULL,NULL,NOW())
        ON CONFLICT DO NOTHING\`,[
          refundId,id,order.id_pedido,refundMethod,provider,refundTotal,
          txt(input.paymentId)||null,refundRef,idem,refundRef,
          user?.id_admin||'LOCAL',user?.nombre||user?.email||'Shiny Local'
        ]);
      await client.query(\`INSERT INTO shiny.devoluciones_eventos(
        id_evento,id_devolucion,id_reembolso,fecha,tipo,estado,detalle,id_admin,usuario)
        VALUES($1,$2,$3,NOW(),'REEMBOLSO_REGISTRADO','COMPLETADO',$4,$5,$6)\`,[
          uid('DEVEVT'),id,refundId,\`Reembolso \${refundMethod} por \${refundTotal}. Referencia \${refundRef}\`,
          user?.id_admin||'LOCAL',user?.nombre||user?.email||'Shiny Local'
        ]);
    }

    await audit(client,user,'DEVOLUCIONES','CREAR',id,\`\${order.id_pedido} total \${total}\`);`;
  bsrc=rep(bsrc,afterHeader,afterHeaderReplacement,'post header devolución');

  fs.writeFileSync(back,bsrc,'utf8');
}else{
  console.log('Backend DEV-001D ya aplicado.');
}

let c=spawnSync('node',['--check',back],{encoding:'utf8'});
if(c.status!==0){
  console.error(c.stdout||'');
  console.error(c.stderr||'');
  fail('Backend no pasó node --check.');
}

const frontendDir=path.join(root,'frontend');
let result;
if(process.platform==='win32'){
  result=spawnSync(process.env.ComSpec||'C:\\Windows\\System32\\cmd.exe',
    ['/d','/s','/c','npm run build'],
    {cwd:frontendDir,encoding:'utf8',windowsHide:true});
}else{
  result=spawnSync('npm',['run','build'],{cwd:frontendDir,encoding:'utf8'});
}
console.log(result.stdout||'');
if(result.stderr)console.error(result.stderr);
if(result.status!==0){
  fail('Frontend no compiló.');
}

console.log('DEV-001D aplicado y compilado correctamente.');
for(const [,b] of backups)console.log(`Backup: ${b}`);
