import { brandText } from "../config/brand.js";import { Router } from 'express';
import { requireModule } from '../middleware/auth.js';
import {
  ensureOperationalIdentities,
  resolveVisualIdentities,
  visualTcgLimits
} from '../externalCardVisualAdapter.js';

const router = Router();
const VISUAL_SERVICE_URL = String(process.env.GMX_VISUAL_BETA_URL || 'http://127.0.0.1:8011').replace(/\/$/, '');

function clean(v, max = 500) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function onlinePrice(provider, variant, currency, values = {}, sourceUrl = '', updatedAt = null) {
  return {
    provider, variant: clean(variant || 'default', 120), currency: clean(currency || 'USD', 20),
    low: num(values.low ?? values.lowPrice), mid: num(values.mid ?? values.midPrice),
    high: num(values.high ?? values.highPrice), market: num(values.market ?? values.marketPrice),
    trend: num(values.trend), source_url: clean(sourceUrl, 700), provider_updated_at: updatedAt || null,
    fetched_at: new Date().toISOString(), origin: 'INTERNET'
  };
}

function pokemonApiPrices(card) {
  return Object.entries(card?.tcgplayer?.prices || {}).map(([variant, values]) =>
    onlinePrice('TCGplayer', variant, 'USD', values, card?.tcgplayer?.url, card?.tcgplayer?.updatedAt));
}

function tcgdexPrices(card) {
  const tcg = card?.pricing?.tcgplayer || {};
  const rows = [];
  for (const [variant, values] of Object.entries(tcg)) {
    if (!values || typeof values !== 'object') continue;
    if (!['lowPrice', 'midPrice', 'highPrice', 'marketPrice'].some((key) => key in values)) continue;
    rows.push(onlinePrice('TCGplayer', variant, tcg.unit || 'USD', values, 'https://www.tcgplayer.com/', tcg.updated));
  }
  return rows;
}
function externalQueryVariants(value) {
  const original = clean(value, 180);

  const simplified = original.
  replace(/[._/\\]+/g, ' ').
  replace(/[^A-Za-z0-9À-ÿ'’:\- ]+/g, ' ').
  replace(/\s+/g, ' ').
  trim();

  const noPunctuation = simplified.
  replace(/[:'’\-]+/g, ' ').
  replace(/\s+/g, ' ').
  trim();

  const words = noPunctuation.split(' ').filter(Boolean);

  const variants = [
  original,
  simplified,
  noPunctuation,
  words.slice(0, 5).join(' '),
  words.slice(0, 3).join(' '),
  words.slice(0, 2).join(' ')].

  map((x) => clean(x, 180)).
  filter((x) => x.length >= 2);

  return [...new Set(variants)];
}


async function getJson(url, { headers = {}, timeout = 15000 } = {}) {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json;q=0.9,*/*;q=0.8',
      'User-Agent': "TCG-Store-External-Card-Beta/1.0",
      ...headers
    },
    signal: AbortSignal.timeout(timeout)
  });
  let body = null;
  try {body = await r.json();} catch {}
  if (!r.ok) {
    const e = new Error(`REMOTE_HTTP_${r.status}`);
    e.status = r.status;
    e.remote = body;
    throw e;
  }
  return body;
}

function ygoRows(cards = []) {
  const out = [];
  for (const c of cards) {
    const sets = Array.isArray(c.card_sets) && c.card_sets.length ? c.card_sets : [null];
    const img = c.card_images?.[0]?.image_url_small || c.card_images?.[0]?.image_url || '';
    const prices = c.card_prices?.[0] || {};
    for (const set of sets) {
      const printCode = clean(set?.set_code, 80);
      const setCode = clean(printCode.split('-')[0] || set?.set_name, 80).toUpperCase();
      const internetPrices = [
        onlinePrice('TCGplayer', 'lowest', 'USD', { market: prices.tcgplayer_price }),
        onlinePrice('Cardmarket', 'lowest', 'EUR', { market: prices.cardmarket_price }),
        onlinePrice('eBay', 'lowest', 'USD', { market: prices.ebay_price }),
        onlinePrice('Amazon', 'lowest', 'USD', { market: prices.amazon_price })
      ].filter((row) => row.market != null);
      out.push({
        source: 'YGOPRODeck',
        game: 'YUGIOH',
        external_id: String(c.id || ''),
        name: clean(c.name, 180),
        set_name: clean(set?.set_name, 220),
        set_code: setCode,
        collector_number: printCode,
        rarity: clean(set?.set_rarity, 120),
        type: clean(c.type, 120),
        description: clean(c.desc, 1200),
        image: img,
        language: 'EN',
        market_price_usd: num(prices.tcgplayer_price),
        internet_prices: internetPrices,
        identification_source: 'INTERNET',
        raw_hint: { card_id: c.id, archetype: clean(c.archetype, 120) }
      });
      if (out.length >= 30) return out;
    }
  }
  return out;
}

async function searchYgo(q) {
  /* YGO_ROBUST_VARIANTS_R12B */

  const variants = externalQueryVariants(q);

  for (const variant of variants) {
    try {
      const params = new URLSearchParams({
        fname: variant,
        num: '30',
        offset: '0'
      });

      const body = await getJson(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?${params}`
      );

      const rows = ygoRows(body?.data || []);

      if (rows.length) {
        return rows;
      }
    } catch (error) {
      /*
       * YGOPRODeck returns HTTP 400 when no card matches fname.
       * For OCR searches this is a normal "no match" condition,
       * not a GMX system failure.
       */
      if (Number(error?.status || 0) === 400) {
        continue;
      }

      throw error;
    }
  }

  return [];
}

async function searchPokemon(q) {
  const headers = {};
  if (process.env.GMX_POKEMON_TCG_API_KEY) headers['X-Api-Key'] = process.env.GMX_POKEMON_TCG_API_KEY;
  try {
    const escaped = clean(q, 120).replace(/["\\]/g, ' ');
    const params = new URLSearchParams({ q: `name:"${escaped}"`, pageSize: '30', orderBy: '-set.releaseDate' });
    const body = await getJson(`https://api.pokemontcg.io/v2/cards?${params}`, { headers, timeout: 30000 });
    const cards = Array.isArray(body?.data) ? body.data : [];
    if (cards.length) return cards.map((c) => {
      const prices = pokemonApiPrices(c);
      return {
        source: 'POKEMON_TCG_API', game: 'POKEMON', external_id: clean(c.id, 100),
        name: clean(c.name, 180), set_name: clean(c.set?.name, 220), set_code: clean(c.set?.id, 80),
        collector_number: clean(c.number, 80), rarity: clean(c.rarity, 120),
        type: clean([c.supertype, ...(c.subtypes || [])].filter(Boolean).join(' · '), 180),
        description: clean((c.rules || []).join(' '), 1200), image: clean(c.images?.large || c.images?.small, 500),
        language: 'EN', market_price_usd: prices.find((row) => row.market != null)?.market ?? null,
        internet_prices: prices, identification_source: 'INTERNET',
        raw_hint: { hp: c.hp ?? null, illustrator: clean(c.artist, 150), source_url: `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(c.id)}` }
      };
    });
  } catch (error) {
    console.warn(brandText('[GMX][INTERNET_POKEMON_PRIMARY]'), String(error?.message || error));
  }

  const params = new URLSearchParams({ name: q });
  const list = await getJson(`https://api.tcgdex.net/v2/en/cards?${params}`);
  const brief = (Array.isArray(list) ? list : []).slice(0, 20);
  const details = await Promise.all(brief.map(async (item) => {
    try { return await getJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(item.id)}`, { timeout: 15000 }); }
    catch { return item; }
  }));
  return details.map((c) => {
    const prices = tcgdexPrices(c);
    return {
      source: 'TCGDEX', game: 'POKEMON', external_id: clean(c.id, 100), name: clean(c.name, 180),
      set_name: clean(c.set?.name, 220), set_code: clean(c.set?.id, 80), collector_number: clean(c.localId, 80),
      rarity: clean(c.rarity, 120), type: clean(Array.isArray(c.types) ? c.types.join(', ') : c.category, 120),
      description: clean(c.effect || c.description || '', 1200), image: clean(c.image, 500), language: 'EN',
      market_price_usd: prices.find((row) => row.market != null)?.market ?? null,
      internet_prices: prices, identification_source: 'INTERNET',
      raw_hint: { hp: c.hp ?? null, illustrator: clean(c.illustrator, 150) }
    };
  });
}

async function searchMagic(q) {
  const params = new URLSearchParams({ q });
  const body = await getJson(`https://api.scryfall.com/cards/search?${params}`);
  return (body?.data || []).slice(0, 20).map((c) => {
    const prices = [
      onlinePrice('Scryfall', 'normal', 'USD', { market: c.prices?.usd }, c.purchase_uris?.tcgplayer || c.scryfall_uri),
      onlinePrice('Scryfall', 'foil', 'USD', { market: c.prices?.usd_foil }, c.purchase_uris?.tcgplayer || c.scryfall_uri),
      onlinePrice('Scryfall', 'etched', 'USD', { market: c.prices?.usd_etched }, c.purchase_uris?.tcgplayer || c.scryfall_uri)
    ].filter((row) => row.market != null);
    return ({
    source: 'Scryfall',
    game: 'MAGIC',
    external_id: clean(c.id, 100),
    name: clean(c.name, 180),
    set_name: clean(c.set_name, 220),
    set_code: clean(c.set, 80).toUpperCase(),
    collector_number: clean(c.collector_number, 80),
    rarity: clean(c.rarity, 120),
    type: clean(c.type_line, 180),
    description: clean(c.oracle_text, 1200),
    image: clean(c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal || '', 500),
    language: clean(c.lang, 20).toUpperCase(),
    market_price_usd: num(c.prices?.usd),
    internet_prices: prices,
    identification_source: 'INTERNET',
    raw_hint: { released_at: c.released_at || '', mana_cost: clean(c.mana_cost, 80) }
    });
  });
}

function normalized(value) {
  return clean(value, 300).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function rankInternetCandidates(rows, query) {
  const wanted = normalized(query);
  return [...rows].map((row) => {
    const name = normalized(row.name);
    const internetMatchScore = name === wanted ? 100 : name.startsWith(wanted) ? 85 :
      name.includes(wanted) || wanted.includes(name) ? 70 : 40;
    return { ...row, internet_match_score: internetMatchScore };
  }).sort((a, b) => b.internet_match_score - a.internet_match_score || String(a.name).localeCompare(String(b.name))).slice(0, 30);
}

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      ok: true,
      module: 'External Card Lookup Beta',
      read_only: false,
      mode: 'VISUAL_TCG_R3_INTERNET_FIRST',
      internet_identity: true,
      local_visual_model: false,
      tcgplayer: {
        direct_client: false,
        pricing_source: 'EXISTING_INTERNET_PROVIDERS_WITH_GMX_CACHE_FALLBACK',
        scraping: false
      },
      batch_limits: visualTcgLimits,
      providers: [
      { id: 'POKEMON', name: 'Pokémon TCG API / TCGdex', api_key: false },
      { id: 'YUGIOH', name: 'YGOPRODeck', api_key: false },
      { id: 'MAGIC', name: 'Scryfall', api_key: false }]

    }
  });
});

function adapterError(res, error) {
  const code = String(error?.message || error || 'VISUAL_TCG_ADAPTER_FAILED');
  const clientErrors = new Set([
    'VISUAL_IDENTITY_INCOMPLETE', 'VISUAL_BATCH_TOO_LARGE', 'MASTER_CARD_IDS_REQUIRED',
    'INSTALL_BATCH_TOO_LARGE', 'MASTER_CARD_NOT_FOUND', 'MASTER_GAME_NOT_FOUND'
  ]);
  const schemaUnavailable = error?.code === '42P01' || error?.code === '42703';
  console.error(brandText('[GMX][VISUAL_TCG_ADAPTER]'), code, error?.code || '');
  return res.status(schemaUnavailable ? 503 : clientErrors.has(code) ? 400 : 500).json({
    success: false,
    error: schemaUnavailable ? 'TCG_MASTER_CATALOG_NOT_AVAILABLE' : code,
    message: schemaUnavailable ?
      'El catálogo maestro TCG actual no está disponible. Ejecuta primero las migraciones y sincronización TCG existentes.' :
      code
  });
}

router.post('/resolve-gmx', async (req, res) => {
  try {
    const rows = await resolveVisualIdentities([req.body?.identity || req.body || {}]);
    return res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    return adapterError(res, error);
  }
});

router.post('/bulk-resolve-gmx', async (req, res) => {
  try {
    const identities = Array.isArray(req.body?.identities) ? req.body.identities : [];
    const rows = await resolveVisualIdentities(identities);
    return res.json({
      success: true,
      data: {
        requested: identities.length,
        unique: rows.length,
        identified: rows.filter((row) => row.status === 'INTERNET_IDENTIFIED').length,
        rows
      }
    });
  } catch (error) {
    return adapterError(res, error);
  }
});

router.post('/ensure-operational', requireModule('TCG'), async (req, res) => {
  try {
    const cards = await ensureOperationalIdentities([req.body?.identity || {}]);
    return res.status(201).json({ success: true, data: cards[0] || null });
  } catch (error) {
    return adapterError(res, error);
  }
});

router.post('/bulk-ensure-operational', requireModule('TCG'), async (req, res) => {
  try {
    const cards = await ensureOperationalIdentities(req.body?.identities || []);
    return res.status(201).json({ success: true, data: { count: cards.length, cards } });
  } catch (error) {
    return adapterError(res, error);
  }
});

router.get('/search', async (req, res) => {
  const game = clean(req.query.game, 20).toUpperCase();
  const q = clean(req.query.q, 180);

  if (!q || q.length < 2) {
    return res.status(400).json({ success: false, error: 'QUERY_REQUIRED', message: 'Escribe al menos 2 caracteres para buscar.' });
  }

  try {
    let rows = [];
    if (game === 'YUGIOH') rows = await searchYgo(q);else
    if (game === 'POKEMON') rows = await searchPokemon(q);else
    if (game === 'MAGIC') rows = await searchMagic(q);else
    return res.status(400).json({ success: false, error: 'GAME_REQUIRED', message: 'Selecciona Pokémon, Yu-Gi-Oh! o Magic.' });

    res.json({
      success: true,
      data: {
        game,
        query: q,
        count: rows.length,
        rows
      }
    });
  } catch (error) {
    console.error(brandText("[GMX][EXTERNAL_CARD_BETA]"), game, q, error);
    const status = Number(error?.status || 0);
    res.status(status === 429 ? 429 : 502).json({
      success: false,
      error: status === 429 ? 'EXTERNAL_RATE_LIMIT' : 'EXTERNAL_LOOKUP_FAILED',
      message: status === 429 ?
      'La fuente externa está limitando temporalmente las consultas. Espera un momento.' :
      'No fue posible consultar la fuente externa en este momento.'
    });
  }
});


router.post('/visual-search', async (req, res) => {
  const game = clean(req.body?.game, 20).toUpperCase();
  const q = clean(req.body?.q, 180);
  const imageBase64 = String(req.body?.image_base64 || req.body?.imageBase64 || '');

  if (!q || q.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'QUERY_REQUIRED',
      message: 'Se requiere una pista literal (nombre, set code, collector number o passcode) para consultar el proveedor. La imagen no se compara contra GMX.'
    });
  }

  try {
    let candidates = [];
    if (game === 'YUGIOH') candidates = await searchYgo(q); else
    if (game === 'POKEMON') candidates = await searchPokemon(q); else
    if (game === 'MAGIC') candidates = await searchMagic(q); else
      return res.status(400).json({ success: false, error: 'GAME_REQUIRED', message: 'Selecciona Pokémon, Yu-Gi-Oh! o Magic.' });

    if (!candidates.length) {
      return res.json({ success: true, data: { game, query: q, matches: [], candidate_count: 0, compared_count: 0, identification_mode: 'INTERNET_CATALOG', message: 'Los proveedores de Internet no encontraron candidatos.' } });
    }

    let matches = rankInternetCandidates(candidates, q);
    let comparedCount = 0;
    let identificationMode = 'INTERNET_CATALOG_TEXT';

    if (imageBase64) {
      const vr = await fetch(`${VISUAL_SERVICE_URL}/external-rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_base64: imageBase64,
          candidates: candidates.slice(0, 30).map((c) => ({
            source: c.source, game: c.game, external_id: c.external_id, name: c.name,
            set_name: c.set_name, set_code: c.set_code, collector_number: c.collector_number,
            rarity: c.rarity, type: c.type, description: c.description, image: c.image,
            language: c.language, market_price_usd: c.market_price_usd,
            raw_hint: { ...(c.raw_hint || {}), internet_prices: c.internet_prices || [] }
          })),
          limit: Math.min(10, candidates.length)
        }),
        signal: AbortSignal.timeout(120000)
      });
      const vp = await vr.json().catch(() => ({}));
      if (!vr.ok) throw new Error(`VISUAL_EXTERNAL_RANK_FAILED:${vp?.detail || vr.status}`);
      matches = (vp.matches || []).map((m) => ({
        ...m,
        internet_prices: m?.raw_hint?.internet_prices || [],
        similarity: Number(m.visual_similarity || 0)
      }));
      comparedCount = Number(vp.compared_count || 0);
      identificationMode = 'INTERNET_CANDIDATES_OPENCLIP';
    }

    return res.json({ success: true, data: {
      game, query: q, matches,
      candidate_count: candidates.length,
      compared_count: comparedCount,
      identification_mode: identificationMode,
      provider: candidates[0]?.source || '',
      local_catalog_used: false
    }});
  } catch (error) {
    console.error(brandText('[GMX][EXTERNAL_PHOTO_SEARCH]'), game, q, error);
    const detail = String(error?.message || error);
    const offline = /fetch failed|aborted|timeout|VISUAL_EXTERNAL_RANK_FAILED/i.test(detail);
    return res.status(offline ? 503 : 502).json({
      success: false,
      error: offline ? 'INTERNET_OR_VISUAL_PROVIDER_OFFLINE' : 'EXTERNAL_PHOTO_SEARCH_FAILED',
      message: offline ? 'No fue posible conectar con el proveedor de Internet o con OpenCLIP.' : 'No fue posible completar la identificación mediante Internet.',
      provider_error_detail: detail.slice(0, 240)
    });
  }
});
export default router;
