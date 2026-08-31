import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const scope=req.access?.branchScope;
    const scoped=scope&&!scope.all&&Array.isArray(scope.allowed)&&scope.allowed.length;
    const branches=scoped?scope.allowed:[];

    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM shiny.productos) AS productos,
        (SELECT COUNT(*) FROM shiny.clientes) AS clientes,
        (SELECT COUNT(*) FROM shiny.pedidos p
          WHERE $1::boolean=false OR p.id_sucursal=ANY($2::text[])) AS pedidos,
        (SELECT COUNT(*) FROM shiny.inventario_sucursales i
          WHERE $1::boolean=false OR i.id_sucursal=ANY($2::text[])) AS inventario_sucursales,
        (SELECT COUNT(DISTINCT ti.id_carta)
          FROM shiny.tcg_inventario ti
          LEFT JOIN shiny.tcg_inventario_sucursales ts ON ts.id_inventario=ti.id_inventario
          WHERE $1::boolean=false OR ts.id_sucursal=ANY($2::text[])) AS tcg_cartas,
        (SELECT COUNT(DISTINCT ti.id_inventario)
          FROM shiny.tcg_inventario ti
          LEFT JOIN shiny.tcg_inventario_sucursales ts ON ts.id_inventario=ti.id_inventario
          WHERE $1::boolean=false OR ts.id_sucursal=ANY($2::text[])) AS tcg_inventario
    `,[Boolean(scoped),branches]);

    res.json({
      success:true,
      data:{
        ...result.rows[0],
        branch_scope:scoped?branches:null
      },
      ms:result.ms
    });
  } catch (error) {
    res.status(500).json({
      success:false,error:'META_FAILED',message:error.message
    });
  }
});

export default router;
