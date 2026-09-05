import { brandText } from "./config/brand.js";import 'dotenv/config';
import './rpiKioskProvisioner.js';
import express from 'express';
import rpiNetworkRouter from './routes/rpiNetwork.js';
import helmet from 'helmet';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from './db.js';
import authRouter from './routes/auth.js';
// SHINY_PUBLIC_PRODUCT_TEMPLATE_R4_IMPORT
import publicProductTemplateRouter from './routes/publicProductTemplate.js';
import adminRouter from './routes/admin.js';
import productsRouter from './routes/products.js';
import externalCardBetaRouter from './routes/externalCardBeta.js';
import visualBetaRouter from './routes/visualBeta.js';
import categoriesRouter from './routes/categories.js';
import metaRouter from './routes/meta.js';
import clientsRouter from './routes/clients.js';
import geoRouter from './routes/geo.js';
import branchesRouter from './routes/branches.js';
import inventoryRouter from './routes/inventory.js';
import inventoryStockImportRouter from './routes/inventoryStockImport.js';
import ordersRouter from './routes/orders.js';
import purchasesRouter from './routes/purchases.js';
import cashRouter from './routes/cash.js';
import tcgRouter from './routes/tcg.js';
import tcgSyncRouter from './routes/tcgSync.js';
import buylistRouter from './routes/buylist.js';
import reportsRouter from './routes/reports.js';
import tcgOpsRouter from './routes/tcgOps.js';
import commercialRouter from './routes/commercial.js';
import contentRouter from './routes/content.js';
import dataExportRouter from './routes/dataExport.js';
import benefitsRouter from './routes/benefits.js';
import cmsRouter from './routes/cms.js';
import publicStoreRouter from './routes/publicStore.js';
import clientAccountRouter from './routes/clientAccount.js';
import paymentsRouter from './routes/payments.js';
import { handleStripeWebhook } from './paymentService.js';
import { requireAuth, requireModule, enforceBranchScope, applyDefaultBranchScope, filterResponseByBranchScope, enforceSuperadminCostPrivacy } from './middleware/auth.js';
import { validateStructuredInput } from './middleware/requestValidation.js';
import { startTcgSyncScheduler } from './tcgCatalogSyncService.js';
import notificationsRouter from './routes/notifications.js';
import { startAlertScheduler, alertMutationTrigger } from './alertScheduler.js';
import storefrontLiveRouter from './routes/storefrontLive.js';
import { initStorefrontLiveSync, storefrontMutationPublisher, stopStorefrontLiveSync } from './storefrontLiveSync.js';
import { publicApiRateLimit, authRateLimit } from './middleware/publicRateLimit.js';
import trafficHealthRouter from './routes/trafficHealth.js';
import dashboardRouter from './routes/dashboard.js';
import productImagesRouter from './routes/productImages.js';
import systemUpdateRouter from './routes/systemUpdate.js';
import { startProductImageEnrichmentScheduler } from './productImageEnrichmentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/* SHINY_LOCAL_PRODUCT_MEDIA_R12 */
const productUploadsDir = path.join(__dirname, '..', 'uploads', 'products');

const frontendDist = path.resolve(__dirname, '../../frontend/dist');
const app = express();
const PORT = Number(process.env.PORT || 8787);

/* SHINY_DUAL_CLOUDFLARE_ENTRY_R1_CONFIG
 * Un solo backend Shiny, tres listeners:
 *   PORT (8787)          = entrada normal/local existente
 *   INTERNAL_ENTRY_PORT  = portal de personal; "/" -> "/login"
 *   STORE_ENTRY_PORT     = tienda publica; "/" -> "/tienda"
 *
 * Los Quick Tunnels de Cloudflare pueden apuntar a 8788 y 8789.
 * No duplica DB, procesos de negocio, schedulers ni autenticacion.
 */
const INTERNAL_ENTRY_PORT = Number(process.env.SHINY_INTERNAL_ENTRY_PORT || 8788);
const STORE_ENTRY_PORT = Number(process.env.SHINY_STORE_ENTRY_PORT || 8789);

function shinyEntryMode(req) {
  const localPort = Number(req.socket?.localPort || 0);
  if (localPort === INTERNAL_ENTRY_PORT) return 'internal';
  if (localPort === STORE_ENTRY_PORT) return 'store';
  return 'default';
}

app.use((req, res, next) => {
  const mode = shinyEntryMode(req);
  res.setHeader('X-Shiny-Entry-Mode', mode);

  if (req.method === 'GET' && req.path === '/') {
    if (mode === 'internal') return res.redirect(302, '/login');
    if (mode === 'store') return res.redirect(302, '/tienda');
  }
  next();
});

app.get('/api/shiny-entry-mode', (req, res) => {
  res.json({
    success: true,
    mode: shinyEntryMode(req),
    localPort: Number(req.socket?.localPort || 0)
  });
});
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: [
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:8787', 'http://127.0.0.1:8787']
}));
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    await handleStripeWebhook(req.body, req.headers['stripe-signature']);
    res.json({ received: true });
  } catch (_e) {
    res.status(400).json({ received: false });
  }
});
app.use(express.json({ limit: '36mb' }));
/* SHINY_VISUAL_BETA_PAYLOAD_R4
 * The visual-search endpoint carries a camera frame encoded as a data URL.
 * Global structured-input validation is designed for normal form/text payloads
 * and can reject long Base64 strings before the isolated visual route sees them.
 *
 * Scope this exception to ONE exact authenticated API endpoint only.
 * The visualBeta route performs its own required-field and 10 MB string limit
 * checks, while normal Shiny endpoints continue through validateStructuredInput.
 */
app.use((req, res, next) => {
  if (req.method === 'POST' && ['/api/v1/visual-beta/search', '/api/v1/external-card-beta/visual-search'].includes(req.path)) {
    return next();
  }
  return validateStructuredInput(req, res, next);
});
app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  next();
});

app.use('/api/public/tcg-images', express.static(path.resolve(__dirname, '../storage/tcg-images'), {
  immutable: false, maxAge: '6h', fallthrough: true
}));

app.use('/api/public/product-images', express.static(path.resolve(__dirname, '../storage/product-images'), {
  immutable: false, maxAge: '6h', fallthrough: true
}));

app.get('/api/health', async (_req, res) => {
  try {
    const r = await query(`SELECT current_database() AS database,current_user AS db_user,current_schema() AS schema,NOW() AS server_time`);
    res.json({ success: true, service: brandText("Shiny Local API"), mode: 'LOCAL_SECURE', database: r.rows[0], db_ms: r.ms });
  } catch (e) {res.status(503).json({ success: false, error: 'DATABASE_UNAVAILABLE', message: e.message });}
});

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/public', publicApiRateLimit);
// SHINY_PUBLIC_PRODUCT_TEMPLATE_R4_MOUNT
app.use('/api/public/products', publicProductTemplateRouter);
app.use('/api/public/live-sync', storefrontLiveRouter);
app.use('/api/public', publicStoreRouter);
app.use('/api/client', clientAccountRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/v1', requireAuth);
app.use('/api/v1', enforceSuperadminCostPrivacy);
app.use('/api/v1', alertMutationTrigger);
app.use('/api/v1', storefrontMutationPublisher);
app.use('/api/v1', enforceBranchScope);
app.use('/api/v1', applyDefaultBranchScope);
app.use('/api/v1', filterResponseByBranchScope);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/system-update', systemUpdateRouter);
app.use('/api/v1/system/traffic', requireModule('REPORTES'), trafficHealthRouter);
app.use('/api/v1/dashboard', requireModule('DASHBOARD'), dashboardRouter);
app.use('/api/v1/meta', requireModule('DASHBOARD'), metaRouter);
app.use('/uploads/products', express.static(productUploadsDir, { fallthrough: true, maxAge: '7d', immutable: false }));

app.use('/api/v1/products', requireModule('PRODUCTOS'), productsRouter);
app.use('/api/v1/external-card-beta', requireModule('PRODUCTOS'), externalCardBetaRouter);
app.use('/api/v1/visual-beta', requireModule('PRODUCTOS'), visualBetaRouter);
app.use('/api/v1/categories', requireModule('PRODUCTOS'), categoriesRouter);
app.use('/api/v1/product-images', requireModule('PRODUCTOS'), productImagesRouter);
app.use('/api/v1/clients', requireModule('CLIENTES'), clientsRouter);
app.use('/api/v1/geo', requireModule('CLIENTES'), geoRouter);
app.use('/api/v1/branches', requireModule('SUCURSALES'), branchesRouter);
app.use('/api/v1/inventory',requireModule('INVENTARIO'),inventoryStockImportRouter);
app.use('/api/v1/inventory', requireModule('INVENTARIO'), inventoryRouter);
app.use('/api/v1/orders', requireModule('PEDIDOS'), ordersRouter);
app.use('/api/v1/purchases', requireModule('COMPRAS'), purchasesRouter);
app.use('/api/v1/cash', requireModule('CAJA'), cashRouter);
app.use('/api/v1/tcg', requireModule('TCG'), tcgRouter);
app.use('/api/v1/tcg-sync', requireModule('TCG'), tcgSyncRouter);
app.use('/api/v1/tcg-ops', requireModule('TCG'), tcgOpsRouter);
app.use('/api/v1/buylist', requireModule('BUYLIST'), buylistRouter);
app.use('/api/v1/reports', requireModule('REPORTES'), reportsRouter);
app.use('/api/v1/commercial', requireModule('COMERCIAL'), commercialRouter);
app.use('/api/v1/content', requireModule('CONTENIDO'), contentRouter);
app.use('/api/v1/notifications', requireModule('NOTIFICACIONES'), notificationsRouter);
app.use('/api/v1/export', requireModule('REPORTES'), dataExportRouter);
app.use('/api/v1/benefits', requireModule('COMERCIAL'), benefitsRouter);
app.use('/api/v1/cms', requireModule('CONTENIDO'), cmsRouter);

app.use('/api/rpi-network', rpiNetworkRouter);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(frontendDist));
  app.use((_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
}

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(brandText(`[Shiny] API local segura: http://localhost:${PORT}`));
  console.log(brandText("[Shiny] API mode: LOCAL_SECURE"));
  startTcgSyncScheduler();
  startProductImageEnrichmentScheduler();
  startAlertScheduler();
  initStorefrontLiveSync().catch((e) => console.error(brandText("[Shiny] Storefront live sync:"), e.message));
});

/* SHINY_DUAL_CLOUDFLARE_ENTRY_R1_LISTENERS */
const shinyEntryServers = [];

function startShinyEntryListener(port, label) {
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    console.error(`[Shiny] Puerto ${label} invalido: ${port}`);
    return;
  }
  if (port === PORT) {
    console.log(`[Shiny] ${label}: reutiliza puerto principal ${PORT}`);
    return;
  }
  if (shinyEntryServers.some((item) => item.port === port)) {
    console.error(`[Shiny] ${label}: puerto duplicado ${port}`);
    return;
  }

  const entryServer = app.listen(port, '127.0.0.1', () => {
    console.log(`[Shiny] ${label}: http://127.0.0.1:${port}`);
  });
  entryServer.on('error', (error) => {
    console.error(`[Shiny] ${label} no pudo escuchar en ${port}:`, error.message);
  });
  shinyEntryServers.push({ port, label, server: entryServer });
}

startShinyEntryListener(INTERNAL_ENTRY_PORT, 'PORTAL PERSONAL');
startShinyEntryListener(STORE_ENTRY_PORT, 'TIENDA PUBLICA');
/* SHINY_TCG_LONG_REQUEST_TIMEOUT_R3 */
server.requestTimeout = 10 * 60 * 1000;
server.headersTimeout = 10 * 60 * 1000 + 5000;
server.keepAliveTimeout = 65000;


async function shutdown(signal) {
  console.log(brandText(`[Shiny] ${signal}: shutting down...`));
  server.close(async () => {
    try {await stopStorefrontLiveSync();} catch {}
    await pool.end();process.exit(0);
  });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));


