const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.argv[2] || 'C:\\Users\\SrsGarciaEspinoza\\Videos\\Shiny';
const file = path.join(root, 'frontend', 'src', 'pages', 'OrdersPage.jsx');

if (!fs.existsSync(file)) {
  console.error(`No se encontró ${file}`);
  process.exit(2);
}

let src = fs.readFileSync(file, 'utf8');

if (src.includes('SHINY_POS_PAGO_MIXTO_001_V3')) {
  console.log('POS-PAGO-MIXTO-001 V3 ya estaba aplicado.');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
const backup = `${file}.POS_PAGO_MIXTO_001_V3_${stamp}.bak`;
fs.copyFileSync(file, backup);

function fail(message) {
  console.error(message);
  console.error(`Backup: ${backup}`);
  process.exit(3);
}

function replaceOnce(search, replacement, label) {
  const idx = src.indexOf(search);
  if (idx < 0) fail(`No se encontró el ancla: ${label}`);
  src = src.slice(0, idx) + replacement + src.slice(idx + search.length);
}

replaceOnce(
  "import OrderDetailModal from '../components/OrderDetailModal.jsx';",
  "import OrderDetailModal from '../components/OrderDetailModal.jsx';\nimport MixedPaymentsPanel from '../components/MixedPaymentsPanel.jsx';",
  'import OrderDetailModal'
);

replaceOnce(
  "  const [paymentReference, setPaymentReference] = useState('');",
  "  const [paymentReference, setPaymentReference] = useState('');\n  const [payments,setPayments]=useState([{method:'EFECTIVO',amount:0,cashReceived:0,reference:''}]);",
  'paymentReference state'
);

const itemKeyAnchor = "  const itemKey=item=>`${item.item_type||'PRODUCT'}:${item.item_id||item.product_id||item.inventory_id}`;";
replaceOnce(
  itemKeyAnchor,
  itemKeyAnchor + `

  // SHINY_POS_PAGO_MIXTO_001_V3
  const saleTotal=useMemo(()=>{
    const raw=cart.reduce((sum,item)=>sum+(Number(item.price)||0)*(Number(item.quantity)||0),0);
    const previewTotal=Number(benefitPreview?.total);
    return Number.isFinite(previewTotal)?Number(previewTotal.toFixed(2)):Number(raw.toFixed(2));
  },[cart,benefitPreview]);

  useEffect(()=>{
    setBenefitPreview(null);
  },[cart]);
`,
  'itemKey'
);

replaceOnce(
  "          paymentReference,\n          notes,",
  `          paymentReference,
          payments:payments.map((row,index)=>({
            method:index===0?paymentMethod:row.method,
            amount:Number(row.amount||0),
            cashReceived:(index===0?paymentMethod:row.method)==='EFECTIVO'?Number(row.cashReceived||0):null,
            reference:index===0?paymentReference:String(row.reference||'')
          })),
          notes,`,
  'checkout payment payload'
);

replaceOnce(
  "      setPaymentReference('');\n      setNotes('');",
  "      setPaymentReference('');\n      setPayments([{method:'EFECTIVO',amount:0,cashReceived:0,reference:''}]);\n      setNotes('');",
  'checkout reset'
);

const selectPos = src.indexOf('value={paymentMethod}');
if (selectPos < 0) fail('No se encontró el selector paymentMethod.');
const labelEnd = src.indexOf('</label>', selectPos);
if (labelEnd < 0) fail('No se pudo delimitar el label principal de método de pago.');
const insertAt = labelEnd + '</label>'.length;
const panel = `

            <MixedPaymentsPanel
              total={saleTotal}
              primaryMethod={paymentMethod}
              payments={payments}
              setPayments={setPayments}
            />`;
src = src.slice(0, insertAt) + panel + src.slice(insertAt);

replaceOnce(
  "    const details=Array.isArray(order?.detalles)?order.detalles:[];",
  `    const details=Array.isArray(order?.detalles)?order.detalles:[];
    const paymentRows=Array.isArray(order?.pagos)?order.pagos:[];`,
  'receipt details'
);

// Ticket: replace only if exact current fragment exists.
const oldFragment = `<div class="pay"><b>MÃ©todo de pago:</b> \${esc(order?.metodo_pago||'')}\${order?.referencia_pago?\`<br><b>Referencia:</b> \${esc(order.referencia_pago)}\`:''}</div><div class="thanks">Gracias por tu compra.</div>`;
const newFragment = `\${paymentRows.length?\`<div class="pay"><b>Pagos:</b>\${paymentRows.map(p=>\`<br>\${esc(p.metodo)}: \${moneyLocal(p.importe_aplicado)}\${String(p.metodo||'').toUpperCase()==='EFECTIVO'?\` · Recibido \${moneyLocal(p.efectivo_recibido)} · Cambio \${moneyLocal(p.cambio_entregado)}\`:''}\${p.referencia?\` · Ref. \${esc(p.referencia)}\`:''}\`).join('')}</div>\`:\`<div class="pay"><b>MÃ©todo de pago:</b> \${esc(order?.metodo_pago||'')}\${order?.referencia_pago?\`<br><b>Referencia:</b> \${esc(order.referencia_pago)}\`:''}</div>\`}<div class="thanks">Gracias por tu compra.</div>`;
if (src.includes(oldFragment)) {
  src = src.replace(oldFragment, newFragment);
} else {
  console.warn('Aviso: ticket no modificado; el POS sí se parcheará.');
}

fs.writeFileSync(file, src, 'utf8');

const failedCandidate = path.join(
  path.dirname(file),
  `OrdersPage.POS_PAGO_MIXTO_001_V3_CANDIDATE_${stamp}.jsx`
);
fs.copyFileSync(file, failedCandidate);

const frontendDir = path.join(root, 'frontend');

let result;
if (process.platform === 'win32') {
  // Ejecutar npm mediante cmd.exe evita falsos fallos de spawnSync con npm.cmd.
  result = spawnSync(
    process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
    ['/d', '/s', '/c', `npm run build --prefix "${frontendDir}"`],
    { cwd: root, encoding: 'utf8', windowsHide: true }
  );
} else {
  result = spawnSync(
    'npm',
    ['run', 'build', '--prefix', frontendDir],
    { cwd: root, encoding: 'utf8' }
  );
}

if (result.error) {
  fs.copyFileSync(backup, file);
  console.error('No fue posible ejecutar el build:', result.error.message);
  console.error(`Candidato fallido conservado en: ${failedCandidate}`);
  console.error(`OrdersPage.jsx restaurado desde: ${backup}`);
  process.exit(4);
}

console.log(result.stdout || '');
if (result.stderr) console.error(result.stderr);

if (result.status !== 0) {
  fs.copyFileSync(backup, file);
  console.error(`BUILD FALLÓ con código ${result.status}.`);
  console.error(`Candidato fallido conservado en: ${failedCandidate}`);
  console.error(`OrdersPage.jsx restaurado desde: ${backup}`);
  process.exit(4);
}

// Build correcto: ya no necesitamos conservar un "candidate" como fallido.
try { fs.unlinkSync(failedCandidate); } catch (_) {}

console.log('POS-PAGO-MIXTO-001 V3 aplicado y compilado correctamente.');
console.log(`Backup: ${backup}`);
