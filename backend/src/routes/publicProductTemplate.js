import { Router } from 'express';
import ExcelJS from 'exceljs';
import { query } from '../db.js';

const router = Router();

function styleHeader(row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 24;
}

router.get('/template.xlsx', async (_req, res) => {
  try {
    const categoriesR = await query(`
      SELECT TRIM(nombre) AS nombre
      FROM shiny.categorias
      WHERE NULLIF(TRIM(COALESCE(nombre,'')),'') IS NOT NULL
        AND LOWER(TRIM(COALESCE(estado,'Activo')))='activo'
      ORDER BY TRIM(nombre)
    `);

    const categories = [...new Set(
      categoriesR.rows
        .map(r => String(r.nombre || '').trim())
        .filter(Boolean)
    )];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Shiny';
    wb.lastModifiedBy = 'Shiny';
    wb.created = new Date();
    wb.modified = new Date();

    // =========================================================
    // HOJA PRODUCTOS
    // =========================================================
    const ws = wb.addWorksheet('Productos', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

    ws.columns = [
      { header: 'sku',           key: 'sku',           width: 22 },
      { header: 'codigo_barras', key: 'codigo_barras', width: 22 },
      { header: 'nombre',        key: 'nombre',        width: 34 },
      { header: 'descripcion',   key: 'descripcion',   width: 42 },
      { header: 'categoria',     key: 'categoria',     width: 26 },
      { header: 'precio',        key: 'precio',        width: 14 },
      { header: 'stock_minimo',  key: 'stock_minimo',  width: 15 },
      { header: 'estado',        key: 'estado',        width: 16 },
      { header: 'imagen_url',    key: 'imagen_url',    width: 48 }
    ];

    styleHeader(ws.getRow(1));
    ws.autoFilter = 'A1:I1';

    ws.getColumn('A').numFmt = '@';
    ws.getColumn('B').numFmt = '@';
    ws.getColumn('F').numFmt = '0.00';
    ws.getColumn('G').numFmt = '0';

    // =========================================================
    // HOJA CATEGORIAS / LISTAS
    // =========================================================
    const cat = wb.addWorksheet('Categorias');
    cat.columns = [
      { header: 'Categorias activas', key: 'categoria', width: 38 },
      { header: '', key: 'separador', width: 3 },
      { header: 'Estados permitidos', key: 'estado', width: 22 }
    ];

    styleHeader(cat.getRow(1));

    categories.forEach((name, index) => {
      cat.getCell(`A${index + 2}`).value = name;
    });

    cat.getCell('C2').value = 'Activo';
    cat.getCell('C3').value = 'Inactivo';
    cat.getCell('C4').value = 'Agotado';

    // ExcelJS: PRIMERO rango, SEGUNDO nombre.
    if (categories.length > 0) {
      wb.definedNames.add(
        `'Categorias'!$A$2:$A$${categories.length + 1}`,
        'SHINY_CATEGORIAS_ACTIVAS'
      );
    }

    wb.definedNames.add(
      `'Categorias'!$C$2:$C$4`,
      'SHINY_ESTADOS_PRODUCTO'
    );

    // =========================================================
    // VALIDACIONES DE DATOS
    // =========================================================
    for (let row = 2; row <= 5000; row++) {
      if (categories.length > 0) {
        ws.getCell(`E${row}`).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['SHINY_CATEGORIAS_ACTIVAS'],
          showErrorMessage: true,
          errorStyle: 'stop',
          errorTitle: 'Categoria no valida',
          error: 'Selecciona una categoria existente en la lista.',
          showInputMessage: true,
          promptTitle: 'Categoria',
          prompt: 'Selecciona una categoria activa de Shiny.'
        };
      }

      ws.getCell(`H${row}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['SHINY_ESTADOS_PRODUCTO'],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Estado no valido',
        error: 'Selecciona Activo, Inactivo o Agotado.'
      };
    }

    // =========================================================
    // INSTRUCCIONES
    // =========================================================
    const info = wb.addWorksheet('Instrucciones');
    info.columns = [
      { header: 'Campo', key: 'campo', width: 24 },
      { header: 'Uso', key: 'uso', width: 92 }
    ];

    styleHeader(info.getRow(1));

    [
      ['sku', 'Obligatorio. Identificador comercial. No es el ID interno.'],
      ['codigo_barras', 'Opcional. UPC/EAN o codigo fisico.'],
      ['nombre', 'Obligatorio. Nombre del producto.'],
      ['descripcion', 'Opcional.'],
      ['categoria', 'Obligatorio. Seleccionar del desplegable; viene de Categorias activas de la BD.'],
      ['precio', 'Precio de venta.'],
      ['stock_minimo', 'Nivel minimo de inventario.'],
      ['estado', 'Seleccionar Activo, Inactivo o Agotado.'],
      ['imagen_url', 'Opcional. URL publica de imagen.'],
      ['ID', 'No se captura. Lo administra la base de datos.'],
      ['Stock', 'No se captura aqui. Se administra desde Inventario.']
    ].forEach(([campo, uso]) => info.addRow({ campo, uso }));

    const buffer = await wb.xlsx.writeBuffer();

    res.status(200);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Shiny_Plantilla_Productos.xlsx"'
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Shiny-Product-Template', 'R9-DROPDOWNS');

    return res.end(Buffer.from(buffer));
  } catch (error) {
    console.error(
      '[Shiny][PUBLIC_PRODUCT_TEMPLATE_R9]',
      error?.stack || error?.message || error
    );

    return res.status(500).json({
      success: false,
      error: 'PRODUCT_TEMPLATE_FAILED',
      message: String(error?.message || error || 'Error desconocido')
    });
  }
});

export default router;