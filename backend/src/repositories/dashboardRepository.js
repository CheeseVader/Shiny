import { query } from '../db.js';

const num=v=>Number(v||0);

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

export async function dashboardSummary({branchId='',from='',to=''}={},scope){
  const branchesValues=[];
  let branchesWhere='COALESCE(activa,true)=true';
  if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){
    branchesValues.push(scope.allowed);
    branchesWhere+=` AND id_sucursal=ANY($${branchesValues.length}::text[])`;
  }
  const branchesPromise=query(`SELECT id_sucursal,nombre_sucursal,codigo FROM gmx.sucursales WHERE ${branchesWhere} ORDER BY nombre_sucursal`,branchesValues);

  const sv=[];
  const salesScope=scopeClause('p.id_sucursal',branchId,scope,sv);
  const salesRange=rangeClause('p.fecha',from,to,sv);
  const salesPromise=query(`SELECT
      COUNT(*)::bigint pedidos,
      COALESCE(SUM(p.total),0)::numeric ventas,
      COALESCE(AVG(p.total),0)::numeric ticket_promedio,
      COUNT(DISTINCT NULLIF(p.id_cliente,''))::bigint clientes_compradores,
      COALESCE(SUM(p.subtotal),0)::numeric subtotal
    FROM gmx.pedidos p
    WHERE ${salesScope} AND ${salesRange} AND ${paidExpr('p')}`,sv);

  const trendValues=[];
  const trendScope=scopeClause('p.id_sucursal',branchId,scope,trendValues);
  const trendRange=rangeClause('p.fecha',from,to,trendValues);
  const trendPromise=query(`SELECT p.fecha::date fecha,COUNT(*)::bigint pedidos,COALESCE(SUM(p.total),0)::numeric ventas
    FROM gmx.pedidos p
    WHERE ${trendScope} AND ${trendRange} AND ${paidExpr('p')}
    GROUP BY p.fecha::date ORDER BY p.fecha::date`,trendValues);

  const topValues=[];
  const topScope=scopeClause('p.id_sucursal',branchId,scope,topValues);
  const topRange=rangeClause('p.fecha',from,to,topValues);
  const topPromise=query(`SELECT
      COALESCE(NULLIF(d.producto,''),NULLIF(d.sku,''),NULLIF(d.id_producto,''),NULLIF(d.id_inventario,''),'Producto') producto,
      COALESCE(d.sku,'') sku,
      COALESCE(SUM(d.cantidad),0)::bigint unidades,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(d.subtotal,0) > 0 THEN d.subtotal
          ELSE COALESCE(d.cantidad,0) * COALESCE(NULLIF(d.precio_unitario,0),NULLIF(d.precio,0),0)
        END
      ),0)::numeric ventas,
      CASE WHEN BOOL_OR(UPPER(COALESCE(d.tipo,''))='TCG') THEN 'TCG' ELSE 'PRODUCTO' END tipo
    FROM gmx.detalle_pedidos d
    JOIN gmx.pedidos p ON p.id_pedido=d.id_pedido
    WHERE ${topScope} AND ${topRange} AND ${paidExpr('p')}
    GROUP BY COALESCE(NULLIF(d.producto,''),NULLIF(d.sku,''),NULLIF(d.id_producto,''),NULLIF(d.id_inventario,''),'Producto'),COALESCE(d.sku,'')
    ORDER BY unidades DESC,ventas DESC LIMIT 8`,topValues);

  const inventoryValues=[];
  const inventoryScope=scopeClause('i.id_sucursal',branchId,scope,inventoryValues);
  const inventoryPromise=query(`SELECT
      COUNT(*)::bigint registros,
      COALESCE(SUM(i.stock),0)::bigint unidades,
      COUNT(*) FILTER (WHERE COALESCE(i.stock,0)<=0)::bigint agotados,
      COUNT(*) FILTER (WHERE COALESCE(i.stock,0)>0 AND COALESCE(i.stock,0)<=COALESCE(i.stock_minimo,0))::bigint bajo_minimo
    FROM gmx.inventario_sucursales i WHERE ${inventoryScope}`,inventoryValues);

  const tcgValues=[];
  const tcgScope=scopeClause('t.id_sucursal',branchId,scope,tcgValues);
  const tcgPromise=query(`SELECT COUNT(*)::bigint variantes,COALESCE(SUM(t.stock),0)::bigint unidades,
      COALESCE(SUM(GREATEST(0,COALESCE(t.stock,0)-COALESCE(t.stock_reservado,0))),0)::bigint disponibles
    FROM gmx.tcg_inventario_sucursales t WHERE ${tcgScope}`,tcgValues);

  const clientValues=[];
  const clientRange=rangeClause('c.fecha_registro',from,to,clientValues);
  const clientsPromise=query(`SELECT COUNT(*)::bigint total_periodo FROM gmx.clientes c WHERE ${clientRange}`,clientValues);

  const buyValues=[];
  const buyScope=scopeClause('b.id_sucursal',branchId,scope,buyValues);
  const buyRange=rangeClause('b.fecha',from,to,buyValues);
  const buylistPromise=query(`SELECT
      COUNT(*)::bigint total,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(b.estado,'')) IN ('PENDIENTE','NUEVA','VALUADA','ACEPTADA','CONVIRTIENDO'))::bigint pendientes,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(b.estado_pago,''))='PAGADO')::bigint pagadas,
      COALESCE(SUM(b.oferta_total) FILTER (WHERE UPPER(COALESCE(b.estado_pago,''))='PAGADO'),0)::numeric monto_pagado
    FROM gmx.tcg_buylist b WHERE ${buyScope} AND ${buyRange}`,buyValues);

  const cashValues=[];
  const cashScope=scopeClause('c.id_sucursal',branchId,scope,cashValues);
  const cashPromise=query(`SELECT COUNT(*) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA')::bigint abiertas,
      COALESCE(SUM(c.ingresos_efectivo) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA'),0)::numeric ingresos,
      COALESCE(SUM(c.egresos_efectivo) FILTER (WHERE UPPER(COALESCE(c.estado,''))='ABIERTA'),0)::numeric egresos
    FROM gmx.caja_sesiones c WHERE ${cashScope}`,cashValues);

  const alertValues=[];
  let alertScope='TRUE';
  if(branchId){alertValues.push(branchId);alertScope=`(a.id_sucursal IS NULL OR a.id_sucursal=$${alertValues.length})`;}
  else if(scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length){alertValues.push(scope.allowed);alertScope=`(a.id_sucursal IS NULL OR a.id_sucursal=ANY($${alertValues.length}::text[]))`;}
  const alertsPromise=query(`SELECT COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false)::bigint abiertas,
      COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false AND COALESCE(a.leida,false)=false)::bigint no_leidas,
      COUNT(*) FILTER (WHERE COALESCE(a.resuelta,false)=false AND UPPER(COALESCE(a.prioridad,''))='CRITICA')::bigint criticas
    FROM gmx.notificaciones_admin a WHERE ${alertScope}`,alertValues);

  const recentValues=[];
  const recentScope=scopeClause('p.id_sucursal',branchId,scope,recentValues);
  const recentPromise=query(`SELECT p.id_pedido,p.fecha,p.nombre_cliente,p.sucursal,p.total,p.metodo_pago,p.estado_pedido,p.canal_venta
    FROM gmx.pedidos p WHERE ${recentScope} ORDER BY p.fecha DESC NULLS LAST LIMIT 8`,recentValues);

  const purchaseValues=[];
  const purchaseScope=scopeClause('c.id_sucursal_recepcion',branchId,scope,purchaseValues);
  const purchaseRange=rangeClause('c.fecha',from,to,purchaseValues);
  const purchasesPromise=query(`SELECT COUNT(*)::bigint total,
      COUNT(*) FILTER (WHERE UPPER(COALESCE(c.estado,'')) NOT IN ('RECIBIDA','CANCELADA'))::bigint pendientes,
      COALESCE(SUM(c.total) FILTER (WHERE UPPER(COALESCE(c.estado,''))<>'CANCELADA'),0)::numeric monto
    FROM gmx.compras c WHERE ${purchaseScope} AND ${purchaseRange}`,purchaseValues);

  const [branches,sales,trend,top,inventory,tcg,clients,buylist,cash,alerts,recent,purchases]=await Promise.all([
    branchesPromise,salesPromise,trendPromise,topPromise,inventoryPromise,tcgPromise,clientsPromise,buylistPromise,cashPromise,alertsPromise,recentPromise,purchasesPromise
  ]);

  const s=sales.rows[0]||{},i=inventory.rows[0]||{},t=tcg.rows[0]||{},b=buylist.rows[0]||{},c=cash.rows[0]||{},a=alerts.rows[0]||{},cl=clients.rows[0]||{},pu=purchases.rows[0]||{};
  return {
    generatedAt:new Date().toISOString(),filters:{branchId,from,to},branches:branches.rows,
    kpis:{ventas:num(s.ventas),pedidos:num(s.pedidos),ticketPromedio:num(s.ticket_promedio),clientesCompradores:num(s.clientes_compradores),clientesNuevos:num(cl.total_periodo),stockBajo:num(i.bajo_minimo),agotados:num(i.agotados),alertas:num(a.abiertas)},
    salesTrend:trend.rows.map(x=>({...x,ventas:num(x.ventas),pedidos:num(x.pedidos)})),
    topProducts:top.rows.map(x=>({...x,unidades:num(x.unidades),ventas:num(x.ventas)})),
    inventory:{registros:num(i.registros),unidades:num(i.unidades),bajoMinimo:num(i.bajo_minimo),agotados:num(i.agotados)},
    tcg:{variantes:num(t.variantes),unidades:num(t.unidades),disponibles:num(t.disponibles)},
    buylist:{total:num(b.total),pendientes:num(b.pendientes),pagadas:num(b.pagadas),montoPagado:num(b.monto_pagado)},
    cash:{abiertas:num(c.abiertas),ingresos:num(c.ingresos),egresos:num(c.egresos)},
    alerts:{abiertas:num(a.abiertas),noLeidas:num(a.no_leidas),criticas:num(a.criticas)},
    purchases:{total:num(pu.total),pendientes:num(pu.pendientes),monto:num(pu.monto)},
    recentOrders:recent.rows
  };
}
