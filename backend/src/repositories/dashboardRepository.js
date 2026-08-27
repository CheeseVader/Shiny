import { query } from '../db.js';

const num=v=>Number(v||0);
const integer=v=>Math.max(1,Math.min(250,Math.trunc(Number(v)||100)));
const dashboardTables=['sucursales','pedidos','detalle_pedidos','productos','inventario_sucursales'];
let dashboardSchemaPromise=null;

function quotedIdentifier(value){
  const name=String(value||'');
  if(!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name))throw new Error('DASHBOARD_SCHEMA_INVALID');
  return `"${name.replace(/"/g,'""')}"`;
}

async function resolveDashboardSchema(){
  if(!dashboardSchemaPromise){
    dashboardSchemaPromise=query(`SELECT table_schema,COUNT(DISTINCT table_name)::int coincidencias
      FROM information_schema.tables
      WHERE table_name=ANY($1::text[])
        AND table_schema NOT IN ('pg_catalog','information_schema')
      GROUP BY table_schema
      ORDER BY COUNT(DISTINCT table_name) DESC,
        CASE WHEN table_schema=current_schema() THEN 0 ELSE 1 END,
        table_schema
      LIMIT 1`,[dashboardTables]).then(result=>{
        const row=result.rows[0];
        if(!row||Number(row.coincidencias)<dashboardTables.length)throw new Error('DASHBOARD_SCHEMA_NOT_FOUND');
        return quotedIdentifier(row.table_schema);
      }).catch(error=>{dashboardSchemaPromise=null;throw error;});
  }
  return dashboardSchemaPromise;
}

function scopeClause(column,branchId,scope,values){
  if(branchId){values.push(branchId);return `${column}=$${values.length}`;}
  if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){
    values.push(scope.allowed);return `${column}=ANY($${values.length}::text[])`;
  }
  return 'TRUE';
}
function rangeClause(column,from,to,values){
  const parts=[];
  if(from){values.push(from);parts.push(`${column} >= $${values.length}::date`);}
  if(to){values.push(to);parts.push(`${column} < ($${values.length}::date + INTERVAL '1 day')`);}
  return parts.length?parts.join(' AND '):'TRUE';
}
function paidExpr(alias='p'){
  return `(COALESCE(${alias}.venta_confirmada,false)=true OR ${alias}.fecha_pago IS NOT NULL OR UPPER(COALESCE(${alias}.estado_pedido,'')) IN ('PAGADO','PAGADA','PREPARANDO','ENVIADO','ENVIADA','ENTREGADO','ENTREGADA')) AND UPPER(COALESCE(${alias}.estado_pedido,'')) NOT IN ('CANCELADO','CANCELADA')`;
}

function previousRange(from,to){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||''))return null;
  const start=new Date(`${from}T00:00:00Z`),end=new Date(`${to}T00:00:00Z`);
  if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<start)return null;
  const days=Math.floor((end-start)/86400000)+1;
  const previousTo=new Date(start.getTime()-86400000);
  const previousFrom=new Date(start.getTime()-(days*86400000));
  return {from:previousFrom.toISOString().slice(0,10),to:previousTo.toISOString().slice(0,10)};
}

function productSalesSql(schema,orderBy='unidades DESC,ventas DESC'){
  return `SELECT
      COALESCE(NULLIF(d.producto,''),NULLIF(d.sku,''),NULLIF(d.id_producto,''),NULLIF(d.id_inventario,''),'Producto') producto,
      COALESCE(d.sku,'') sku,
      COALESCE(SUM(d.cantidad),0)::bigint unidades,
      COALESCE(SUM(
        CASE WHEN COALESCE(d.subtotal,0)>0 THEN d.subtotal
        ELSE COALESCE(d.cantidad,0)*COALESCE(NULLIF(d.precio_unitario,0),NULLIF(d.precio,0),0) END
      ),0)::numeric ventas,
      COALESCE(SUM(COALESCE(d.cantidad,0)*CASE
        WHEN UPPER(COALESCE(d.tipo,''))='TCG' THEN COALESCE(ti.costo,0)
        ELSE COALESCE(pr.costo,0) END),0)::numeric costo,
      COALESCE(SUM(
        CASE WHEN COALESCE(d.subtotal,0)>0 THEN d.subtotal
        ELSE COALESCE(d.cantidad,0)*COALESCE(NULLIF(d.precio_unitario,0),NULLIF(d.precio,0),0) END
        - COALESCE(d.cantidad,0)*CASE
          WHEN UPPER(COALESCE(d.tipo,''))='TCG' THEN COALESCE(ti.costo,0)
          ELSE COALESCE(pr.costo,0) END
      ),0)::numeric utilidad,
      CASE WHEN BOOL_OR(UPPER(COALESCE(d.tipo,''))='TCG') THEN 'TCG' ELSE 'PRODUCTO' END tipo
    FROM ${schema}.detalle_pedidos d
    JOIN ${schema}.pedidos p ON p.id_pedido=d.id_pedido
    LEFT JOIN ${schema}.productos pr ON pr.id=d.id_producto
    LEFT JOIN ${schema}.tcg_inventario ti ON ti.id_inventario=d.id_inventario
    WHERE __SCOPE__ AND __RANGE__ AND ${paidExpr('p')}
    GROUP BY COALESCE(NULLIF(d.producto,''),NULLIF(d.sku,''),NULLIF(d.id_producto,''),NULLIF(d.id_inventario,''),'Producto'),COALESCE(d.sku,'')
    ORDER BY ${orderBy} LIMIT __LIMIT__`;
}

export async function dashboardSummary({branchId='',from='',to=''}={},scope){
  const schema=await resolveDashboardSchema();
  const branchesValues=[];
  let branchesWhere='COALESCE(activa,true)=true';
  if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){
    branchesValues.push(scope.allowed);
    branchesWhere+=` AND id_sucursal=ANY($${branchesValues.length}::text[])`;
  }
  const branchesPromise=query(`SELECT id_sucursal,nombre_sucursal,codigo FROM ${schema}.sucursales WHERE ${branchesWhere} ORDER BY nombre_sucursal`,branchesValues);

  const sv=[];
  const salesScope=scopeClause('p.id_sucursal',branchId,scope,sv);
  const salesRange=rangeClause('p.fecha',from,to,sv);
  const salesPromise=query(`SELECT
      COUNT(*)::bigint pedidos,
      COALESCE(SUM(p.total),0)::numeric ventas,
      COALESCE(AVG(p.total),0)::numeric ticket_promedio,
      COUNT(DISTINCT NULLIF(p.id_cliente,''))::bigint clientes_compradores,
      COALESCE(SUM(p.subtotal),0)::numeric subtotal
    FROM ${schema}.pedidos p
    WHERE ${salesScope} AND ${salesRange} AND ${paidExpr('p')}`,sv);

  const costValues=[];
  const costScope=scopeClause('p.id_sucursal',branchId,scope,costValues);
  const costRange=rangeClause('p.fecha',from,to,costValues);
  const costPromise=query(`SELECT COALESCE(SUM(COALESCE(d.cantidad,0)*CASE
      WHEN UPPER(COALESCE(d.tipo,''))='TCG' THEN COALESCE(ti.costo,0)
      ELSE COALESCE(pr.costo,0) END),0)::numeric costo_ventas
    FROM ${schema}.detalle_pedidos d
    JOIN ${schema}.pedidos p ON p.id_pedido=d.id_pedido
    LEFT JOIN ${schema}.productos pr ON pr.id=d.id_producto
    LEFT JOIN ${schema}.tcg_inventario ti ON ti.id_inventario=d.id_inventario
    WHERE ${costScope} AND ${costRange} AND ${paidExpr('p')}`,costValues);

  const previous=previousRange(from,to);
  let previousSalesPromise=Promise.resolve({rows:[{ventas:0}]});
  if(previous){
    const previousValues=[];
    const previousScope=scopeClause('p.id_sucursal',branchId,scope,previousValues);
    const previousDateRange=rangeClause('p.fecha',previous.from,previous.to,previousValues);
    previousSalesPromise=query(`SELECT COALESCE(SUM(p.total),0)::numeric ventas
      FROM ${schema}.pedidos p
      WHERE ${previousScope} AND ${previousDateRange} AND ${paidExpr('p')}`,previousValues);
  }

  const trendValues=[];
  const trendScope=scopeClause('p.id_sucursal',branchId,scope,trendValues);
  const trendRange=rangeClause('p.fecha',from,to,trendValues);
  const trendPromise=query(`WITH pedidos_periodo AS (
      SELECT p.id_pedido,p.fecha::date fecha,COALESCE(p.total,0)::numeric total
      FROM ${schema}.pedidos p
      WHERE ${trendScope} AND ${trendRange} AND ${paidExpr('p')}
    ),costos_pedido AS (
      SELECT d.id_pedido,COALESCE(SUM(COALESCE(d.cantidad,0)*CASE
        WHEN UPPER(COALESCE(d.tipo,''))='TCG' THEN COALESCE(ti.costo,0)
        ELSE COALESCE(pr.costo,0) END),0)::numeric costo
      FROM ${schema}.detalle_pedidos d
      JOIN pedidos_periodo pp ON pp.id_pedido=d.id_pedido
      LEFT JOIN ${schema}.productos pr ON pr.id=d.id_producto
      LEFT JOIN ${schema}.tcg_inventario ti ON ti.id_inventario=d.id_inventario
      GROUP BY d.id_pedido
    )
    SELECT pp.fecha,COUNT(*)::bigint pedidos,COALESCE(SUM(pp.total),0)::numeric ventas,
      COALESCE(SUM(pp.total-COALESCE(cp.costo,0)),0)::numeric utilidad
    FROM pedidos_periodo pp
    LEFT JOIN costos_pedido cp ON cp.id_pedido=pp.id_pedido
    GROUP BY pp.fecha ORDER BY pp.fecha`,trendValues);

  const topValues=[];
  const topScope=scopeClause('p.id_sucursal',branchId,scope,topValues);
  const topRange=rangeClause('p.fecha',from,to,topValues);
  const topPromise=query(productSalesSql(schema)
    .replace('__SCOPE__',topScope).replace('__RANGE__',topRange).replace('__LIMIT__','8'),topValues);

  const leastValues=[];
  const leastScope=scopeClause('p.id_sucursal',branchId,scope,leastValues);
  const leastRange=rangeClause('p.fecha',from,to,leastValues);
  const leastPromise=query(productSalesSql(schema,'unidades ASC,ventas ASC,producto ASC')
    .replace('__SCOPE__',leastScope).replace('__RANGE__',leastRange).replace('__LIMIT__','8'),leastValues);

  const profitValues=[];
  const profitScope=scopeClause('p.id_sucursal',branchId,scope,profitValues);
  const profitRange=rangeClause('p.fecha',from,to,profitValues);
  const profitPromise=query(productSalesSql(schema,'utilidad DESC,ventas DESC')
    .replace('__SCOPE__',profitScope).replace('__RANGE__',profitRange).replace('__LIMIT__','1'),profitValues);

  const inventoryValues=[];
  const inventoryScope=scopeClause('i.id_sucursal',branchId,scope,inventoryValues);
  const inventoryPromise=query(`SELECT
      COUNT(*)::bigint registros,
      COALESCE(SUM(i.stock),0)::bigint unidades,
      COUNT(*) FILTER (WHERE COALESCE(i.stock,0)<=0)::bigint agotados,
      COUNT(*) FILTER (WHERE COALESCE(i.stock,0)>0 AND COALESCE(i.stock,0)<=COALESCE(i.stock_minimo,0))::bigint bajo_minimo
    FROM ${schema}.inventario_sucursales i WHERE ${inventoryScope}`,inventoryValues);

  const valueValues=[];
  const valueProductScope=scopeClause('i.id_sucursal',branchId,scope,valueValues);
  const valueTcgScope=scopeClause('s.id_sucursal',branchId,scope,valueValues);
  const inventoryValuePromise=query(`SELECT
      COALESCE((SELECT SUM(GREATEST(COALESCE(i.stock,0),0)*COALESCE(p.costo,0))
        FROM ${schema}.inventario_sucursales i
        LEFT JOIN ${schema}.productos p ON p.id=i.id_producto
        WHERE ${valueProductScope}),0)
      + COALESCE((SELECT SUM(GREATEST(COALESCE(s.stock,0)-COALESCE(s.stock_reservado,0),0)*COALESCE(t.costo,0))
        FROM ${schema}.tcg_inventario_sucursales s
        LEFT JOIN ${schema}.tcg_inventario t ON t.id_inventario=s.id_inventario
        WHERE ${valueTcgScope}),0) AS valor`,valueValues);

  const movementValues=[];
  const movementScope=scopeClause('i.id_sucursal',branchId,scope,movementValues);
  const noMovementPromise=query(`WITH ultima_venta AS (
      SELECT d.id_producto,p.id_sucursal,MAX(p.fecha) ultima_venta
      FROM ${schema}.detalle_pedidos d
      JOIN ${schema}.pedidos p ON p.id_pedido=d.id_pedido
      WHERE d.id_producto IS NOT NULL AND ${paidExpr('p')}
      GROUP BY d.id_producto,p.id_sucursal
    )
    SELECT COUNT(*)::bigint total,
      COALESCE(SUM(GREATEST(COALESCE(i.stock,0),0)*COALESCE(pr.costo,0)),0)::numeric capital
    FROM ${schema}.inventario_sucursales i
    LEFT JOIN ${schema}.productos pr ON pr.id=i.id_producto
    LEFT JOIN ultima_venta u ON u.id_producto=i.id_producto AND u.id_sucursal=i.id_sucursal
    WHERE ${movementScope} AND COALESCE(i.stock,0)>0
      AND COALESCE(u.ultima_venta,pr.fecha_creacion,i.fecha_actualizacion,NOW())<CURRENT_DATE-INTERVAL '30 days'`,movementValues);

  const tcgValues=[];
  const tcgScope=scopeClause('t.id_sucursal',branchId,scope,tcgValues);
  const tcgPromise=query(`SELECT COUNT(*)::bigint variantes,COALESCE(SUM(t.stock),0)::bigint unidades,
      COALESCE(SUM(GREATEST(0,COALESCE(t.stock,0)-COALESCE(t.stock_reservado,0))),0)::bigint disponibles
    FROM ${schema}.tcg_inventario_sucursales t WHERE ${tcgScope}`,tcgValues);

  const clientValues=[];
  const clientRange=rangeClause('c.fecha_registro',from,to,clientValues);
  const clientsPromise=query(`SELECT COUNT(*)::bigint total_periodo FROM ${schema}.clientes c WHERE ${clientRange}`,clientValues);

  const buyValues=[];
  const buyScope=scopeClause('b.id_sucursal',branchId,scope,buyValues);
  const buyRange=rangeClause('b.fecha',from,to,buyValues);
  const buylistPromise=query(`SELECT
      COUNT(*)::bigint total,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(b.estado,'')) IN ('PENDIENTE','NUEVA','VALUADA','ACEPTADA','CONVIRTIENDO'))::bigint pendientes,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(b.estado_pago,''))='PAGADO')::bigint pagadas,
      COALESCE(SUM(b.oferta_total) FILTER (WHERE UPPER(COALESCE(b.estado_pago,''))='PAGADO'),0)::numeric monto_pagado
    FROM ${schema}.tcg_buylist b WHERE ${buyScope} AND ${buyRange}`,buyValues);

  const cashValues=[];
  const cashScope=scopeClause('c.id_sucursal',branchId,scope,cashValues);
  const cashPromise=query(`SELECT COUNT(*) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA')::bigint abiertas,
      COALESCE(SUM(c.ingresos_efectivo) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA'),0)::numeric ingresos,
      COALESCE(SUM(c.egresos_efectivo) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA'),0)::numeric egresos
    FROM ${schema}.caja_sesiones c WHERE ${cashScope}`,cashValues);

  const alertValues=[];
  let alertScope='TRUE';
  if(branchId){alertValues.push(branchId);alertScope=`(a.id_sucursal IS NULL OR a.id_sucursal=$${alertValues.length})`;}
  else if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){alertValues.push(scope.allowed);alertScope=`(a.id_sucursal IS NULL OR a.id_sucursal=ANY($${alertValues.length}::text[]))`;}
  const alertsPromise=query(`SELECT COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false)::bigint abiertas,
      COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false AND COALESCE(a.leida,false)=false)::bigint no_leidas,
      COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false AND UPPER(COALESCE(a.prioridad,''))='CRITICA')::bigint criticas
    FROM ${schema}.notificaciones_admin a WHERE ${alertScope}`,alertValues);

  const recentValues=[];
  const recentScope=scopeClause('p.id_sucursal',branchId,scope,recentValues);
  const recentPromise=query(`SELECT p.id_pedido,p.fecha,p.nombre_cliente,p.sucursal,p.total,p.metodo_pago,p.estado_pedido,p.canal_venta
    FROM ${schema}.pedidos p WHERE ${recentScope} ORDER BY p.fecha DESC NULLS LAST LIMIT 8`,recentValues);

  const statusValues=[];
  const statusScope=scopeClause('p.id_sucursal',branchId,scope,statusValues);
  const statusRange=rangeClause('p.fecha',from,to,statusValues);
  const orderStatusPromise=query(`SELECT CASE
      WHEN UPPER(COALESCE(p.estado_pedido,'')) IN ('PAGADO','PAGADA','PREPARANDO','ENVIADO','ENVIADA','ENTREGADO','ENTREGADA') THEN 'PAGADOS'
      WHEN UPPER(COALESCE(p.estado_pedido,'')) IN ('CANCELADO','CANCELADA') THEN 'CANCELADOS'
      WHEN UPPER(COALESCE(p.estado_pedido,'')) IN ('PENDIENTE','NUEVO','NUEVA','ABIERTO','ABIERTA') THEN 'PENDIENTES'
      ELSE 'OTROS' END estado,COUNT(*)::bigint total
    FROM ${schema}.pedidos p
    WHERE ${statusScope} AND ${statusRange}
    GROUP BY 1 ORDER BY total DESC`,statusValues);

  const purchaseValues=[];
  const purchaseScope=scopeClause('c.id_sucursal_recepcion',branchId,scope,purchaseValues);
  const purchaseRange=rangeClause('c.fecha',from,to,purchaseValues);
  const purchasesPromise=query(`SELECT COUNT(*)::bigint total,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(c.estado,'')) NOT IN ('RECIBIDA','CANCELADA'))::bigint pendientes,
      COALESCE(SUM(c.total) FILTER (WHERE UPPER(COALESCE(c.estado,''))<>'CANCELADA'),0)::numeric monto
    FROM ${schema}.compras c WHERE ${purchaseScope} AND ${purchaseRange}`,purchaseValues);

  const [branches,sales,cost,previousSales,trend,top,least,profit,inventory,inventoryValue,noMovement,tcg,clients,buylist,cash,alerts,recent,orderStatus,purchases]=await Promise.all([
    branchesPromise,salesPromise,costPromise,previousSalesPromise,trendPromise,topPromise,leastPromise,profitPromise,
    inventoryPromise,inventoryValuePromise,noMovementPromise,tcgPromise,clientsPromise,buylistPromise,cashPromise,alertsPromise,recentPromise,orderStatusPromise,purchasesPromise
  ]);

  const s=sales.rows[0]||{},i=inventory.rows[0]||{},t=tcg.rows[0]||{},b=buylist.rows[0]||{},c=cash.rows[0]||{},a=alerts.rows[0]||{},cl=clients.rows[0]||{},pu=purchases.rows[0]||{};
  const currentSales=num(s.ventas),costOfSales=num(cost.rows[0]?.costo_ventas),grossProfit=currentSales-costOfSales;
  const previousSalesTotal=num(previousSales.rows[0]?.ventas);
  const salesChange=previousSalesTotal>0?((currentSales-previousSalesTotal)/previousSalesTotal)*100:(currentSales>0?100:0);
  const noMove=noMovement.rows[0]||{};
  const normalizeProduct=x=>x?{...x,unidades:num(x.unidades),ventas:num(x.ventas),costo:num(x.costo),utilidad:num(x.utilidad),margen:num(x.ventas)>0?(num(x.utilidad)/num(x.ventas))*100:0}:null;
  return {
    generatedAt:new Date().toISOString(),filters:{branchId,from,to},branches:branches.rows,
    kpis:{ventas:currentSales,ventasAnteriores:previousSalesTotal,variacionVentas:salesChange,costoVentas:costOfSales,utilidadBruta:grossProfit,margenBruto:currentSales>0?(grossProfit/currentSales)*100:0,pedidos:num(s.pedidos),ticketPromedio:num(s.ticket_promedio),clientesCompradores:num(s.clientes_compradores),clientesNuevos:num(cl.total_periodo),valorInventario:num(inventoryValue.rows[0]?.valor),stockBajo:num(i.bajo_minimo),agotados:num(i.agotados),sinMovimiento:num(noMove.total),capitalDetenido:num(noMove.capital),alertas:num(a.abiertas)},
    salesTrend:trend.rows.map(x=>({...x,ventas:num(x.ventas),utilidad:num(x.utilidad),pedidos:num(x.pedidos)})),
    topProducts:top.rows.map(normalizeProduct),
    leastProducts:least.rows.map(normalizeProduct),
    orderStatus:orderStatus.rows.map(x=>({estado:x.estado,total:num(x.total)})),
    productPerformance:{masVendido:normalizeProduct(top.rows[0]),menosVendido:normalizeProduct(least.rows[0]),mayorUtilidad:normalizeProduct(profit.rows[0]),capitalDetenido:num(noMove.capital),sinMovimiento:num(noMove.total)},
    inventory:{registros:num(i.registros),unidades:num(i.unidades),bajoMinimo:num(i.bajo_minimo),agotados:num(i.agotados),valor:num(inventoryValue.rows[0]?.valor)},
    tcg:{variantes:num(t.variantes),unidades:num(t.unidades),disponibles:num(t.disponibles)},
    buylist:{total:num(b.total),pendientes:num(b.pendientes),pagadas:num(b.pagadas),montoPagado:num(b.monto_pagado)},
    cash:{abiertas:num(c.abiertas),ingresos:num(c.ingresos),egresos:num(c.egresos)},
    alerts:{abiertas:num(a.abiertas),noLeidas:num(a.no_leidas),criticas:num(a.criticas)},
    purchases:{total:num(pu.total),pendientes:num(pu.pendientes),monto:num(pu.monto)},
    recentOrders:recent.rows
  };
}

export async function dashboardDetails(kind,{branchId='',q='',limit=100}={},scope){
  const schema=await resolveDashboardSchema();
  const detailKind=String(kind||'').trim().toLowerCase();
  const search=String(q||'').trim();
  const maxRows=integer(limit);

  if(detailKind==='stock-low'){
    const values=[];
    const branchWhere=scopeClause('i.id_sucursal',branchId,scope,values);
    let searchWhere='TRUE';
    if(search){values.push(`%${search}%`);searchWhere=`(COALESCE(i.producto,'') ILIKE $${values.length} OR COALESCE(i.sku,'') ILIKE $${values.length} OR COALESCE(i.sucursal,'') ILIKE $${values.length})`;}
    values.push(maxRows);
    const result=await query(`SELECT COUNT(*) OVER()::bigint total_resultados,
        i.id_producto,i.sku,i.producto,i.id_sucursal,i.sucursal,
        COALESCE(i.stock,0)::bigint stock,COALESCE(i.stock_minimo,0)::bigint stock_minimo,
        CASE WHEN COALESCE(i.stock,0)<=0 THEN 'AGOTADO' ELSE 'STOCK_BAJO' END estado,
        i.fecha_actualizacion
      FROM ${schema}.inventario_sucursales i
      WHERE ${branchWhere} AND ${searchWhere}
        AND (COALESCE(i.stock,0)<=0 OR (COALESCE(i.stock,0)>0 AND COALESCE(i.stock,0)<=COALESCE(i.stock_minimo,0)))
      ORDER BY CASE WHEN COALESCE(i.stock,0)<=0 THEN 0 ELSE 1 END,i.stock ASC,i.producto
      LIMIT $${values.length}`,values);
    return {kind:detailKind,total:num(result.rows[0]?.total_resultados),items:result.rows.map(({total_resultados,...x})=>x)};
  }

  if(detailKind==='no-movement'){
    const values=[];
    const branchWhere=scopeClause('i.id_sucursal',branchId,scope,values);
    let searchWhere='TRUE';
    if(search){values.push(`%${search}%`);searchWhere=`(COALESCE(i.producto,'') ILIKE $${values.length} OR COALESCE(i.sku,'') ILIKE $${values.length} OR COALESCE(i.sucursal,'') ILIKE $${values.length})`;}
    values.push(maxRows);
    const result=await query(`WITH ultima_venta AS (
        SELECT d.id_producto,p.id_sucursal,MAX(p.fecha) ultima_venta
        FROM ${schema}.detalle_pedidos d
        JOIN ${schema}.pedidos p ON p.id_pedido=d.id_pedido
        WHERE d.id_producto IS NOT NULL AND ${paidExpr('p')}
        GROUP BY d.id_producto,p.id_sucursal
      )
      SELECT COUNT(*) OVER()::bigint total_resultados,
        i.id_producto,i.sku,i.producto,i.id_sucursal,i.sucursal,
        COALESCE(i.stock,0)::bigint stock,COALESCE(pr.costo,0)::numeric costo,
        (GREATEST(COALESCE(i.stock,0),0)*COALESCE(pr.costo,0))::numeric capital_detenido,
        u.ultima_venta,
        GREATEST(0,CURRENT_DATE-COALESCE(u.ultima_venta::date,pr.fecha_creacion::date,i.fecha_actualizacion::date,CURRENT_DATE))::int dias_sin_venta
      FROM ${schema}.inventario_sucursales i
      LEFT JOIN ${schema}.productos pr ON pr.id=i.id_producto
      LEFT JOIN ultima_venta u ON u.id_producto=i.id_producto AND u.id_sucursal=i.id_sucursal
      WHERE ${branchWhere} AND ${searchWhere} AND COALESCE(i.stock,0)>0
        AND COALESCE(u.ultima_venta,pr.fecha_creacion,i.fecha_actualizacion,NOW())<CURRENT_DATE-INTERVAL '30 days'
      ORDER BY dias_sin_venta DESC,capital_detenido DESC,i.producto
      LIMIT $${values.length}`,values);
    return {kind:detailKind,total:num(result.rows[0]?.total_resultados),items:result.rows.map(({total_resultados,...x})=>({...x,costo:num(x.costo),capital_detenido:num(x.capital_detenido),dias_sin_venta:num(x.dias_sin_venta)}))};
  }

  if(detailKind==='alerts'){
    const values=[];
    let branchWhere='TRUE';
    if(branchId){values.push(branchId);branchWhere=`(a.id_sucursal IS NULL OR a.id_sucursal=$${values.length})`;}
    else if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){values.push(scope.allowed);branchWhere=`(a.id_sucursal IS NULL OR a.id_sucursal=ANY($${values.length}::text[]))`;}
    let searchWhere='TRUE';
    if(search){values.push(`%${search}%`);searchWhere=`(COALESCE(a.titulo,'') ILIKE $${values.length} OR COALESCE(a.mensaje,'') ILIKE $${values.length} OR COALESCE(a.sucursal,'') ILIKE $${values.length} OR COALESCE(a.tipo,'') ILIKE $${values.length})`;}
    values.push(maxRows);
    const result=await query(`SELECT COUNT(*) OVER()::bigint total_resultados,
        a.id,a.fecha,a.tipo,a.titulo,a.mensaje,a.modulo,a.prioridad,a.leida,
        a.id_sucursal,a.sucursal,a.referencia,a.ruta,a.ultima_deteccion
      FROM ${schema}.notificaciones_admin a
      WHERE ${branchWhere} AND ${searchWhere} AND COALESCE(a.resuelta,false)=false
      ORDER BY CASE UPPER(COALESCE(a.prioridad,'')) WHEN 'CRITICA' THEN 0 WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END,
        COALESCE(a.ultima_deteccion,a.fecha) DESC
      LIMIT $${values.length}`,values);
    return {kind:detailKind,total:num(result.rows[0]?.total_resultados),items:result.rows.map(({total_resultados,...x})=>x)};
  }

  const error=new Error('DASHBOARD_DETAIL_KIND_INVALID');
  error.status=400;
  throw error;
}
