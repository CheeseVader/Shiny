import { brandText } from "./config/brand.js";const CARD_API = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
const SET_API = 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php';

function clean(v = '') {
  return String(v || '').
  normalize('NFD').replace(/[\u0300-\u036f]/g, '').
  toLowerCase().
  replace(/[^a-z0-9]+/g, ' ').
  replace(/\s+/g, ' ').
  trim();
}
function compact(v = '') {return clean(v).replace(/\s/g, '');}
function meaningfulTokens(v = '') {
  return clean(v).split(' ').filter((x) => x.length >= 3);
}
function unique(v = []) {return [...new Set(v.map((x) => String(x || '').trim()).filter(Boolean))];}

function levenshtein(a, b) {
  a = clean(a);b = clean(b);
  if (!a) return b.length;
  if (!b) return a.length;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let left = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      const diag = prev[j - 1];
      const cur = Math.min(up + 1, left + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev[j - 1] = left;
      left = cur;
    }
    prev[b.length] = left;
  }
  return prev[b.length];
}

function queryQuality(q) {
  const s = String(q || '').trim();
  if (/^\d{8}$/.test(s)) return 1;
  if (/^[A-Za-z0-9]{2,8}-[A-Za-z0-9]{2,5}$/.test(s)) return 1;
  const c = clean(s);
  if (c.length < 4) return 0;
  const good = meaningfulTokens(c);
  if (!good.length) return 0;
  if (good.length === 1 && good[0].length < 5) return .2;
  return Math.min(1, .55 + good.join('').length / 20);
}

function scoreName(query, name) {
  const q = clean(query),n = clean(name);
  if (!q || !n) return 0;
  if (q === n || compact(q) === compact(n)) return .99;

  const qt = meaningfulTokens(q),nt = new Set(meaningfulTokens(n));
  if (!qt.length) return 0;
  let hit = 0;
  for (const x of qt) if (nt.has(x)) hit++;
  const coverage = hit / qt.length;

  const max = Math.max(q.length, n.length);
  const similarity = max ? 1 - levenshtein(q, n) / max : 0;

  // Never turn one random common OCR token into a 94% match.
  if (hit === 0) return Math.max(0, similarity * .55);
  if (qt.length === 1 && hit === 1) {
    if (qt[0] === clean(n)) return .98;
    return Math.min(.78, .50 + similarity * .28);
  }
  return Math.min(.96, coverage * .65 + similarity * .35);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': "TCG-Store-VISION/2.0", 'Accept': 'application/json' }
    });
    if (!r.ok) {
      if (r.status === 400) return null;
      throw new Error(`YGOPRODECK_HTTP_${r.status}`);
    }
    return await r.json();
  } finally {clearTimeout(timer);}
}

function normalizeCard(card, { score = 0, matchedBy = '', matchedValue = '', setOverride = null } = {}) {
  const image = card?.card_images?.[0] || {};
  const prices = card?.card_prices?.[0] || {};
  const sets = card?.card_sets || [];
  let set = setOverride || sets[0] || {};
  return {
    source: 'YGOPRODECK',
    externalId: String(card?.id || ''),
    passcode: String(card?.id || ''),
    name: card?.name || '',
    type: card?.type || '',
    description: card?.desc || '',
    race: card?.race || '',
    archetype: card?.archetype || '',
    attribute: card?.attribute || '',
    level: card?.level ?? null,
    atk: card?.atk ?? null,
    def: card?.def ?? null,
    imageUrl: image.image_url || image.image_url_small || '',
    imageSmall: image.image_url_small || image.image_url || '',
    sets,
    setName: set?.set_name || '',
    setCode: set?.set_code || '',
    rarity: set?.set_rarity || '',
    rarityCode: set?.set_rarity_code || '',
    prices: {
      cardmarket: Number(prices.cardmarket_price || 0),
      tcgplayer: Number(prices.tcgplayer_price || 0),
      ebay: Number(prices.ebay_price || 0),
      amazon: Number(prices.amazon_price || 0),
      coolstuffinc: Number(prices.coolstuffinc_price || 0)
    },
    matchedBy,
    matchedValue,
    score: Number(score || 0)
  };
}

async function cardById(id) {
  const body = await fetchJson(`${CARD_API}?id=${encodeURIComponent(id)}`);
  return body?.data?.[0] || null;
}

async function exactName(name) {
  const body = await fetchJson(`${CARD_API}?name=${encodeURIComponent(name)}`);
  return body?.data?.[0] || null;
}

async function fuzzyName(name) {
  const body = await fetchJson(`${CARD_API}?fname=${encodeURIComponent(name)}`);
  return body?.data || [];
}

async function setCodeLookup(code) {
  const body = await fetchJson(`${SET_API}?setcode=${encodeURIComponent(code)}`);
  if (!body) return null;
  // cardsetsinfo returns a single object for an exact printing.
  return body?.id ? body : null;
}

export async function discoverYgoCards({ text = '', queries = [], hints = {}, limit = 8 } = {}) {
  const found = new Map();
  const diagnostics = [];

  const passcodes = unique([
  hints?.passcode,
  ...(hints?.passcodes || []),
  ...(String(text || '').match(/\b\d{8}\b/g) || [])]
  ).filter((x) => /^\d{8}$/.test(x));

  const setCodes = unique([
  hints?.setCode,
  ...(hints?.setCodes || []),
  ...(String(text || '').toUpperCase().match(/\b[A-Z0-9]{2,8}-[A-Z0-9]{2,5}\b/g) || [])]
  );

  const names = unique([
  hints?.name,
  ...queries,
  ...String(text || '').split(/\r?\n/)]
  ).filter((x) => queryQuality(x) >= .45).
  filter((x) => !/^\d{8}$/.test(x)).
  filter((x) => !/\b[A-Z0-9]{2,8}-[A-Z0-9]{2,5}\b/i.test(x)).
  slice(0, 8);

  // 1. Exact passcode is the strongest possible identifier.
  for (const id of passcodes.slice(0, 3)) {
    try {
      const card = await cardById(id);
      diagnostics.push({ kind: 'PASSCODE', value: id, found: Boolean(card) });
      if (card) {
        const x = normalizeCard(card, { score: 1, matchedBy: 'PASSCODE', matchedValue: id });
        found.set(x.externalId, x);
      }
    } catch (e) {diagnostics.push({ kind: 'PASSCODE', value: id, error: String(e?.message || e) });}
  }

  // 2. Exact printed set code. SDK-030 identifies the printing and gives card ID/name.
  for (const code of setCodes.slice(0, 4)) {
    try {
      const printing = await setCodeLookup(code);
      diagnostics.push({ kind: 'SET_CODE', value: code, found: Boolean(printing) });
      if (printing?.id) {
        const card = await cardById(printing.id);
        if (card) {
          const x = normalizeCard(card, {
            score: .995,
            matchedBy: 'SET_CODE',
            matchedValue: code,
            setOverride: printing
          });
          found.set(x.externalId, x);
        }
      }
    } catch (e) {diagnostics.push({ kind: 'SET_CODE', value: code, error: String(e?.message || e) });}
  }

  // 3. High-quality title OCR: exact name first, fuzzy only after quality gate.
  for (const q of names) {
    try {
      let exact = null;
      try {exact = await exactName(q);} catch {}
      if (exact) {
        const x = normalizeCard(exact, { score: .99, matchedBy: 'NAME_EXACT', matchedValue: q });
        const old = found.get(x.externalId);
        if (!old || x.score > old.score) found.set(x.externalId, x);
        diagnostics.push({ kind: 'NAME_EXACT', value: q, found: true });
        continue;
      }

      const cards = await fuzzyName(q);
      diagnostics.push({ kind: 'NAME_FUZZY', value: q, count: cards.length });
      for (const card of cards.slice(0, 40)) {
        const score = scoreName(q, card?.name || '');
        if (score < .58) continue;
        const x = normalizeCard(card, { score, matchedBy: 'NAME_FUZZY', matchedValue: q });
        const old = found.get(x.externalId);
        if (!old || x.score > old.score) found.set(x.externalId, x);
      }
    } catch (e) {diagnostics.push({ kind: 'NAME', value: q, error: String(e?.message || e) });}
  }

  return {
    provider: 'YGOPRODECK',
    game: 'Yu-Gi-Oh!',
    hints: { passcodes, setCodes, names },
    results: [...found.values()].
    filter((x) => x.score >= .58).
    sort((a, b) => b.score - a.score).
    slice(0, Math.min(Math.max(Number(limit) || 8, 1), 15)),
    diagnostics
  };
}
