import { brandText } from "../config/brand.js";import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api.js';
import { publicApi } from '../services/publicApi.js';
import VisionScannerModal from '../components/VisionScannerModal.jsx';
import VisionInternetResultsModal from '../components/VisionInternetResultsModal.jsx';
import VisionCandidatePicker from '../components/VisionCandidatePicker.jsx';
import { visionQueries, scoreVisionCandidate } from '../utils/vision.js';
import OrderDetailModal from '../components/OrderDetailModal.jsx';
import MixedPaymentsPanel from '../components/MixedPaymentsPanel.jsx';
import './OrdersPagePOSClassic.css';

function money(value) {
  if (value === null || value === '' || typeof value === 'undefined') return '—';
  return Number(value).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

// POS-UX-006 — sanitización de captura para caja.
function sanitizeMoneyInput(value) {
  if (value === null || typeof value === 'undefined') return '';
  let text = String(value).replace(',', '.').replace(/[^0-9.]/g, '');
  const firstDot = text.indexOf('.');
  if (firstDot >= 0) {
    text = text.slice(0, firstDot + 1) + text.slice(firstDot + 1).replace(/\./g, '');
    const [whole, decimals = ''] = text.split('.');
    text = `${whole || '0'}.${decimals.slice(0, 2)}`;
  }
  return text.slice(0, 14);
}

function sanitizePaymentReference(value) {
  return String(value || '').replace(/[^a-zA-Z0-9 _./-]/g, '').slice(0, 80);
}

function isPosAttentionMessage(value) {
  return /no hay|no se pudo|no encontrado|no válida|no valido|inválid|error|rechaz|supera|excede|vacío|selecciona una sucursal/i.test(String(value || ''));
}

export default function OrdersPage({ mode = 'pos' }) {
  // GMX_POS_PAGO_MIXTO_001_V5_3
  const [tab, setTab] = useState(mode === 'orders' ? 'orders' : 'pos');
  const [draftOrderMode, setDraftOrderMode] = useState(false);
  const [branches, setBranches] = useState([]);
  const [clients, setClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [clientId, setClientId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [paymentReference, setPaymentReference] = useState('');
  const [payments, setPayments] = useState([{ method: 'EFECTIVO', amount: 0, cashReceived: 0, reference: '' }]);
  const [notes, setNotes] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptDeliveryStatus, setReceiptDeliveryStatus] = useState(null);
  const [receiptChannel, setReceiptChannel] = useState('');
  const [receiptEmail, setReceiptEmail] = useState('');
  const [posPromoSlides, setPosPromoSlides] = useState([]);
  const [posPromoIndex, setPosPromoIndex] = useState(0);
  const [guestPhone, setGuestPhone] = useState('');
  const [guestWhatsAppConsent, setGuestWhatsAppConsent] = useState(false);
  const [whatsAppBusy, setWhatsAppBusy] = useState(false);
  const [payOrder, setPayOrder] = useState(null);
  const [payMethod, setPayMethod] = useState('EFECTIVO');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [benefitPreview, setBenefitPreview] = useState(null);
  // POS-007 — descuento manual
  const [currentUser, setCurrentUser] = useState(null);
  const [posFullscreen, setPosFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const [posSessionStarted, setPosSessionStarted] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const [posExitOpen, setPosExitOpen] = useState(false);
  const [posExitPassword, setPosExitPassword] = useState('');
  const [posExitError, setPosExitError] = useState('');
  const [posExitBusy, setPosExitBusy] = useState(false);
  const posFullscreenEnteredRef = useRef(false);
  const posExitAuthorizedRef = useRef(false);
  const posLongPressRef = useRef(null);
  const [posStandalone, setPosStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone);
  });
  const posKioskMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('kiosk') === '1';
  const isOperator = String(currentUser?.rol || '').toUpperCase() === 'OPERADOR';
  const operatorBranchId = String(currentUser?.sucursal_principal || currentUser?.branchScope?.principal || currentUser?.sucursales_permitidas?.[0] || '').trim();
  const fullscreenCapable = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled && document.documentElement?.requestFullscreen);

  async function enterPosFullscreen() {
    if (!isOperator || posStandalone || posKioskMode || posFullscreen) return;
    if (!fullscreenCapable) {
      setMessage(brandText("Este navegador no permite pantalla completa desde la página. Abre GMX como aplicación/PWA o en modo kiosco."));
      return;
    }
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      setPosSessionStarted(true);
      posFullscreenEnteredRef.current = true;
    } catch {
      try {
        await document.documentElement.requestFullscreen();
        setPosSessionStarted(true);
        posFullscreenEnteredRef.current = true;
      } catch {
        setMessage('No fue posible activar pantalla completa. Pulsa nuevamente o usa el modo aplicación/kiosco del dispositivo.');
      }
    }
  }

  function openProtectedPosExit() {
    if (!isOperator) return;
    setPosExitPassword('');
    setPosExitError('');
    setPosExitOpen(true);
  }

  function clearPosLongPress() {
    if (posLongPressRef.current) {
      window.clearTimeout(posLongPressRef.current);
      posLongPressRef.current = null;
    }
  }

  function startPosLongPress() {
    if (!isOperator) return;
    clearPosLongPress();
    posLongPressRef.current = window.setTimeout(() => {
      posLongPressRef.current = null;
      openProtectedPosExit();
    }, 5000);
  }

  async function cancelProtectedPosExit() {
    setPosExitOpen(false);
    setPosExitPassword('');
    setPosExitError('');
    if (isOperator && !posStandalone && !posKioskMode && !document.fullscreenElement && fullscreenCapable) {
      await enterPosFullscreen();
    }
  }

  async function authorizeProtectedPosExit(event) {
    event?.preventDefault?.();
    if (posExitBusy) return;
    if (!posExitPassword) {setPosExitError('Escribe tu contraseña.');return;}
    setPosExitBusy(true);
    setPosExitError('');
    try {
      await api('/api/auth/verify-password', { method: 'POST', body: JSON.stringify({ password: posExitPassword }) });
      posExitAuthorizedRef.current = true;
      try {if (document.fullscreenElement) await document.exitFullscreen();} catch {}
      try {await api('/api/auth/logout', { method: 'POST' });} catch {}
      localStorage.removeItem('GMX_AUTH_TOKEN');
      localStorage.removeItem('GMX_AUTH_USER');
      localStorage.removeItem('GMX_AUTH_ACCESS');
      window.location.assign('/login');
    } catch (error) {
      setPosExitError(error?.message === 'INVALID_CREDENTIALS' ? 'Contraseña incorrecta.' : String(error?.message || 'No fue posible autorizar la salida.'));
    } finally {
      setPosExitBusy(false);
    }
  }
  const [manualDiscountType, setManualDiscountType] = useState('PORCENTAJE');
  const [manualDiscountValue, setManualDiscountValue] = useState(0);
  const [manualDiscountReason, setManualDiscountReason] = useState('');
  const [loyalty, setLoyalty] = useState(null);
  const [saleType, setSaleType] = useState('ALL');
  const [tcgGames, setTcgGames] = useState([]);
  const [tcgSets, setTcgSets] = useState([]);
  const [gameId, setGameId] = useState('');
  const [setId, setSetId] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [productCategories, setProductCategories] = useState([]);
  const [productCategory, setProductCategory] = useState('');
  const [visionOpen, setVisionOpen] = useState(false);
  const [visionCandidates, setVisionCandidates] = useState([]);
  const [visionPickerOpen, setVisionPickerOpen] = useState(false);
  const [visionInternetOpen, setVisionInternetOpen] = useState(false);
  const [visionInternetBusy, setVisionInternetBusy] = useState(false);
  const [visionInternetCandidates, setVisionInternetCandidates] = useState([]);
  const [visionInternetError, setVisionInternetError] = useState('');
  const [visionInternetQuery, setVisionInternetQuery] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);
  // POS-UX-004 — selector de cliente en modal y catálogo/existencias unificados con filtro de sucursal.
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [catalogBranchId, setCatalogBranchId] = useState('');
  // POS-UX-002B — feedback inmediato al agregar artículos desde el catálogo.
  const [catalogAddFeedback, setCatalogAddFeedback] = useState(null);
  // POS-UX-003 — acciones del PDV mediante modales, sin paneles permanentes.
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [promoModalOpen, setPromoModalOpen] = useState(false);
  const [pointsModalOpen, setPointsModalOpen] = useState(false);
  // POS-UX-005 — el cobro se captura únicamente al pulsar COBRAR.
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  // POS-UX-002A — búsqueda manual, lector físico y cámara separados.
  const [scanMode, setScanMode] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [pendingScanQuantity, setPendingScanQuantity] = useState(1);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [orderLookupOpen, setOrderLookupOpen] = useState(false);
  const [orderLookupSearch, setOrderLookupSearch] = useState('');
  const [orderLookupResults, setOrderLookupResults] = useState([]);
  const [orderLookupBusy, setOrderLookupBusy] = useState(false);
  const [loadedPendingOrder, setLoadedPendingOrder] = useState(null);
  const scanInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  // DEV-004B — devolución POS dentro del mismo punto de venta.
  // El token de autorización vive únicamente en memoria durante esta operación.
  const [returnFlow, setReturnFlow] = useState({
    open: false, stage: 'auth', order: null, password: '',
    authorizationToken: '', authorizationId: '', authorizer: null, items: [],
    reason: '', refund: false, refundMethod: 'EFECTIVO', refundReference: '',
    notes: '', reintegrateStock: true, busy: false, error: ''
  });

  // GMX_POS_FIX_002
  // Si una respuesta se pierde, el mismo payload reutiliza la misma clave.
  // Si carrito/pagos cambian, se genera una clave nueva.
  const [saleAttempt, setSaleAttempt] = useState({ key: '', fingerprint: '' });

  async function loadBranches() {
    const body = await api('/api/v1/branches?includeInactive=false');
    setBranches(body.data);
    if (!branchId && body.data[0]) setBranchId(body.data[0].id_sucursal);
    if (!catalogBranchId && body.data[0]) setCatalogBranchId(body.data[0].id_sucursal);
  }

  async function loadClients(term = '') {
    setClientLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20', search: String(term || '').trim() });
      const body = await api(`/api/v1/clients?${params}`);
      setClients(body.data || []);
    } finally {
      setClientLoading(false);
    }
  }

  async function loadProductCategories() {
    const body = await api('/api/v1/products/meta/categories');
    setProductCategories(body.data || []);
  }


  async function loadInventory(selectedBranch = branchId, options = {}) {
    if (!selectedBranch) {setInventory([]);return;}
    const params = new URLSearchParams({
      branchId: selectedBranch,
      type: options.type ?? saleType,
      search: options.search ?? productSearch,
      gameId: options.gameId ?? gameId,
      setId: options.setId ?? setId,
      category: options.category ?? productCategory,
      limit: '180'
    });
    setCatalogLoading(true);
    try {
      const body = await api(`/api/v1/orders/pos/catalog?${params}`);
      setInventory(body.data || []);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadTcgGames() {
    const body = await api('/api/v1/tcg/games');
    setTcgGames((body.data || []).filter((x) => x.activo !== false));
  }

  async function loadTcgSets(selectedGame = gameId) {
    if (!selectedGame) {setTcgSets([]);return;}
    const body = await api(`/api/v1/tcg/sets?gameId=${encodeURIComponent(selectedGame)}`);
    setTcgSets((body.data || []).filter((x) => x.activo !== false));
  }

  async function searchOrdersForPOS(term = '') {
    const search = String(term || '').trim();

    setOrderLookupBusy(true);
    setMessage('');

    try {
      const params = new URLSearchParams({
        limit: search ? '50' : '20',
        search
      });

      const [body, returnsBody] = await Promise.all([
      api(`/api/v1/orders?${params.toString()}`),
      api('/api/v1/commercial/returns?limit=1000').catch(() => ({ data: [] }))]
      );

      const returnByOrder = new Map();

      for (const r of returnsBody.data || []) {
        const orderId = String(r.referencia || '').trim();
        if (!orderId || returnByOrder.has(orderId)) continue;

        const sold = Number(r.unidades_vendidas_pedido || 0);
        const returned = Number(r.unidades_devueltas_pedido || 0);
        let returnStatus = '';

        if (returned > 0) {
          returnStatus = sold > 0 && returned >= sold ? 'DEVUELTO TOTAL' : 'DEVUELTO PARCIAL';
        }

        returnByOrder.set(orderId, {
          returnStatus,
          sold,
          returned
        });
      }

      const rows = (body.data || []).map((order) => {
        const ret = returnByOrder.get(String(order.id_pedido || ''));

        return {
          ...order,
          estado_devolucion: ret?.returnStatus || '',
          unidades_vendidas_originales: ret?.sold || Number(order.unidades || 0),
          unidades_devueltas: ret?.returned || 0
        };
      });

      setOrderLookupResults(rows);
      return rows;
    } catch (error) {
      setMessage(error.message || 'No se pudo buscar el pedido.');
      setOrderLookupResults([]);
    } finally {
      setOrderLookupBusy(false);
    }
  }

  async function loadOrders(term = orderSearch) {
    // GMX_POS_HIST_DEV_001
    const params = new URLSearchParams({
      limit: '200',
      search: term
    });

    const [body, returnsBody] = await Promise.all([
    api(`/api/v1/orders?${params.toString()}`),
    api('/api/v1/commercial/returns?limit=1000').catch(() => ({ data: [] }))]
    );

    const returnByOrder = new Map();
    for (const r of returnsBody.data || []) {
      const orderId = String(r.referencia || '').trim();
      if (!orderId || returnByOrder.has(orderId)) continue;

      const sold = Number(r.unidades_vendidas_pedido || 0);
      const returned = Number(r.unidades_devueltas_pedido || 0);
      let returnStatus = '';
      if (returned > 0) {
        returnStatus = sold > 0 && returned >= sold ? 'DEVUELTO TOTAL' : 'DEVUELTO PARCIAL';
      }
      returnByOrder.set(orderId, {
        returnStatus,
        sold,
        returned
      });
    }

    setOrders((body.data || []).map((order) => {
      const ret = returnByOrder.get(String(order.id_pedido || ''));
      return {
        ...order,
        estado_devolucion: ret?.returnStatus || '',
        unidades_vendidas_originales: ret?.sold || Number(order.unidades || 0),
        unidades_devueltas: ret?.returned || 0
      };
    }));
  }

  useEffect(() => {
    setTab(mode === 'orders' ? 'orders' : 'pos');
    setDraftOrderMode(false);
    setMessage('');
  }, [mode]);

  useEffect(() => {
    Promise.all([loadBranches(), loadClients(''), loadOrders(''), loadTcgGames(), loadProductCategories()]).
    catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    let active = true;
    publicApi('/api/public/storefront').then((body) => {
      if (!active) return;
      const zones = body.data?.zones || {};
      const slides = zones.HOME_HERO || [];
      setPosPromoSlides(slides);
      setPosPromoIndex(0);
    }).catch(() => {
      if (active) setPosPromoSlides([]);
    });
    return () => {active = false;};
  }, []);

  useEffect(() => {
    if (posPromoSlides.length < 2 || promoCode) return undefined;
    const seconds = Math.max(3, Number(posPromoSlides[posPromoIndex]?.intervalo_segundos || 6));
    const timer = setTimeout(() => setPosPromoIndex((index) => (index + 1) % posPromoSlides.length), seconds * 1000);
    return () => clearTimeout(timer);
  }, [posPromoSlides, posPromoIndex, promoCode]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onFullscreen = () => {
      const active = Boolean(document.fullscreenElement);
      setPosFullscreen(active);
      if (active) {
        posFullscreenEnteredRef.current = true;
        setPosSessionStarted(true);
        return;
      }
      if (isOperator && !posStandalone && posFullscreenEnteredRef.current && !posExitAuthorizedRef.current) {
        setPosSessionStarted(true);
        setPosExitPassword('');
        setPosExitError('');
        setPosExitOpen(true);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, [isOperator, posStandalone]);

  useEffect(() => {
    if (!isOperator || typeof window === 'undefined') return undefined;
    const onKeyDown = (event) => {
      const key = String(event.key || '').toLowerCase();

      // Salida normal protegida de GMX:
      // Ctrl + Alt + X abre el modal SIN abandonar Fullscreen.
      if (!(event.ctrlKey && event.altKey && key === 'x')) return;
      if (!posFullscreenEnteredRef.current && !posKioskMode || posExitAuthorizedRef.current) return;

      event.preventDefault();
      event.stopPropagation();
      setPosSessionStarted(true);
      setPosExitPassword('');
      setPosExitError('');
      setPosExitOpen(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOperator, posKioskMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia?.('(display-mode: standalone)');
    const sync = () => setPosStandalone(Boolean(media?.matches || window.navigator?.standalone));
    sync();
    media?.addEventListener?.('change', sync);
    return () => media?.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    if (!isOperator || typeof document === 'undefined') return undefined;
    document.documentElement.classList.add('gmx-operator-pos-document');
    document.body.classList.add('gmx-operator-pos-body');
    return () => {
      document.documentElement.classList.remove('gmx-operator-pos-document');
      document.body.classList.remove('gmx-operator-pos-body');
    };
  }, [isOperator]);

  useEffect(() => {
    api('/api/auth/me').
    then((r) => setCurrentUser(r.data?.user || null)).
    catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (!isOperator) return;
    if (!operatorBranchId) {
      setBranchId('');
      setCatalogBranchId('');
      setMessage('Usuario sin sucursal asignada. Contacta a un SUPERADMIN.');
      return;
    }
    const assigned = branches.find((b) => String(b.id_sucursal) === operatorBranchId);
    if (!assigned && branches.length) {
      setBranchId('');
      setCatalogBranchId('');
      setMessage('La sucursal asignada al operador no está disponible. Contacta a un SUPERADMIN.');
      return;
    }
    setBranchId(operatorBranchId);
    setCatalogBranchId(operatorBranchId);
  }, [isOperator, operatorBranchId, branches]);

  useEffect(() => {
    if (!branchId) return;
    const sameLoadedOrderBranch = loadedPendingOrder &&
      String(loadedPendingOrder.id_sucursal || '') === String(branchId);
    if (!sameLoadedOrderBranch) {
      setCart([]);
      if (loadedPendingOrder) setLoadedPendingOrder(null);
    }
    setCatalogBranchId(branchId);
    loadInventory(branchId, { search: '', type: saleType, gameId, setId }).catch((error) => setMessage(error.message));
  }, [branchId, loadedPendingOrder?.row_id]);

  useEffect(() => {
    setSetId('');
    if (gameId) loadTcgSets(gameId).catch((error) => setMessage(error.message));else
    setTcgSets([]);
  }, [gameId]);

  useEffect(() => {
    const selectedBranch = catalogOpen ? catalogBranchId || branchId : branchId;
    if (!selectedBranch) return;
    const timer = setTimeout(() => {
      loadInventory(selectedBranch).catch((error) => setMessage(error.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch, saleType, gameId, setId, productCategory, catalogBranchId, catalogOpen]);

  const visibleInventory = inventory;


  const total = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    );
  }, [cart]);


  useEffect(() => {
    const timer = setTimeout(() => {
      loadClients(clientSearch).catch((error) => setMessage(error.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [clientSearch]);

  useEffect(() => {
    if (!clientId) {setLoyalty(null);setPointsToRedeem(0);return;}
    api(`/api/v1/benefits/clients/${clientId}`).
    then((r) => setLoyalty(r.data?.account || null)).
    catch(() => setLoyalty(null));
  }, [clientId]);

  async function previewBenefits({ promo = promoCode, points = pointsToRedeem, silent = false } = {}) {
    try {
      const normalizedPromo = String(promo || '').trim().toUpperCase();
      const normalizedPoints = Math.max(0, Number(points || 0));
      const r = await api('/api/v1/benefits/quote', {
        method: 'POST',
        body: JSON.stringify({
          clientId, subtotal: total, promoCode: normalizedPromo, points: normalizedPoints,
          channel: 'POS_LOCAL', branchId
        })
      });
      setPromoCode(normalizedPromo);
      setPointsToRedeem(normalizedPoints);
      setBenefitPreview(r.data);
      if (!silent) setMessage(normalizedPromo ? 'Promoción aplicada correctamente.' : 'Beneficios validados.');
      return r.data;
    } catch (e) {setBenefitPreview(null);setMessage(e.message);throw e;}
  }

  const itemKey = (item) => `${item.item_type || 'PRODUCT'}:${item.item_id || item.product_id || item.inventory_id}`;


  function stopCamera() {
    try {cameraStreamRef.current?.getTracks?.().forEach((track) => track.stop());} catch {}
    cameraStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  }

  async function resolveScannedCode(rawCode, { source = 'LECTOR' } = {}) {
    const input = String(rawCode || '').trim();
    if (/^PED-/i.test(input)) {
      const rows = await searchOrdersForPOS(input);
      const exact = (rows || []).find((order) => String(order.id_pedido || '').toUpperCase() === input.toUpperCase());
      if (!exact) {setMessage(`No se encontró el pedido ${input}.`);return;}
      await loadPendingOrderToPOS(exact);
      return;
    }
    const quantityOnly = input.match(/^(\d{1,3})\s*[*xX]\s*$/);
    if (quantityOnly) {
      const quantity = Math.max(1, Math.min(999, Number(quantityOnly[1])));
      setPendingScanQuantity(quantity);
      setProductSearch('');
      setMessage(`Cantidad ${quantity} preparada. Escanea o escribe el código del artículo.`);
      setTimeout(() => scanInputRef.current?.focus(), 0);
      return;
    }
    const quantityAndCode = input.match(/^(\d{1,3})\s*[*xX]\s*(.+)$/);
    const requestedQuantity = quantityAndCode ? Math.max(1, Math.min(999, Number(quantityAndCode[1]))) : pendingScanQuantity;
    const code = String(quantityAndCode?.[2] || input).trim();
    if (!code || !branchId) return;
    setScanBusy(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ branchId, type: 'ALL', search: code, gameId: '', setId: '', category: '', limit: '40' });
      const body = await api(`/api/v1/orders/pos/catalog?${params}`);
      const rows = Array.isArray(body.data) ? body.data : [];
      const norm = (value) => String(value ?? '').trim().toUpperCase();
      const target = norm(code);
      const exact = rows.filter((item) => [item.sku, item.codigo_barras, item.barcode, item.barcode_value, item.item_id, item.product_id, item.inventory_id, item.card_number].some((value) => norm(value) === target));
      const matches = exact.length ? exact : rows;
      if (matches.length === 1) {
        const added = addToCart(matches[0], requestedQuantity);setProductSearch('');setScanMode(true);setPendingScanQuantity(1);
        if (added) setMessage('');
        setTimeout(() => scanInputRef.current?.focus(), 0);return;
      }
      if (matches.length > 1) {
        setInventory(matches);setProductSearch(code);setCatalogOpen(true);setScanMode(false);setPendingScanQuantity(1);
        setMessage(`Se encontraron ${matches.length} coincidencias para ${code}. Selecciona el artículo.`);return;
      }
      // Un código simple también puede ser promocional. Las expresiones de
      // cantidad (2*SKU) nunca se envían al motor de promociones.
      if (!quantityAndCode && pendingScanQuantity === 1) {
        try {
          const quote = await previewBenefits({ promo: code, points: 0, silent: true });
          const discount = Number(quote?.discountPromo || 0);
          if (discount > 0) {
            setProductSearch('');setScanMode(true);
            setMessage(`✓ Promoción ${code.toUpperCase()} aplicada: -${money(discount)}.`);
            setTimeout(() => scanInputRef.current?.focus(), 0);return;
          }
        } catch {}
      }
      setPendingScanQuantity(1);
      setMessage(`Código ${code} no encontrado como artículo o promoción disponible.`);
      setTimeout(() => scanInputRef.current?.focus(), 0);
    } catch (error) {setMessage(error.message || 'No se pudo procesar el código.');} finally
    {setScanBusy(false);}
  }

  async function handleVisionPosResult(result) {
    if (!branchId) throw new Error('No hay sucursal activa para la venta.');

    if (result?.barcode) {
      setVisionOpen(false);
      await resolveScannedCode(result.barcode, { source: 'VISION' });
      return;
    }

    const queries = visionQueries(result, { max: 6 });
    const found = new Map();

    for (const q of queries) {
      const params = new URLSearchParams({
        branchId,
        type: 'ALL',
        search: q,
        gameId: '',
        setId: '',
        category: '',
        limit: '60'
      });
      try {
        const r = await api(`/api/v1/orders/pos/catalog?${params}`);
        for (const item of r.data || []) {
          const score = scoreVisionCandidate(item, result);
          const key = `${item.item_type || 'PRODUCT'}:${item.item_id || item.product_id || item.inventory_id || item.sku}`;
          const previous = found.get(key);
          if (!previous || score > previous.score) found.set(key, { ...item, key, score });
        }
      } catch {}
    }

    const candidates = [...found.values()].
    filter((x) => x.score >= 0.20).
    sort((a, b) => b.score - a.score).
    slice(0, 8);

    setVisionCandidates(candidates);
    setVisionOpen(false);

    if (candidates.length === 1 && candidates[0].score >= 0.90) {
      addToCart(candidates[0]);
      setMessage('');
      return;
    }

    if (candidates.length > 0) {
      setVisionPickerOpen(true);
      return;
    }

    // VISION-002A INTERNET FALLBACK
    const internetQuery = result?.tcgHints?.passcode || result?.tcgHints?.setCode || result?.tcgHints?.name || queries[0] || result?.text || '';
    setVisionInternetQuery(internetQuery);
    setVisionInternetCandidates([]);
    setVisionInternetError('');
    setVisionInternetBusy(true);
    setVisionInternetOpen(true);

    try {
      const external = await api('/api/v1/tcg/vision/internet-discovery', {
        method: 'POST',
        body: JSON.stringify({
          text: result?.text || '',
          queries,
          hints: result?.tcgHints || {},
          limit: 8
        })
      });
      const externalRows = external?.data?.results || [];
      setVisionInternetCandidates(externalRows);
      if (!externalRows.length) {
        setVisionInternetError('No se encontraron coincidencias externas. Toma otra foto procurando que el nombre sea legible.');
      }
    } catch (e) {
      setVisionInternetError(e.message || 'No se pudo consultar el catalogo externo.');
    } finally {
      setVisionInternetBusy(false);
    }
  }

  function activateScanner() {
    setCatalogOpen(false);
    setScanMode(true);
    setProductSearch('');
    setMessage('Modo escáner activo. Escanea código de barras o QR y presiona Enter.');
    setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  async function openCameraScanner() {
    setCatalogOpen(false);
    setScanMode(false);
    setCameraError('');
    setCameraOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('La cámara no está disponible en este navegador.');
      if (!('BarcodeDetector' in window)) throw new Error('Este navegador no soporta lectura de código/QR por cámara. Usa Chrome/Edge actualizado o un lector físico.');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      cameraStreamRef.current = stream;
      setTimeout(async () => {
        const video = cameraVideoRef.current;
        if (!video) return;
        video.srcObject = stream;
        try {await video.play();} catch {}
      }, 0);
    } catch (error) {
      setCameraError(error.message || 'No se pudo abrir la cámara.');
      stopCamera();
    }
  }

  async function detectFromCamera() {
    const video = cameraVideoRef.current;
    if (!video || !('BarcodeDetector' in window)) return;
    setScanBusy(true);
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf'] });
      const found = await detector.detect(video);
      const value = String(found?.[0]?.rawValue || '').trim();
      if (!value) {setCameraError('No se detectó ningún código. Acerca el código a la cámara e inténtalo nuevamente.');return;}
      stopCamera();
      setCameraOpen(false);
      await resolveScannedCode(value, { source: 'CÁMARA' });
    } catch (error) {
      setCameraError(error.message || 'No se pudo leer el código.');
    } finally {
      setScanBusy(false);
    }
  }

  useEffect(() => () => stopCamera(), []);

  // GMX_POS_PAGO_MIXTO_001_V4 + POS-007
  const totalBeforeManualDiscount = useMemo(() => {
    const raw = cart.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);
    const previewTotal = Number(benefitPreview?.total);
    return Number.isFinite(previewTotal) ? Number(previewTotal.toFixed(4)) : Number(raw.toFixed(4));
  }, [cart, benefitPreview]);

  const canUseManualDiscount = ['SUPERADMIN', 'ADMIN'].includes(String(currentUser?.rol || '').toUpperCase());

  const manualDiscountError = useMemo(() => {
    const value = Number(manualDiscountValue || 0);
    if (value <= 0) return '';
    if (!canUseManualDiscount) return 'Tu usuario no tiene permiso para aplicar descuentos manuales.';
    if (!['PORCENTAJE', 'MONTO'].includes(manualDiscountType)) return 'Selecciona un tipo de descuento válido.';
    if (manualDiscountType === 'PORCENTAJE' && value > 100) return 'El porcentaje no puede ser mayor a 100%.';
    if (manualDiscountType === 'MONTO' && value > totalBeforeManualDiscount) return 'El descuento no puede superar el total disponible.';
    if (!String(manualDiscountReason || '').trim()) return 'Captura el motivo del descuento manual.';
    return '';
  }, [manualDiscountValue, manualDiscountType, manualDiscountReason, totalBeforeManualDiscount, canUseManualDiscount]);

  const manualDiscountAmount = useMemo(() => {
    const value = Number(manualDiscountValue || 0);
    if (value <= 0 || manualDiscountError) return 0;
    return manualDiscountType === 'PORCENTAJE' ?
    Number((totalBeforeManualDiscount * value / 100).toFixed(4)) :
    Number(value.toFixed(4));
  }, [manualDiscountValue, manualDiscountType, totalBeforeManualDiscount, manualDiscountError]);

  const saleTotal = useMemo(() => {
    return Number(Math.max(0, totalBeforeManualDiscount - manualDiscountAmount).toFixed(2));
  }, [totalBeforeManualDiscount, manualDiscountAmount]);

  useEffect(() => {
    setBenefitPreview(null);
  }, [cart]);

  useEffect(() => {
    if (!catalogAddFeedback) return;
    const timer = setTimeout(() => setCatalogAddFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [catalogAddFeedback]);

  useEffect(() => {
    if (tab !== 'pos' || !isPosAttentionMessage(message)) return undefined;
    const currentMessage = message;
    const timer = setTimeout(() => {
      setMessage((value) => value === currentMessage ? '' : value);
      setTimeout(() => scanInputRef.current?.focus(), 0);
    }, 3200);
    return () => clearTimeout(timer);
  }, [message, tab]);


  function addToCart(item, quantityToAdd = 1) {
    const price = Number(item.price);
    if (!Number.isFinite(price)) {
      setMessage('El artículo no tiene un precio de venta válido.');
      return false;
    }

    const key = itemKey(item);
    const existing = cart.find((row) => row.key === key);
    const stock = Math.max(0, Number(item.stock || 0));
    const increment = Math.max(1, Math.min(999, Math.trunc(Number(quantityToAdd) || 1)));
    const nextQuantity = (existing?.quantity || 0) + increment;

    if (nextQuantity > stock) {
      setMessage(`No hay más existencia disponible de ${item.name || 'este artículo'} en esta sucursal.`);
      setCatalogAddFeedback({ key, name: item.name || 'Artículo', quantity: existing?.quantity || 0, blocked: true, stamp: Date.now() });
      return false;
    }

    if (existing) {
      setCart((current) => current.map((row) => row.key === key ? { ...row, quantity: nextQuantity } : row));
    } else {
      setCart((current) => [...current, { ...item, key, quantity: increment }]);
    }

    setMessage('');
    setCatalogAddFeedback({ key, name: item.name || 'Artículo', quantity: nextQuantity, blocked: false, stamp: Date.now() });
    return true;
  }

  function changeQuantity(key, value) {
    const quantity = Math.max(1, Math.trunc(Number(value) || 1));
    setCart((current) => current.map((item) => item.key === key ? {
      ...item, quantity: Math.min(quantity, Number(item.stock || 0))
    } : item));
  }

  function removeFromCart(key) {
    setCart((current) => current.filter((item) => item.key !== key));
  }

  function setPaymentsSafe(update) {
    setPayments((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      return (Array.isArray(next) ? next : []).map((row) => ({
        ...row,
        amount: sanitizeMoneyInput(row?.amount),
        cashReceived: sanitizeMoneyInput(row?.cashReceived),
        reference: sanitizePaymentReference(row?.reference)
      }));
    });
  }

  function blockInvalidMoneyKey(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
    if (['e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
  }

  function blockInvalidMoneyPaste(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
    const pasted = event.clipboardData?.getData('text') || '';
    if (!/^\d*(?:[.,]\d{0,2})?$/.test(pasted.trim())) event.preventDefault();
  }

  function checkout() {
    setMessage('');
    if (!cart.length) {setMessage('El carrito está vacío.');return;}
    if (loadedPendingOrder) {openPayOrder(loadedPendingOrder);return;}
    if (draftOrderMode) {savePendingAdminOrder();return;}
    const availablePoints = Math.max(0, Number(loyalty?.puntos_disponibles || 0));
    if (clientId && availablePoints > 0 && Number(pointsToRedeem || 0) === 0) {
      setPointsModalOpen(true);return;
    }
    setCheckoutModalOpen(true);
  }

  async function savePendingAdminOrder() {
    if (!branchId) {setMessage('Selecciona una sucursal.');return;}
    if (!cart.length) {setMessage('El pedido no tiene artículos.');return;}
    try {
      const body = await api('/api/v1/orders/admin-pending', {
        method: 'POST',
        body: JSON.stringify({
          branchId, clientId, notes,
          items: cart.map((item) => ({ itemType: item.item_type, itemId: item.item_id,
            productId: item.product_id || '', inventoryId: item.inventory_id || '', quantity: item.quantity }))
        })
      });
      setCart([]);setNotes('');setClientId('');setClientSearch('');setDraftOrderMode(false);setTab('orders');
      setMessage(`Pedido ${body.data.id_pedido} creado como pendiente de pago.`);
      await loadOrders('');
    } catch (error) {setMessage(error.message);}
  }

  async function performCheckout() {
    setMessage('');
    if (!branchId) {
      setMessage('Selecciona una sucursal.');
      return;
    }

    if (!cart.length) {
      setMessage('El carrito está vacío.');
      return;
    }

    if (Number(manualDiscountValue || 0) > 0 && manualDiscountError) {
      setMessage(manualDiscountError);
      return;
    }

    try {
      const salePayload = {
        branchId,
        clientId,
        paymentMethod,
        paymentReference: sanitizePaymentReference(paymentReference),
        payments: payments.map((row, index) => ({
          method: index === 0 ? paymentMethod : row.method,
          amount: Number(sanitizeMoneyInput(row.amount) || 0),
          cashReceived: (index === 0 ? paymentMethod : row.method) === 'EFECTIVO' ? Number(sanitizeMoneyInput(row.cashReceived) || 0) : null,
          reference: index === 0 ? paymentMethod === 'EFECTIVO' ? '' : sanitizePaymentReference(paymentReference) : sanitizePaymentReference(row.reference)
        })),
        notes,
        promoCode,
        pointsToRedeem,
        manualDiscountType: Number(manualDiscountValue || 0) > 0 ? manualDiscountType : '',
        manualDiscountValue: Number(manualDiscountValue || 0),
        manualDiscountReason: Number(manualDiscountValue || 0) > 0 ? manualDiscountReason.trim() : '',
        items: cart.map((item) => ({
          itemType: item.item_type,
          itemId: item.item_id,
          productId: item.product_id || '',
          inventoryId: item.inventory_id || '',
          quantity: item.quantity
        }))
      };

      const fingerprint = JSON.stringify(salePayload);
      const requestKey = saleAttempt.key && saleAttempt.fingerprint === fingerprint ?
      saleAttempt.key :
      `POSREQ-${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)}`;

      if (requestKey !== saleAttempt.key || fingerprint !== saleAttempt.fingerprint) {
        setSaleAttempt({ key: requestKey, fingerprint });
      }

      const body = await api('/api/v1/orders/pos', {
        method: 'POST',
        body: JSON.stringify({ ...salePayload, saleRequestId: requestKey })
      });

      setCheckoutModalOpen(false);
      setMessage(`Venta ${body.data.id_pedido} registrada correctamente.`);
      setCompletedOrder(body.data);
      setReceiptChannel('');
      setReceiptEmail(body.data.email || '');
      setGuestPhone(body.data.telefono || '');
      setGuestWhatsAppConsent(false);
      setReceiptDeliveryStatus(null);
      setSaleAttempt({ key: '', fingerprint: '' });
      setCart([]);
      setPaymentReference('');
      setPayments([{ method: 'EFECTIVO', amount: 0, cashReceived: 0, reference: '' }]);
      setNotes('');
      setPromoCode('');
      setPointsToRedeem(0);
      setBenefitPreview(null);
      setManualDiscountType('PORCENTAJE');
      setManualDiscountValue(0);
      setManualDiscountReason('');

      await Promise.all([
      loadInventory(branchId),
      loadOrders('')]
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  // DEV-004B — la devolución permanece dentro del POS.
  function openReturnFlow(order) {
    if (!order?.id_pedido) return;
    setReturnFlow({
      open: true, stage: 'auth', order, password: '',
      authorizationToken: '', authorizationId: '', authorizer: null, items: [],
      reason: '', refund: false, refundMethod: 'EFECTIVO', refundReference: '',
      notes: '', reintegrateStock: true, busy: false, error: ''
    });
  }

  function closeReturnFlow() {
    if (returnFlow.busy) return;
    setReturnFlow((current) => ({ ...current, open: false, password: '', authorizationToken: '', error: '' }));
  }

  function normalizeReturnItems(data) {
    const source = Array.isArray(data?.detalles) ? data.detalles :
    Array.isArray(data?.items) ? data.items :
    Array.isArray(data?.details) ? data.details : [];
    return source.map((item, index) => {
      const sold = Math.max(0, Number(item.cantidad_vendida ?? item.cantidad ?? item.quantity ?? 0));
      const returned = Math.max(0, Number(item.devuelto ?? item.cantidad_devuelta ?? item.returnedQuantity ?? 0));
      return {
        ...item,
        _key: item.row_id || item.id_detalle_pedido || item.idDetallePedido || `${index}`,
        _detailId: item.id_detalle_pedido || item.idDetallePedido || item.id_detalle || '',
        _available: Math.max(0, sold - returned),
        _quantity: 0,
        _condition: item.condicion_articulo || item.condition || 'VENDIBLE',
        _destination: item.destino_articulo || item.destination || 'INVENTARIO_DISPONIBLE',
        _reintegrate: item.reintegra_stock !== false
      };
    }).filter((item) => item._available > 0);
  }

  function getReturnAuthorizationMessage(error) {
    const code = String(
      error?.code ||
      error?.error ||
      error?.data?.error ||
      error?.response?.data?.error ||
      error?.response?.data?.code ||
      ''
    ).trim().toUpperCase();

    const messages = {
      INVALID_AUTHORIZER_CREDENTIALS: 'Contraseña administrativa incorrecta. Verifica la contraseña e inténtalo nuevamente.',
      AUTHORIZER_CREDENTIALS_REQUIRED: 'Ingresa la contraseña administrativa para continuar.',
      RETURN_AUTHORIZATION_FORBIDDEN: 'El administrador no tiene autorización para realizar devoluciones.',
      RETURN_AUTHORIZATION_BRANCH_FORBIDDEN: 'El administrador no tiene autorización para esta sucursal.',
      RETURN_AUTHORIZATION_INVALID_OR_EXPIRED: 'La autorización administrativa superó el tiempo permitido. Solicita una nueva autorización para continuar.',
      ORDER_NOT_FOUND: 'No se encontró el pedido.'
    };

    if (messages[code]) return messages[code];

    const raw = String(error?.message || error?.response?.data?.message || '').trim();
    return messages[raw] || raw || 'No fue posible autorizar la devolución.';
  }

  async function authorizeReturnInPOS() {
    const orderId = String(returnFlow.order?.id_pedido || '').trim();
    const password = String(returnFlow.password || '');
    if (!orderId) {setReturnFlow((current) => ({ ...current, error: 'No se encontró el pedido.' }));return;}
    if (!password) {setReturnFlow((current) => ({ ...current, error: 'Captura la contraseña administrativa.' }));return;}

    setReturnFlow((current) => ({ ...current, busy: true, error: '' }));
    try {
      const auth = await api('/api/v1/commercial/returns/authorize', {
        method: 'POST', body: JSON.stringify({ orderId, password })
      });
      const data = auth?.data || {};
      const authorizationToken = String(
        data.authorizationToken || data.token || data.returnAuthorizationToken || data.authorization?.token || ''
      ).trim();
      if (!authorizationToken) throw new Error('La autorización fue aprobada pero no se recibió el token de operación.');

      const detail = await api(`/api/v1/commercial/returns-order/${encodeURIComponent(orderId)}`);
      const detailData = detail?.data || detail;
      const items = normalizeReturnItems(detailData);
      if (!items.length) throw new Error('El pedido no tiene artículos disponibles para devolución.');

      setReturnFlow((current) => ({
        ...current, stage: 'return', password: '', authorizationToken,
        authorizationId: data.authorizationId || data.id_autorizacion || '',
        authorizer: data.authorizedBy || data.autorizador || null,
        items, busy: false, error: ''
      }));
    } catch (error) {
      setReturnFlow((current) => ({
        ...current,
        busy: false,
        error: getReturnAuthorizationMessage(error)
      }));
    }
  }

  function setReturnItemQuantity(key, value) {
    setReturnFlow((current) => ({ ...current, items: current.items.map((item) => {
        if (item._key !== key) return item;
        return { ...item, _quantity: Math.min(item._available, Math.max(0, Math.trunc(Number(value) || 0))) };
      }) }));
  }

  async function submitReturnInPOS() {
    const selected = returnFlow.items.filter((item) => Number(item._quantity || 0) > 0);
    if (!selected.length) {setReturnFlow((current) => ({ ...current, error: 'Selecciona al menos un artículo para devolver.' }));return;}
    if (!String(returnFlow.reason || '').trim()) {setReturnFlow((current) => ({ ...current, error: 'Indica el motivo de la devolución.' }));return;}

    setReturnFlow((current) => ({ ...current, busy: true, error: '' }));
    try {
      const payload = {
        reference: String(returnFlow.order?.id_pedido || ''),
        customerName: returnFlow.order?.nombre_cliente || 'Público general',
        reason: String(returnFlow.reason || '').trim(),
        refund: Boolean(returnFlow.refund),
        refundMethod: returnFlow.refund ? returnFlow.refundMethod : '',
        refundReference: returnFlow.refund ? sanitizePaymentReference(returnFlow.refundReference) : '',
        notes: String(returnFlow.notes || '').trim(),
        reintegrateStock: Boolean(returnFlow.reintegrateStock),
        items: selected.map((item) => ({
          detailId: item._detailId,
          quantity: Number(item._quantity || 0),
          condition: item._condition,
          destination: item._destination,
          reintegrateStock: Boolean(returnFlow.reintegrateStock && item._reintegrate),
          productId: item.id_producto || item.product_id || '',
          inventoryId: item.id_inventario || item.inventory_id || ''
        })),
        authorizationToken: returnFlow.authorizationToken
      };
      const body = await api('/api/v1/commercial/returns/sale', { method: 'POST', body: JSON.stringify(payload) });
      const returnId = body?.data?.id || body?.data?.id_devolucion || 'devolución';
      const amount = body?.data?.importe;
      setReturnFlow({
        open: false, stage: 'auth', order: null, password: '', authorizationToken: '',
        authorizationId: '', authorizer: null, items: [], reason: '', refund: false,
        refundMethod: 'EFECTIVO', refundReference: '', notes: '', reintegrateStock: true,
        busy: false, error: ''
      });
      setMessage(`Devolución ${returnId} completada${amount !== undefined ? ` · ${money(amount)}` : ''}.`);
      await Promise.all([loadOrders(orderSearch), searchOrdersForPOS(orderLookupSearch).catch(() => {})]);
    } catch (error) {
      setReturnFlow((current) => ({ ...current, busy: false, error: error.message || 'No fue posible completar la devolución.' }));
    }
  }

  function openPayOrder(order) {
    setPayOrder(order);
    setPayMethod('EFECTIVO');
    setPayReference('');
    setPayNotes('');
  }

  async function loadPendingOrderToPOS(order) {
    const state = String(order?.estado_pedido || '').toUpperCase();
    if (state !== 'PENDIENTE') {
      setMessage(`El pedido ${order?.id_pedido || ''} está ${state || 'sin estado'} y no puede cargarse para cobro.`);
      return;
    }
    try {
      const body = await api(`/api/v1/orders/${order.row_id}`);
      const full = body.data;
      setLoadedPendingOrder(full);
      setBenefitPreview(null);setPromoCode('');setPointsToRedeem(0);setManualDiscountValue(0);setManualDiscountReason('');
      setBranchId(full.id_sucursal || branchId);
      setCart((full.detalles || []).map((detail, index) => ({
        key: `ORDER:${detail.row_id || index}`,
        item_type: String(detail.tipo || '').toUpperCase() === 'TCG' ? 'TCG' : 'PRODUCT',
        item_id: detail.id_inventario || detail.id_producto || detail.id_detalle,
        product_id: detail.id_producto || '', inventory_id: detail.id_inventario || '',
        name: detail.producto || 'Artículo', sku: detail.sku || '',
        price: Number(detail.precio_unitario ?? detail.precio ?? 0),
        quantity: Number(detail.cantidad || 0), stock: Number(detail.cantidad || 0),
        lockedOrderLine: true
      })));
      setProductSearch('');setOrderLookupOpen(false);setMessage('');
    } catch (error) {setMessage(error.message);}
  }

  async function confirmPendingOrderPayment() {
    if (!payOrder) return;
    setPayBusy(true);
    try {
      const body = await api(`/api/v1/orders/${payOrder.row_id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          paymentMethod: payMethod,
          paymentReference: payReference,
          notes: payNotes
        })
      });

      setMessage(`Pedido ${body.data.id_pedido} pagado correctamente.`);
      setCompletedOrder(body.data);
      setPayOrder(null);
      setLoadedPendingOrder(null);
      setCart([]);
      setPayReference('');
      setPayNotes('');

      await Promise.all([
      loadOrders(orderSearch),
      loadInventory(branchId)]
      );

      if (selectedOrder?.row_id === body.data.row_id) {
        setSelectedOrder(body.data);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPayBusy(false);
    }
  }

  function receiptHtml(order) {
    const moneyLocal = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const details = Array.isArray(order?.detalles) ? order.detalles : [];
    const paymentRows = Array.isArray(order?.pagos) ? order.pagos : [];
    const discounts = Number(order?.descuento_promocion || 0) + Number(order?.descuento_puntos || 0);
    const rows = details.map((x) => `<tr><td><b>${esc(x.producto || 'Artículo')}</b>${x.sku ? `<small>${esc(x.sku)}</small>` : ''}${String(x.tipo || '').toUpperCase() === 'TCG' && x.detalle ? `<small>${esc(x.detalle)}</small>` : ''}</td><td class="center">${Number(x.cantidad || 0)}</td><td class="right">${moneyLocal(x.precio_unitario || x.precio)}</td><td class="right"><b>${moneyLocal(x.subtotal)}</b></td></tr>`).join('');
    return brandText(`<!doctype html><html><head><meta charset="utf-8"><title>GMX · ${esc(order?.id_pedido || 'Comprobante')}</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:18px}.ticket{max-width:760px;margin:auto}.brand{text-align:center}.brand h1{margin:0;font-size:24px}.muted{color:#666;font-size:12px}
      .meta{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:16px 0;padding:10px;border:1px solid #ddd;border-radius:8px}table{width:100%;border-collapse:collapse}th,td{padding:8px 5px;border-bottom:1px solid #ddd;font-size:12px;text-align:left}th{font-size:10px;text-transform:uppercase}.center{text-align:center}.right{text-align:right}small{display:block;color:#666;margin-top:2px}
      .totals{margin:16px 0 0 auto;max-width:300px}.totals div{display:flex;justify-content:space-between;padding:4px 0}.total{font-size:20px;border-top:2px solid #111;margin-top:4px;padding-top:9px!important}.pay{margin-top:16px;padding:10px;border:1px solid #ddd;border-radius:8px}.thanks{text-align:center;margin-top:20px;font-size:11px;color:#666}@media print{body{padding:0}.ticket{max-width:none}}@page{margin:10mm}
      </style></head><body><div class="ticket"><div class="brand"><h1>GMX</h1><div>Ticket / comprobante de venta</div><div class="muted">${esc(order?.id_pedido || '')}</div></div>
      <div class="meta"><div><b>Fecha</b><br>${order?.fecha ? new Date(order.fecha).toLocaleString('es-MX') : '—'}</div><div><b>Sucursal</b><br>${esc(order?.sucursal || '—')}</div><div><b>Cliente</b><br>${esc(order?.nombre_cliente || 'Público general')}</div><div><b>Estado</b><br>${esc(order?.estado_pedido || '')}</div></div>
      <table><thead><tr><th>Artículo</th><th class="center">Cant.</th><th class="right">Precio</th><th class="right">Importe</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="totals"><div><span>Subtotal</span><b>${moneyLocal(order?.subtotal)}</b></div>${discounts > 0 ? `<div><span>Descuentos</span><b>-${moneyLocal(discounts)}</b></div>` : ''}<div class="total"><b>Total</b><b>${moneyLocal(order?.total)}</b></div></div>
      <div class="pay"><b>Método de pago:</b> ${esc(order?.metodo_pago || '')}${order?.referencia_pago ? `<br><b>Referencia:</b> ${esc(order.referencia_pago)}` : ''}</div><div class="thanks">Gracias por tu compra.</div></div></body></html>`);
  }

  function printReceipt(order, { pdf = false } = {}) {
    const win = window.open('', '_blank', 'width=900,height=760');
    if (!win) {setMessage(brandText("El navegador bloqueó la ventana del comprobante. Permite ventanas emergentes para GMX."));return;}
    win.document.open();win.document.write(receiptHtml(order));win.document.close();win.focus();
    setTimeout(() => {if (pdf) setMessage('En el diálogo de impresión selecciona “Guardar como PDF”.');win.print();}, 250);
  }

  async function getFullOrder(rowId) {
    const body = await api(`/api/v1/orders/${rowId}`);
    return body.data;
  }

  async function printOrderFromHistory(rowId, options = {}) {
    try {printReceipt(await getFullOrder(rowId), options);} catch (error) {setMessage(error.message);}
  }

  function closePaperlessReceipt() {
    setCompletedOrder(null);
    setReceiptDeliveryStatus(null);
    setReceiptChannel('');
    setGuestWhatsAppConsent(false);
    setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  async function emailReceipt(order, { automatic = false, recipient = '' } = {}) {
    const target = String(recipient || order?.email || '').trim();
    if (!target) {if (!automatic) setMessage('Captura el correo destinatario.');return;}
    setReceiptBusy(true);
    try {
      const body = await api(`/api/v1/orders/${order.row_id}/receipt/email`, { method: 'POST', body: JSON.stringify({ email: target }) });
      setReceiptDeliveryStatus({ type: 'sent', text: `Comprobante enviado a ${body.data.to}.` });
      const isPosReceipt = completedOrder?.row_id === order.row_id;
      if (!automatic && !isPosReceipt) setMessage(`Comprobante enviado correctamente a ${body.data.to}.`);
      if (isPosReceipt) setTimeout(closePaperlessReceipt, 650);
    } catch (error) {
      setReceiptDeliveryStatus({ type: 'error', text: `No se pudo enviar el correo: ${error.message}` });
      if (!automatic) setMessage(error.message);
    } finally
    {setReceiptBusy(false);}
  }

  async function shareGuestReceiptWhatsApp(order) {
    if (!guestWhatsAppConsent) {setMessage('Solicita autorización del comprador para enviar el comprobante por WhatsApp.');return;}
    const popup = window.open('', 'gmx-whatsapp-receipt');
    try {if (popup) popup.opener = null;} catch {}
    setWhatsAppBusy(true);
    try {
      const body = await api(`/api/v1/orders/${order.row_id}/receipt/whatsapp`, {
        method: 'POST',
        body: JSON.stringify({ phone: guestPhone })
      });
      const updatedOrder = body.data.order;
      setCompletedOrder(updatedOrder);
      const text = brandText(`GMX · Comprobante de compra\nVenta: ${updatedOrder.id_pedido}\nTotal: ${money(updatedOrder.total)}\nGracias por tu compra.`);
      const url = `https://wa.me/${body.data.whatsappNumber}?text=${encodeURIComponent(text)}`;
      if (popup) popup.location.href = url;else window.location.href = url;
      setReceiptDeliveryStatus({ type: 'sent', text: `WhatsApp preparado para el teléfono terminado en ${body.data.whatsappNumber.slice(-4)}.` });
      setTimeout(closePaperlessReceipt, 650);
    } catch (error) {
      try {popup?.close();} catch {}
      setMessage(error.message);
    } finally {
      setWhatsAppBusy(false);
    }
  }

  async function openOrder(rowId) {
    try {
      const body = await api(`/api/v1/orders/${rowId}`);
      setSelectedOrder(body.data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function cancelOrder(order, reason) {
    if (!confirm(`¿Cancelar ${order.id_pedido} y devolver el stock?`)) return;

    try {
      const body = await api(`/api/v1/orders/${order.row_id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      setSelectedOrder(body.data);
      setMessage(`Venta ${order.id_pedido} cancelada y stock restituido.`);

      await Promise.all([
      loadInventory(branchId),
      loadOrders(orderSearch)]
      );
    } catch (error) {
      setMessage(error.message);
    }
  }

  const posPromoSlide = posPromoSlides[posPromoIndex] || null;
  const posPromoExternal = String(posPromoSlide?.media_source || 'LIBRARY').toUpperCase() === 'URL';
  const posPromoImage = posPromoExternal ? posPromoSlide?.url_desktop :
    posPromoSlide?.id_media_desktop ? `/api/public/media/${encodeURIComponent(posPromoSlide.id_media_desktop)}` : '';

  return (
    <div className={`pos-stack ${isOperator ? 'operator-pos-page' : ''}`}>
      {isOperator && !posStandalone && !posKioskMode && !posFullscreen && !posSessionStarted && fullscreenCapable ? <div className="gmx-pos-fullscreen-gate" role="dialog" aria-modal="true" aria-label="Iniciar punto de venta">
        <div className="gmx-pos-fullscreen-card">
          <div className="gmx-pos-fullscreen-logo">{brandText("GMX POS")}</div>
          <h2>Iniciar Punto de Venta</h2>
          <p>{brandText("GMX necesita una confirmación del operador para activar la pantalla completa del navegador.")}</p>
          <button type="button" onClick={enterPosFullscreen}>⛶ Iniciar POS</button>
          <small>{brandText("Desktop: Ctrl + Alt + X abre la salida protegida sin abandonar pantalla completa. Tablet/móvil: mantén presionado GMX POS durante 5 segundos. La salida requiere contraseña.")}</small>
        </div>
      </div> : null}
      {isOperator && posExitOpen ? <div className="gmx-pos-exit-lock" role="dialog" aria-modal="true" aria-label="Salida protegida del punto de venta">
        <form className="gmx-pos-exit-card" onSubmit={authorizeProtectedPosExit}>
          <div className="gmx-pos-exit-shield">{brandText("GMX POS")}</div>
          <h2>Salida protegida</h2>
          <p>El punto de venta está bloqueado. Usa Volver a pantalla completa para continuar, o autoriza la salida con la contraseña del operador.</p>
          <div className="gmx-pos-exit-context">
            <span><small>Operador</small><strong>{currentUser?.nombre || currentUser?.email || 'Usuario'}</strong></span>
            <span><small>Sucursal</small><strong>{branches.find((b) => String(b.id_sucursal) === String(operatorBranchId))?.nombre_sucursal || 'Sin sucursal'}</strong></span>
          </div>
          <label>Contraseña
            <input type="password" autoFocus autoComplete="current-password" value={posExitPassword} onChange={(e) => setPosExitPassword(e.target.value)} disabled={posExitBusy} />
          </label>
          {posExitError ? <div className="gmx-pos-exit-error">{posExitError}</div> : null}
          <div className="gmx-pos-exit-actions">
            <button type="button" className="secondary" onClick={cancelProtectedPosExit} disabled={posExitBusy}>Volver a pantalla completa</button>
            <button type="submit" className="danger" disabled={posExitBusy || !posExitPassword}>{posExitBusy ? 'Validando…' : 'Autorizar salida'}</button>
          </div>
          <small className="gmx-pos-exit-help">La salida autorizada cerrará esta sesión del operador.</small>
        </form>
      </div> : null}
      <section className={`content-card ${tab === 'pos' ? 'gmx-pos-host' : ''}`}>
        <div className="section-head">
          <div>
            <div className="eyebrow">VENTAS · POS LOCAL</div>
            <h2>Pedidos y punto de venta</h2>
          </div>
        </div>

        {message && tab !== 'pos' ? <div className="message">{message}</div> : null}
        {message && tab === 'pos' && !isPosAttentionMessage(message) ? <div className="gmx-pos-status-strip">{message}</div> : null}
        {message && tab === 'pos' && isPosAttentionMessage(message) ? <div className="gmx-pos-attention-layer" role="alertdialog" aria-modal="false" aria-label="Aviso del punto de venta">
          <div className="gmx-pos-attention-card">
            <button type="button" className="gmx-pos-attention-close" aria-label="Cerrar aviso" onClick={() => {setMessage('');setTimeout(() => scanInputRef.current?.focus(), 0);}}>×</button>
            <div className="gmx-pos-attention-icon">!</div>
            <strong>Revisa la operación</strong>
            <span>{message}</span>
            <button type="button" className="gmx-pos-attention-ok" onClick={() => {setMessage('');setTimeout(() => scanInputRef.current?.focus(), 0);}}>Continuar</button>
          </div>
        </div> : null}
        {completedOrder ? <div className="pos-sale-delivery-layer" role="dialog" aria-modal="true" aria-labelledby="pos-sale-delivery-title">
        <div className="pos-sale-completed pos-sale-delivery">
          <div className="pos-sale-delivery-head"><div><span className="eyebrow">VENTA COMPLETADA</span><strong>{completedOrder.id_pedido}</strong><small>{completedOrder.id_cliente ? completedOrder.nombre_cliente || 'Cliente registrado' : 'Público general'} · {money(completedOrder.total)}</small></div>
            <button type="button" className="pos-sale-delivery-close" aria-label="Cerrar comprobante" onClick={closePaperlessReceipt}>×</button>
          </div>
          <h3 id="pos-sale-delivery-title">Comprobante de venta</h3>
          <div className="pos-guest-delivery">
            <div><b>¿Cómo desea recibir su comprobante?</b><span>Selecciona un canal. Si es público general, el contacto se conservará solamente en esta venta.</span></div>
            <div className="pos-delivery-channel" role="group" aria-label="Canal de envío">
              <button type="button" className={receiptChannel === 'WHATSAPP' ? 'active' : ''} onClick={() => {setReceiptChannel('WHATSAPP');setReceiptDeliveryStatus(null);setGuestWhatsAppConsent(false);}}>WhatsApp</button>
              <button type="button" className={receiptChannel === 'EMAIL' ? 'active' : ''} onClick={() => {setReceiptChannel('EMAIL');setReceiptDeliveryStatus(null);setGuestWhatsAppConsent(false);}}>Correo</button>
            </div>
            {receiptChannel === 'WHATSAPP' ? <label className="pos-guest-phone">Número destinatario de WhatsApp<input inputMode="tel" autoComplete="tel" autoFocus value={guestPhone} onChange={(event) => setGuestPhone(event.target.value.replace(/[^0-9+ ()-]/g, '').slice(0, 20))} placeholder="664 123 4567" /></label> : null}
            {receiptChannel === 'EMAIL' ? <label className="pos-guest-phone">Correo destinatario<input type="email" autoComplete="email" autoFocus value={receiptEmail} onChange={(event) => setReceiptEmail(event.target.value.slice(0, 160))} placeholder="cliente@correo.com" /></label> : null}
            {receiptChannel ? <label className="pos-whatsapp-consent"><input type="checkbox" checked={guestWhatsAppConsent} onChange={(event) => setGuestWhatsAppConsent(event.target.checked)} /><span>El comprador autoriza recibir este comprobante por {receiptChannel === 'EMAIL' ? 'correo' : 'WhatsApp'}.</span></label> : null}
            {receiptDeliveryStatus ? <div className={`pos-delivery-status ${receiptDeliveryStatus.type}`}>{receiptDeliveryStatus.text}</div> : null}
            <div className="pos-receipt-actions">
              {receiptChannel === 'WHATSAPP' ? <button type="button" disabled={whatsAppBusy || !guestPhone.trim() || !guestWhatsAppConsent} onClick={() => shareGuestReceiptWhatsApp(completedOrder)}>{whatsAppBusy ? 'Preparando…' : 'Continuar en WhatsApp'}</button> : null}
              {receiptChannel === 'EMAIL' ? <button type="button" disabled={receiptBusy || !receiptEmail.trim() || !guestWhatsAppConsent} onClick={() => emailReceipt(completedOrder, { recipient: receiptEmail })}>{receiptBusy ? 'Enviando…' : 'Enviar por correo'}</button> : null}
              <button type="button" className="ghost" onClick={closePaperlessReceipt}>Sin comprobante</button>
            </div>
          </div>
        </div></div> : null}

        <div className="tabs" />

        {tab === 'pos' ?
        <div className="gmx-pos-terminal">
            <div className="gmx-pos-topline">
              <div className="gmx-pos-brand gmx-pos-brand-protected" title={isOperator ? 'Mantén presionado 5 segundos para solicitar salida' : undefined} onPointerDown={isOperator ? startPosLongPress : undefined} onPointerUp={isOperator ? clearPosLongPress : undefined} onPointerCancel={isOperator ? clearPosLongPress : undefined} onPointerLeave={isOperator ? clearPosLongPress : undefined}>{brandText("GMX POS")}</div>
              <div className="gmx-pos-topmeta">
                <span>Caja local</span>
                {isOperator ?
              <div className="gmx-pos-session-meta"><span>Sucursal</span><strong>{branches.find((b) => b.id_sucursal === branchId)?.nombre_sucursal || 'Sin sucursal asignada'}</strong></div> :
              <label className="gmx-pos-branch-inline">
                    <span>Sucursal</span>
                    <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                      <option value="">Selecciona</option>
                      {branches.map((branch) => <option key={branch.row_id} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
                    </select>
                  </label>}
                <div className="gmx-pos-session-meta"><span>Operador</span><strong>{currentUser?.nombre || currentUser?.email || 'Usuario'}</strong></div>
              </div>
            </div>

            <div className="gmx-pos-workspace">
              <main className="gmx-pos-left">
                <div className="gmx-pos-searchbar gmx-pos-searchbar-unified">
                  <div className="gmx-pos-search-input-wrap">
                    <span className="gmx-pos-search-icon">⌕</span>
                    <input
                    ref={scanInputRef}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return;
                      e.preventDefault();
                      if (String(productSearch || '').trim()) resolveScannedCode(productSearch, { source: 'BUSCADOR' });
                    }}
                    placeholder="Buscar artículo, SKU, carta o escanear código…"
                    autoComplete="off"
                    autoFocus />
                    {pendingScanQuantity > 1 ? <button type="button" className="gmx-pos-quantity-chip" onClick={() => {setPendingScanQuantity(1);setMessage('Cantidad rápida cancelada.');scanInputRef.current?.focus();}} title="Cancelar cantidad rápida">{pendingScanQuantity}×</button> : null}
                    <button type="button" className="gmx-pos-camera-inline" onClick={openCameraScanner} aria-label="Escanear con cámara" title="Cámara / QR">▣</button>
                  </div>
                    <VisionScannerModal
                    open={visionOpen}
                    title="Reconocer producto o carta"
                    onClose={() => setVisionOpen(false)}
                    onResult={handleVisionPosResult} />
                  
                    <VisionInternetResultsModal
                    open={visionInternetOpen}
                    loading={visionInternetBusy}
                    items={visionInternetCandidates}
                    queryText={visionInternetQuery}
                    error={visionInternetError}
                    onClose={() => setVisionInternetOpen(false)}
                    onPick={(item) => {
                      setVisionInternetOpen(false);
                      setMessage(
                        `Carta externa seleccionada: ${item.name}${item.setCode ? ` - ${item.setCode}` : ''}. Aun no se ha agregado al inventario.`
                      );
                    }} />
                </div>

                <section className="gmx-pos-items-panel">
                  <div className="gmx-pos-panel-title">
                    <strong>ARTÍCULOS ({cart.length})</strong>
                  </div>

                  <div className="gmx-pos-cart-table-wrap">
                    <table className="gmx-pos-cart-table">
                      <thead>
                        <tr><th>#</th><th>Artículo</th><th>Precio</th><th>Cant.</th><th>Subtotal</th><th></th></tr>
                      </thead>
                      <tbody>
                        {cart.map((item, index) => <tr key={item.key}>
                          <td>{index + 1}</td>
                          <td>
                            <div className="gmx-pos-cart-product">
                              <div className="gmx-pos-cart-thumb">{item.image_url ? <img src={item.image_url} alt="" /> : <span>{item.item_type === 'TCG' ? 'TCG' : brandText("GMX")}</span>}</div>
                              <div><strong>{item.name}</strong><small>{item.sku || item.item_id || ''}</small></div>
                            </div>
                          </td>
                          <td>{money(item.price)}</td>
                          <td>
                            {item.lockedOrderLine ? <strong className="gmx-pos-order-locked-qty">{item.quantity}</strong> : <div className="gmx-pos-qty">
                              <button type="button" onClick={() => changeQuantity(item.key, Math.max(1, Number(item.quantity || 1) - 1))}>−</button>
                              <input type="number" min="1" max={item.stock} value={item.quantity} onChange={(e) => changeQuantity(item.key, e.target.value)} />
                              <button type="button" onClick={() => changeQuantity(item.key, Math.min(Number(item.stock || 9999), Number(item.quantity || 1) + 1))}>+</button>
                            </div>}
                          </td>
                          <td><strong>{money(Number(item.price || 0) * Number(item.quantity || 0))}</strong></td>
                          <td>{item.lockedOrderLine ? <span title="Pedido existente">🔒</span> : <button type="button" className="gmx-pos-trash" onClick={() => removeFromCart(item.key)}>×</button>}</td>
                        </tr>)}
                        {Number(benefitPreview?.discountPromo || 0) > 0 ? <tr className="gmx-pos-adjustment-row promo"><td>🏷</td><td><strong>Promoción {promoCode || ''}</strong><small>Beneficio aplicado</small></td><td></td><td></td><td><strong>-{money(benefitPreview.discountPromo)}</strong></td><td><button type="button" className="gmx-pos-trash" onClick={() => {setPromoCode('');setBenefitPreview(null);}}>×</button></td></tr> : null}
                        {manualDiscountAmount > 0 ? <tr className="gmx-pos-adjustment-row manual"><td>🔒</td><td><strong>Descuento manual · {manualDiscountType === 'PORCENTAJE' ? `${manualDiscountValue}%` : money(manualDiscountValue)}</strong><small>{manualDiscountReason || 'Autorizado'}</small></td><td></td><td></td><td><strong>-{money(manualDiscountAmount)}</strong></td><td><button type="button" className="gmx-pos-trash" onClick={() => {setManualDiscountValue(0);setManualDiscountReason('');}}>×</button></td></tr> : null}
                      </tbody>
                    </table>
                    {!cart.length ? <div className="gmx-pos-empty">
                      <strong>Venta nueva</strong>
                      <span>Escanea un código, escribe en la barra o toca Catálogo / Existencias.</span>
                    </div> : null}
                  </div>

                  <div className="gmx-pos-items-footer">
                    <span>{cart.reduce((n, x) => n + Number(x.quantity || 0), 0)} artículo(s)</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <div className="gmx-pos-duebar">
                    <strong>{loadedPendingOrder ? `Pedido ${loadedPendingOrder.id_pedido} · ` : 'Por pagar: '}{money(saleTotal)}</strong>
                    <button type="button" className="secondary" disabled={!cart.length} onClick={() => {setCart([]);setBenefitPreview(null);setLoadedPendingOrder(null);}}>Vaciar</button>
                  </div>
                </section>
              </main>

              <aside className="gmx-pos-right">
                <section className="gmx-pos-side-card gmx-pos-summary-card gmx-pos-summary-v2">
                  <div className="gmx-pos-summary-head"><div className="gmx-pos-side-title">RESUMEN DE VENTA</div><span>{cart.reduce((n, x) => n + Number(x.quantity || 0), 0)} artículo(s)</span></div>
                  <div className="gmx-pos-summary-row"><span>Subtotal</span><strong>{money(total)}</strong></div>
                  {Number(benefitPreview?.discountPromo || 0) > 0 ? <div className="gmx-pos-summary-row discount"><span>Promociones</span><strong>-{money(Number(benefitPreview.discountPromo || 0))}</strong></div> : null}
                  {Number(benefitPreview?.loyaltyDiscount || 0) > 0 ? <div className="gmx-pos-summary-row discount"><span>Puntos</span><strong>-{money(Number(benefitPreview.loyaltyDiscount || 0))}</strong></div> : null}
                  {manualDiscountAmount > 0 ? <div className="gmx-pos-summary-row discount"><span>Descuento manual</span><strong>-{money(manualDiscountAmount)}</strong></div> : null}
                  <div className="gmx-pos-summary-total"><span>TOTAL</span><strong>{money(saleTotal)}</strong></div>
                  {Math.max(0, Number(total || 0) - Number(saleTotal || 0)) > 0 ? <div className="gmx-pos-savings"><span>🏷 Ahorro total</span><strong>-{money(Math.max(0, Number(total || 0) - Number(saleTotal || 0)))}</strong></div> : null}
                </section>

                <section className={`gmx-pos-promo-banner ${promoCode ? 'active' : ''} ${posPromoImage && !promoCode ? 'has-slide' : ''}`}>
                  {posPromoImage && !promoCode ? <img className="gmx-pos-promo-image" src={posPromoImage} alt={posPromoSlide?.titulo || 'Promoción'} /> : null}
                  {posPromoImage && !promoCode ? <div className="gmx-pos-promo-overlay" style={{ opacity: Number(posPromoSlide?.overlay_opacity ?? .32) }} /> : null}
                  <span className="gmx-pos-banner-kicker">{brandText("GMX · BENEFICIOS")}</span>
                  <strong>{promoCode ? `Promoción ${promoCode}` : posPromoSlide?.titulo || 'Promociones de temporada'}</strong>
                  <p>{promoCode ? 'Promoción aplicada a la venta actual.' : posPromoSlide?.subtitulo || 'Consulta las campañas vigentes con el botón Promoción.'}</p>
                  <div className="gmx-pos-banner-mark">{brandText("GMX")}</div>
                  {!promoCode && posPromoSlides.length > 1 ? <div className="gmx-pos-promo-dots">{posPromoSlides.map((slide, index) => <button type="button" key={slide.row_id || index} className={index === posPromoIndex ? 'active' : ''} aria-label={`Promoción ${index + 1}`} onClick={() => setPosPromoIndex(index)} />)}</div> : null}
                </section>
              </aside>
            </div>

            <div className="gmx-pos-actions">
              {draftOrderMode ? <button type="button" className="gmx-pos-action" onClick={() => {setCart([]);setDraftOrderMode(false);setTab('orders');}}><span>×</span>Cancelar pedido</button> : null}
              <button type="button" className="gmx-pos-action" onClick={() => {setCatalogBranchId(branchId);setProductSearch('');setCatalogOpen(true);}}><span>▦</span>Catálogo / Existencias</button>
              <button type="button" className="gmx-pos-action" onClick={() => {setOrderLookupSearch('');setOrderLookupResults([]);setOrderLookupOpen(true);searchOrdersForPOS('');}}><span>⌕</span>Buscar pedido</button>
              <button type="button" className="gmx-pos-action accent" onClick={() => {setClientSearch('');setClientSearchOpen(false);setClientModalOpen(true);}}><span>●</span>{clientId ? 'Cliente seleccionado' : 'Cliente'}</button>
              <button type="button" className="gmx-pos-action accent" disabled={!canUseManualDiscount} onClick={() => setDiscountModalOpen(true)}><span>%</span>Descuento</button>
              <button type="button" className="gmx-pos-action accent" onClick={() => setPromoModalOpen(true)}><span>★</span>Promoción</button>
              <button type="button" className="gmx-pos-action" onClick={() => setNotesModalOpen(true)}><span>✎</span>Observaciones</button>
              <button className="gmx-pos-charge" type="button" onClick={checkout} disabled={!cart.length || Boolean(manualDiscountError)}>
                <span>{draftOrderMode ? 'GUARDAR PEDIDO' : loadedPendingOrder ? 'COBRAR PEDIDO' : 'COBRAR'}</span><strong>{money(saleTotal)}</strong>
              </button>
            </div>

            {checkoutModalOpen ? <div className="modal-backdrop gmx-pos-checkout-backdrop" onMouseDown={() => setCheckoutModalOpen(false)}><div className="modal gmx-pos-checkout-modal" onMouseDown={(e) => e.stopPropagation()} onKeyDownCapture={blockInvalidMoneyKey} onPasteCapture={blockInvalidMoneyPaste}>
              <div className="modal-head"><div><div className="eyebrow">COBRO</div><h2>Cobrar {money(saleTotal)}</h2><p>Selecciona cómo pagará el cliente.</p></div><button className="icon-btn" type="button" onClick={() => setCheckoutModalOpen(false)}>×</button></div>
              <div className="gmx-pos-pay-methods">
                {[['EFECTIVO', '💵', 'Efectivo'], ['TRANSFERENCIA', '🏦', 'Transferencia'], ['TARJETA', '💳', 'Tarjeta']].map(([value, icon, label]) => <button key={value} type="button" className={paymentMethod === value ? 'selected' : ''} onClick={() => {setPaymentMethod(value);setPayments((current) => current.length ? [{ ...current[0], method: value }, ...current.slice(1)] : [{ method: value, amount: 0, cashReceived: 0, reference: '' }]);}}><span>{icon}</span><strong>{label}</strong></button>)}
              </div>
              <div className="gmx-pos-checkout-help">Para dividir el pago, usa <b>+ Agregar método</b>. Si no, captura solamente el método principal.</div>
              <MixedPaymentsPanel total={saleTotal} primaryMethod={paymentMethod} payments={payments} setPayments={setPaymentsSafe} />
              {paymentMethod !== 'EFECTIVO' ? <label className="gmx-pos-primary-reference">Referencia / folio<input value={paymentReference} onChange={(e) => setPaymentReference(sanitizePaymentReference(e.target.value))} placeholder={paymentMethod === 'TRANSFERENCIA' ? 'Referencia bancaria' : 'Referencia'} /></label> : null}
              {paymentMethod === 'TARJETA' ? <div className="gmx-pos-card-warning">Tarjeta está preparada para Mercado Pago. La venta no se marcará como autorizada hasta validar la integración del proveedor.</div> : null}
              <div className="gmx-pos-checkout-actions"><button type="button" className="secondary" onClick={() => setCheckoutModalOpen(false)}>Volver</button><button type="button" className="gmx-pos-confirm-charge" onClick={performCheckout}>CONFIRMAR COBRO · {money(saleTotal)}</button></div>
            </div></div> : null}

            {clientModalOpen ? <div className="modal-backdrop" onMouseDown={() => setClientModalOpen(false)}><div className="modal gmx-pos-client-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head"><div><div className="eyebrow">CLIENTE</div><h2>Seleccionar cliente</h2></div><button className="icon-btn" type="button" onClick={() => setClientModalOpen(false)}>×</button></div>
              <div className="gmx-pos-client-search"><input autoFocus value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar por nombre, teléfono, email o ID..." /></div>
              <div className="gmx-pos-client-list">
                <button type="button" className={`gmx-pos-client-row ${!clientId ? 'selected' : ''}`} onClick={() => {setClientId('');setClientSearch('');setLoyalty(null);setPointsToRedeem(0);setClientModalOpen(false);}}><strong>Público general</strong><span>Venta sin cliente asociado</span></button>
                {clientLoading ? <div className="gmx-pos-empty">Buscando clientes…</div> : null}
                {!clientLoading && clients.map((client) => <button type="button" className={`gmx-pos-client-row ${clientId === client.id_cliente ? 'selected' : ''}`} key={client.row_id} onClick={() => {setClientId(client.id_cliente);setClientSearch(client.nombre || client.email || client.telefono || client.id_cliente);setClientModalOpen(false);}}>
                  <strong>{client.nombre || client.id_cliente}</strong><span>{[client.telefono, client.email, client.id_cliente].filter(Boolean).join(' · ')}</span>
                </button>)}
                {!clientLoading && !clients.length ? <div className="gmx-pos-empty">No hay clientes que coincidan.</div> : null}
              </div>
            </div></div> : null}

            {discountModalOpen ? <div className="modal-backdrop" onMouseDown={() => setDiscountModalOpen(false)}><div className="modal gmx-pos-action-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head"><div><div className="eyebrow">DESCUENTO MANUAL</div><h2>Aplicar descuento</h2></div><button className="icon-btn" type="button" onClick={() => setDiscountModalOpen(false)}>×</button></div>
              <div className="gmx-pos-modal-grid"><label>Tipo<select value={manualDiscountType} onChange={(e) => setManualDiscountType(e.target.value)}><option value="PORCENTAJE">Porcentaje (%)</option><option value="MONTO">Monto ($)</option></select></label><label>{manualDiscountType === 'PORCENTAJE' ? 'Porcentaje' : 'Monto'}<input type="number" onKeyDown={blockInvalidMoneyKey} onPaste={blockInvalidMoneyPaste} min="0" max={manualDiscountType === 'PORCENTAJE' ? '100' : undefined} step="0.01" value={manualDiscountValue} onChange={(e) => setManualDiscountValue(Math.max(0, Number(e.target.value || 0)))} /></label></div>
              <label>Motivo / autorización<input value={manualDiscountReason} onChange={(e) => setManualDiscountReason(e.target.value)} placeholder="Motivo obligatorio" /></label>
              {Number(manualDiscountValue || 0) > 0 ? <div className="benefit-summary"><span>Base <b>{money(totalBeforeManualDiscount)}</b></span><span>Descuento <b>-{money(manualDiscountAmount)}</b></span><strong>Total final {money(saleTotal)}</strong>{manualDiscountError ? <span className="danger-text">{manualDiscountError}</span> : null}</div> : null}
              <div className="gmx-pos-modal-actions"><button type="button" className="secondary" onClick={() => {setManualDiscountValue(0);setManualDiscountReason('');setDiscountModalOpen(false);}}>Quitar descuento</button><button type="button" disabled={Boolean(manualDiscountError) || Number(manualDiscountValue || 0) <= 0} onClick={() => setDiscountModalOpen(false)}>Aplicar</button></div>
            </div></div> : null}

            {promoModalOpen ? <div className="modal-backdrop" onMouseDown={() => setPromoModalOpen(false)}><div className="modal gmx-pos-action-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head"><div><div className="eyebrow">PROMOCIÓN</div><h2>Aplicar código promocional</h2></div><button className="icon-btn" type="button" onClick={() => setPromoModalOpen(false)}>×</button></div>
              <label>Código promocional<input autoFocus value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} placeholder="Escanea o captura el código" onKeyDown={async (e) => {if (e.key === 'Enter') {e.preventDefault();try {await previewBenefits({ promo: promoCode, points: pointsToRedeem });setPromoModalOpen(false);} catch {}}}} /></label>
              <p className="muted">También puedes escanear el código directamente en el buscador universal del POS.</p>
              <div className="gmx-pos-modal-actions"><button type="button" className="secondary" onClick={() => {setPromoCode('');setBenefitPreview(null);setPromoModalOpen(false);}}>Quitar promoción</button><button type="button" onClick={async () => {try {await previewBenefits({ promo: promoCode, points: pointsToRedeem });setPromoModalOpen(false);} catch {}}}>Aplicar promoción</button></div>
            </div></div> : null}

            {notesModalOpen ? <div className="modal-backdrop" onMouseDown={() => setNotesModalOpen(false)}><div className="modal gmx-pos-action-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head"><div><div className="eyebrow">OBSERVACIONES</div><h2>Notas de la venta</h2></div><button className="icon-btn" type="button" onClick={() => setNotesModalOpen(false)}>×</button></div>
              <label>Observación<textarea rows="5" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agrega una observación opcional…" /></label>
              <div className="gmx-pos-modal-actions"><button type="button" className="secondary" onClick={() => {setNotes('');setNotesModalOpen(false);}}>Limpiar</button><button type="button" onClick={() => setNotesModalOpen(false)}>Guardar observación</button></div>
            </div></div> : null}

            {pointsModalOpen ? <div className="modal-backdrop" onMouseDown={() => setPointsModalOpen(false)}><div className="modal gmx-pos-action-modal" onMouseDown={(e) => e.stopPropagation()}>
              <div className="modal-head"><div><div className="eyebrow">PUNTOS DEL CLIENTE</div><h2>¿Deseas canjear puntos?</h2></div><button className="icon-btn" type="button" onClick={() => setPointsModalOpen(false)}>×</button></div>
              <p>Este cliente tiene <strong>{Number(loyalty?.puntos_disponibles || 0)} puntos</strong> disponibles.</p>
              <label>Puntos a canjear<input type="number" onKeyDown={blockInvalidMoneyKey} onPaste={blockInvalidMoneyPaste} min="0" max={Number(loyalty?.puntos_disponibles || 0)} value={pointsToRedeem} onChange={(e) => setPointsToRedeem(Math.min(Number(loyalty?.puntos_disponibles || 0), Math.max(0, Number(e.target.value || 0))))} /></label>
              <div className="gmx-pos-modal-actions"><button type="button" className="secondary" onClick={() => {setPointsToRedeem(0);setPointsModalOpen(false);setCheckoutModalOpen(true);}}>No usar puntos</button><button type="button" onClick={async () => {try {await previewBenefits({ promo: promoCode, points: pointsToRedeem, silent: true });setPointsModalOpen(false);setCheckoutModalOpen(true);} catch {}}}>Canjear y continuar</button></div>
            </div></div> : null}

            {orderLookupOpen ? <div className="modal-backdrop gmx-pos-order-backdrop" onMouseDown={() => setOrderLookupOpen(false)}>
              <div className="modal gmx-pos-order-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div>
                    <div className="eyebrow">{'PEDIDOS \u00b7 POS'}</div>
                    <h2>Buscar pedido</h2>
                    <p>{'Busca por n\u00famero de pedido, cliente, tel\u00e9fono o email.'}</p>
                  </div>
                  <button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setOrderLookupOpen(false)}>X</button>
                </div>

                <form
                className="gmx-pos-order-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  searchOrdersForPOS(orderLookupSearch);
                }}>
                
                  <input
                  autoFocus
                  value={orderLookupSearch}
                  onChange={(e) => setOrderLookupSearch(e.target.value)}
                  placeholder={'PED-WEB-..., PED-LOCAL-..., cliente, tel\u00e9fono o email'} />
                
                  <button type="submit" disabled={orderLookupBusy}>
                    {orderLookupBusy ? 'Buscando?' : 'Buscar'}
                  </button>
                </form>

                <div className="gmx-pos-order-results">
                  {!orderLookupBusy && orderLookupResults.length > 0 ?
                <div className="gmx-pos-order-list-title">
                      {orderLookupSearch.trim() ? 'RESULTADOS' : 'PEDIDOS RECIENTES'}
                    </div> :
                null}

                  {orderLookupBusy ? <div className="gmx-pos-empty">Buscando pedidos...</div> : null}

                  {!orderLookupBusy && orderLookupResults.map((order) =>
                <article className="gmx-pos-order-result" key={order.row_id}>
                      <div className="gmx-pos-order-result-main">
                        <div>
                          <strong>{order.id_pedido}</strong>
                          <span>{order.id_cliente ? order.nombre_cliente || 'Cliente registrado' : 'Público general'}{order.telefono ? ` · ${order.telefono}` : ''}</span>
                        </div>
                        <strong>{money(order.total)}</strong>
                      </div>

                      <div className="gmx-pos-order-result-meta">
                        <span>{order.sucursal || order.id_sucursal || 'Sin sucursal'}</span>
                        <span>{order.metodo_pago || 'Sin m?todo'}</span>
                        <span>{order.estado_devolucion || order.estado_pedido || 'Sin estado'}</span>
                      </div>

                      <div className="gmx-pos-order-result-actions">
                        <button
                      type="button"
                      className="secondary compact"
                      onClick={() => {
                        setOrderLookupOpen(false);
                        openOrder(order.row_id);
                      }}>
                      
                          Ver
                        </button>

                        {String(order.estado_pedido || '').toUpperCase() === 'PENDIENTE' ?
                    <button
                      type="button"
                      className="compact"
                      onClick={() => {
                        setOrderLookupOpen(false);
                        loadPendingOrderToPOS(order);
                      }}>
                      
                              Cargar al POS
                            </button> :
                    null}

                        {String(order.estado_pedido || '').toUpperCase() === 'PAGADO' ?
                    <button
                      type="button"
                      className="compact"
                      onClick={() => openReturnFlow(order)}>
                      
                              Devolver / Reembolso
                            </button> :
                    null}
                      </div>
                    </article>
                )}

                  {!orderLookupBusy && orderLookupSearch.trim() && orderLookupResults.length === 0 ?
                <div className="gmx-pos-empty">No se encontraron pedidos.</div> :
                null}
                </div>
              </div>
            </div> : null}

            {cameraOpen ? <div className="modal-backdrop gmx-pos-camera-backdrop" onMouseDown={() => {stopCamera();setCameraOpen(false);}}>
              <div className="modal gmx-pos-camera-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div><div className="eyebrow">ESCÁNER POR CÁMARA</div><h2>Código de barras / QR</h2></div>
                  <button className="icon-btn" type="button" onClick={() => {stopCamera();setCameraOpen(false);}}>×</button>
                </div>
                <div className="gmx-pos-camera-stage">
                  <video ref={cameraVideoRef} playsInline muted />
                  <div className="gmx-pos-camera-guide"></div>
                </div>
                {cameraError ? <div className="gmx-pos-camera-error">{cameraError}</div> : <p className="gmx-pos-camera-help">Coloca el código dentro del recuadro y pulsa Leer código.</p>}
                <div className="gmx-pos-camera-actions">
                  <button type="button" className="secondary" onClick={() => {stopCamera();setCameraOpen(false);}}>Cancelar</button>
                  <button type="button" onClick={detectFromCamera} disabled={scanBusy || Boolean(cameraError)}>{scanBusy ? 'Leyendo…' : 'Leer código'}</button>
                </div>
              </div>
            </div> : null}

            {catalogOpen ? <div className="modal-backdrop gmx-pos-catalog-backdrop" onMouseDown={() => setCatalogOpen(false)}>
              <div className="modal gmx-pos-catalog-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-head">
                  <div><div className="eyebrow">CATÁLOGO POS</div><h2>Agregar artículos</h2></div>
                  <button className="icon-btn" type="button" onClick={() => setCatalogOpen(false)}>×</button>
                </div>
                {catalogAddFeedback ? <div className={`gmx-pos-add-toast ${catalogAddFeedback.blocked ? 'blocked' : ''}`} role="status" aria-live="polite">
                  <strong>{catalogAddFeedback.blocked ? 'Sin existencia disponible' : '✓ Agregado al carrito'}</strong>
                  <span>{catalogAddFeedback.name}{catalogAddFeedback.quantity > 0 ? ` · Cantidad ${catalogAddFeedback.quantity}` : ''}</span>
                </div> : null}
                <div className="gmx-pos-modal-search"><input autoFocus value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar por nombre, SKU, código de barras, carta..." /></div>
                <div className="gmx-pos-modal-filters">
                  {isOperator ?
                <div className="gmx-pos-branch-filter gmx-pos-branch-fixed"><span>Sucursal</span><strong>{branches.find((b) => b.id_sucursal === branchId)?.nombre_sucursal || 'Sin sucursal asignada'}</strong></div> :
                <label className="gmx-pos-branch-filter">Sucursal
                      <select value={catalogBranchId || branchId} onChange={(e) => setCatalogBranchId(e.target.value)}>
                        {branches.map((branch) => <option key={branch.row_id} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
                      </select>
                    </label>}
                  <div className="pos-sale-type"><div><button type="button" className={saleType === 'ALL' ? 'active' : ''} onClick={() => setSaleType('ALL')}>Todos</button><button type="button" className={saleType === 'TCG' ? 'active' : ''} onClick={() => {setSaleType('TCG');setProductCategory('');}}>Cartas TCG</button><button type="button" className={saleType === 'PRODUCT' ? 'active' : ''} onClick={() => {setSaleType('PRODUCT');setGameId('');setSetId('');}}>Productos</button></div></div>
                  {saleType === 'TCG' || saleType === 'ALL' ? <><label>TCG<select value={gameId} onChange={(e) => setGameId(e.target.value)}><option value="">Todos los TCG</option>{tcgGames.map((g) => <option key={g.id_juego} value={g.id_juego}>{g.nombre}</option>)}</select></label><label>Expansión<select value={setId} disabled={!gameId} onChange={(e) => setSetId(e.target.value)}><option value="">Todas</option>{tcgSets.map((x) => <option key={x.id_set} value={x.id_set}>{x.nombre}</option>)}</select></label></> : null}
                  {saleType === 'PRODUCT' || saleType === 'ALL' ? <label>Categoría<select value={productCategory} onChange={(e) => setProductCategory(e.target.value)}><option value="">Todas</option>{productCategories.map((c) => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.total})</option>)}</select></label> : null}
                </div>
                <div className="gmx-pos-modal-count">{catalogLoading ? 'Buscando…' : `${visibleInventory.length} resultado(s)`}</div>
                {!isOperator && catalogBranchId && branchId && catalogBranchId !== branchId ? <div className="gmx-pos-branch-note">Consulta de existencias en otra sucursal. Para vender, selecciona la sucursal activa del POS.</div> : null}
                <div className="gmx-pos-modal-grid">
                  {visibleInventory.map((item) => {
                  const key = itemKey(item);
                  const cartRow = cart.find((row) => row.key === key);
                  const qty = Number(cartRow?.quantity || 0);
                  const stock = Math.max(0, Number(item.stock || 0));
                  const exhausted = stock <= qty;
                  const viewingOtherBranch = !isOperator && Boolean(catalogBranchId && branchId && catalogBranchId !== branchId);
                  const fresh = catalogAddFeedback?.key === key && !catalogAddFeedback?.blocked;
                  return <article className={`gmx-pos-modal-item ${fresh ? 'just-added' : ''} ${qty > 0 ? 'in-cart' : ''}`} key={key}>
                      <div className="gmx-pos-modal-thumb">{item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>{item.item_type === 'TCG' ? 'TCG' : brandText("GMX")}</span>}</div>
                      <div className="gmx-pos-modal-main"><small>{item.item_type === 'TCG' ? 'CARTA TCG' : 'PRODUCTO'}</small><strong>{item.name}</strong><span>{[item.sku, item.game_name, item.set_name, item.card_number].filter(Boolean).join(' · ')}</span><em>Existencia {item.stock ?? 0}{qty > 0 ? ` · En carrito ${qty}` : ''}</em></div>
                      <strong className="gmx-pos-modal-price">{money(item.price)}</strong>
                      <button
                      type="button"
                      className={fresh ? 'added' : ''}
                      disabled={exhausted || viewingOtherBranch}
                      onClick={() => addToCart(item)}>
                      {viewingOtherBranch ? 'Consulta otra sucursal' : exhausted ? `✓ En carrito: ${qty} · Agotado` : qty > 0 ? `✓ Cantidad: ${qty}` : '+ Agregar'}</button>
                    </article>;
                })}
                  {!catalogLoading && !visibleInventory.length ? <div className="gmx-pos-empty">No hay artículos disponibles con estos filtros.</div> : null}
                </div>
              </div>
            </div> : null}
          </div> :
        null}
        {tab === 'orders' ?
        <div>
            <form className="order-toolbar" onSubmit={(e) => {
            e.preventDefault();
            loadOrders(orderSearch).catch((error) => setMessage(error.message));
          }}>
              <input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="Pedido, cliente, teléfono, email..." />
              <button className="secondary">Buscar</button>
              <button type="button" onClick={() => {setCart([]);setNotes('');setDraftOrderMode(true);setTab('pos');}}>Nuevo pedido</button>
            </form>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Pedido</th><th>Cliente / contacto</th><th>Sucursal</th><th>Pago</th><th>Unidades</th><th>Total</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map((order) =>
                <tr key={order.row_id}>
                      <td>{order.fecha ? new Date(order.fecha).toLocaleString('es-MX') : '—'}</td>
                      <td>{order.id_pedido}</td>
                      <td><div className="pos-history-customer"><strong>{order.id_cliente ? order.nombre_cliente || 'Cliente registrado' : 'Público general'}</strong><small>{order.id_cliente ? `Registrado · ${order.email || order.telefono || order.id_cliente}` : `Ocasional${order.telefono ? ` · WhatsApp ${order.telefono}` : ' · sin contacto'}`}</small></div></td>
                      <td>{order.sucursal || order.id_sucursal || '—'}</td>
                      <td>{order.metodo_pago || '—'}</td>
                      <td>{order.unidades ?? 0}</td>
                      <td>{money(order.total)}</td>
                      <td>
                        <span className={`module-state ${String(order.estado_devolucion || order.estado_pedido || '').toUpperCase().includes('DEVUELTO') || String(order.estado_pedido || '').toUpperCase() === 'CANCELADO' ? 'warning' : 'ready'}`}>
                          {order.estado_devolucion || order.estado_pedido || '—'}
                        </span>
                      </td>
                      <td>
                        <div className="pos-history-actions">
                          <button className="secondary compact" onClick={() => openOrder(order.row_id)}>Ver</button>
                          {String(order.estado_pedido || '').toUpperCase() === 'PENDIENTE' ?
                      <button className="compact pos-pay-order-btn" onClick={() => openPayOrder(order)}>Registrar pago</button> :
                      null}
                          {String(order.estado_pedido || '').toUpperCase() === 'PAGADO' ? <>
                            <button className="secondary compact" onClick={() => openReturnFlow(order)}>Devolver / Reembolso</button>
                            <button className="secondary compact" onClick={() => printOrderFromHistory(order.row_id)}>Ticket</button>
                            <button className="secondary compact" onClick={() => printOrderFromHistory(order.row_id, { pdf: true })}>PDF</button>
                            <button className="secondary compact" disabled={receiptBusy || !order.email} title={!order.email ? 'Cliente sin correo' : 'Enviar comprobante'} onClick={() => emailReceipt(order)}>Correo</button>
      <VisionCandidatePicker
                          open={visionPickerOpen}
                          title="Selecciona el artÃ­culo para vender"
                          items={visionCandidates}
                          onClose={() => setVisionPickerOpen(false)}
                          onPick={(item) => {
                            addToCart(item);
                            setVisionPickerOpen(false);
                            setMessage('');
                          }} />
                        
</> : null}
                        </div>
                      </td>
                    </tr>
                )}
                </tbody>
              </table>
            </div>
          </div> :
        null}
      </section>

      {returnFlow.open ? <div className="modal-backdrop gmx-pos-return-backdrop" onMouseDown={closeReturnFlow}>
        <div className="modal gmx-pos-return-modal gmx-pos-return-dialog" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div><div className="eyebrow">DEVOLUCIÓN · POS</div><h2>{returnFlow.stage === 'auth' ? 'Autorización administrativa' : 'Procesar devolución'}</h2><p className="section-copy">{returnFlow.order?.id_pedido || 'Pedido'}</p></div>
            <button className="icon-btn" type="button" disabled={returnFlow.busy} onClick={closeReturnFlow}>×</button>
          </div>
          {returnFlow.error ? <div className="gmx-pos-return-error" role="alert">{returnFlow.error}</div> : null}

          {returnFlow.stage === 'auth' ? <div className="gmx-pos-return-auth">
            <div className="gmx-pos-return-security"><strong>Esta operación requiere autorización.</strong><span>La credencial administrativa autoriza únicamente esta devolución y queda vinculada al pedido.</span></div>
            <div className="gmx-pos-return-order-summary">
              <div><span>Pedido</span><strong>{returnFlow.order?.id_pedido}</strong></div>
              <div><span>Cliente</span><strong>{returnFlow.order?.nombre_cliente || 'Público general'}</strong></div>
              <div><span>Sucursal</span><strong>{returnFlow.order?.sucursal || returnFlow.order?.id_sucursal || '—'}</strong></div>
              <div><span>Total</span><strong>{money(returnFlow.order?.total)}</strong></div>
            </div>
            <div className="gmx-pos-return-fields gmx-pos-return-auth-fields">
              <label className="gmx-pos-return-password-label">Contraseña administrativa<input className="gmx-pos-return-password-input" type="password" autoFocus autoComplete="new-password" value={returnFlow.password} onChange={(e) => setReturnFlow((c) => ({ ...c, password: e.target.value, error: '' }))} onKeyDown={(e) => {if (e.key === 'Enter' && !returnFlow.busy) authorizeReturnInPOS();}} placeholder="Captura la contraseña administrativa" disabled={returnFlow.busy} /></label>
            </div>
            <div className="gmx-pos-return-actions"><button type="button" className="secondary" disabled={returnFlow.busy} onClick={closeReturnFlow}>Cancelar</button><button type="button" disabled={returnFlow.busy} onClick={authorizeReturnInPOS}>{returnFlow.busy ? 'Validando autorización…' : 'Autorizar devolución'}</button></div>
          </div> : <div className="gmx-pos-return-editor">
            <div className="gmx-pos-return-authorized"><span>✓ Autorización aprobada</span><strong>{returnFlow.authorizer?.nombre || returnFlow.authorizer?.email || 'Administrador autorizado'}</strong>{returnFlow.authorizationId ? <small>{returnFlow.authorizationId}</small> : null}</div>
            <div className="gmx-pos-return-items">
              <div className="gmx-pos-return-items-head"><span>Artículo</span><span>Disponible</span><span>Devolver</span><span>Importe</span></div>
              {returnFlow.items.map((item) => {
                const qty = Number(item._quantity || 0),price = Number(item.precio_unitario || item.precio || 0);
                return <div className="gmx-pos-return-item" key={item._key}>
                  <div><strong>{item.producto || item.name || 'Artículo'}</strong><small>{item.sku || item.id_producto || ''}</small></div>
                  <span>{item._available}</span>
                  <input type="number" min="0" max={item._available} step="1" value={qty} onChange={(e) => setReturnItemQuantity(item._key, e.target.value)} onKeyDown={(e) => ['e', 'E', '+', '-'].includes(e.key) && e.preventDefault()} />
                  <strong>{money(price * qty)}</strong>
                </div>;
              })}
            </div>
            <div className="gmx-pos-return-form">
              <label className="gmx-pos-return-field-label">Motivo<select className="gmx-pos-return-select" value={returnFlow.reason} onChange={(e) => setReturnFlow((c) => ({ ...c, reason: e.target.value, error: '' }))} disabled={returnFlow.busy}>
                <option value="">Seleccionar motivo</option><option value="PRODUCTO_DEFECTUOSO">Producto defectuoso</option><option value="PRODUCTO_INCORRECTO">Producto incorrecto</option><option value="CAMBIO_DE_OPINION">Cambio de opinión</option><option value="ERROR_EN_VENTA">Error en venta</option><option value="OTRO">Otro</option>
              </select></label>
              <label className="gmx-pos-return-check"><input type="checkbox" checked={returnFlow.reintegrateStock} onChange={() => {}} hidden /><span role="checkbox" aria-checked={returnFlow.reintegrateStock} tabIndex="0" className={returnFlow.reintegrateStock ? 'checked' : ''} onClick={() => setReturnFlow((c) => ({ ...c, reintegrateStock: !c.reintegrateStock }))}>✓</span><div><strong>Reintegrar al inventario</strong><small>Los artículos vendibles regresarán a existencia.</small></div></label>
              <label className="gmx-pos-return-refund-toggle"><span>Reembolso al cliente</span><input type="checkbox" checked={returnFlow.refund} onChange={(e) => setReturnFlow((c) => ({ ...c, refund: e.target.checked, error: '' }))} disabled={returnFlow.busy} /></label>
              {returnFlow.refund ? <div className="gmx-pos-return-refund-grid">
                <label className="gmx-pos-return-field-label">Método de reembolso<select className="gmx-pos-return-select" value={returnFlow.refundMethod} onChange={(e) => setReturnFlow((c) => ({ ...c, refundMethod: e.target.value, error: '' }))}><option value="EFECTIVO">Efectivo</option><option value="TARJETA">Tarjeta</option><option value="TRANSFERENCIA">Transferencia</option><option value="OTRO">Otro</option></select></label>
                <label className="gmx-pos-return-field-label">Referencia<input className="gmx-pos-return-text-input" value={returnFlow.refundReference} onChange={(e) => setReturnFlow((c) => ({ ...c, refundReference: e.target.value }))} placeholder="Referencia opcional" /></label>
              </div> : null}
              <label className="gmx-pos-return-field-label">Notas<textarea className="gmx-pos-return-textarea" rows="2" value={returnFlow.notes} onChange={(e) => setReturnFlow((c) => ({ ...c, notes: e.target.value }))} placeholder="Observaciones de la devolución (opcional)" disabled={returnFlow.busy} /></label>
            </div>
            <div className="gmx-pos-return-summary"><span>Total a devolver</span><strong>{money(returnFlow.items.reduce((sum, item) => sum + Number(item.precio_unitario || item.precio || 0) * Number(item._quantity || 0), 0))}</strong></div>
            <div className="gmx-pos-return-actions"><button type="button" className="secondary" disabled={returnFlow.busy} onClick={closeReturnFlow}>Cancelar</button><button type="button" disabled={returnFlow.busy} onClick={submitReturnInPOS}>{returnFlow.busy ? 'Procesando devolución…' : 'Confirmar devolución'}</button></div>
          </div>}
        </div>
      </div> : null}

      {payOrder ? <div className="modal-backdrop" onMouseDown={() => !payBusy && setPayOrder(null)}>
        <div className="modal pos-payment-modal" onMouseDown={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <div className="eyebrow">PEDIDO PENDIENTE · COBRO</div>
              <h2>Registrar pago</h2>
              <p className="section-copy">{payOrder.id_pedido}</p>
            </div>
            <button className="icon-btn" disabled={payBusy} onClick={() => setPayOrder(null)}>×</button>
          </div>

          <div className="pos-payment-order-summary">
            <div><span>Cliente</span><strong>{payOrder.nombre_cliente || 'Público general'}</strong></div>
            <div><span>Sucursal</span><strong>{payOrder.sucursal || payOrder.id_sucursal || '—'}</strong></div>
            <div><span>Total a cobrar</span><strong>{money(payOrder.total)}</strong></div>
          </div>

          <div className="pos-payment-fields">
            <label>Método de pago
              <select value={payMethod} onChange={(e) => {setPayMethod(e.target.value);setPayReference('');}}>
                <option value="EFECTIVO">Efectivo</option>
                <option value="TARJETA">Tarjeta</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="OTRO">Otro</option>
              </select>
            </label>

            {payMethod !== 'EFECTIVO' ? <label>Referencia / autorización
              <input value={payReference} onChange={(e) => setPayReference(e.target.value)} placeholder={payMethod === 'TARJETA' ? 'Folio o autorización' : payMethod === 'TRANSFERENCIA' ? 'Referencia bancaria' : 'Referencia opcional'} />
            </label> : null}

            <label className="span-2">Notas
              <textarea rows="2" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="Observaciones del cobro (opcional)" />
            </label>
          </div>

          <div className="pos-payment-warning">{brandText("\n            Al confirmar, GMX volverá a validar el stock, descontará el inventario y cambiará el pedido a PAGADO.\n          ")}

          </div>

          <div className="modal-actions">
            <button className="secondary" disabled={payBusy} onClick={() => setPayOrder(null)}>Cancelar</button>
            <button disabled={payBusy} onClick={confirmPendingOrderPayment}>
              {payBusy ? 'Registrando pago...' : `Cobrar ${money(payOrder.total)}`}
            </button>
          </div>
        </div>
      </div> : null}

      <OrderDetailModal
        open={Boolean(selectedOrder)}
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onCancel={cancelOrder} />
      
    </div>);

}
