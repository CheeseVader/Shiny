import { brandText } from "../config/brand.js";import { Router } from 'express';

const router = Router();
const VISUAL_SERVICE_URL = String(process.env.GMX_VISUAL_BETA_URL || 'http://127.0.0.1:8011').replace(/\/$/, '');

function clean(v, max = 500) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
    for (const set of sets) {
      out.push({
        source: 'YGOPRODeck',
        game: 'YUGIOH',
        external_id: String(c.id || ''),
        name: clean(c.name, 180),
        set_name: clean(set?.set_name, 220),
        set_code: clean(set?.set_code, 80),
        collector_number: clean(set?.set_code, 80),
        rarity: clean(set?.set_rarity, 120),
        type: clean(c.type, 120),
        description: clean(c.desc, 1200),
        image: img,
        language: 'EN',
        market_price_usd: num(c.card_prices?.[0]?.tcgplayer_price),
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
  const params = new URLSearchParams({ name: q });
  const list = await getJson(`https://api.tcgdex.net/v2/en/cards?${params}`);
  const brief = (Array.isArray(list) ? list : []).slice(0, 10);
  const details = await Promise.all(brief.map(async (item) => {
    try {
      return await getJson(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(item.id)}`, { timeout: 12000 });
    } catch {
      return item;
    }
  }));
  return details.map((c) => ({
    source: 'TCGdex',
    game: 'POKEMON',
    external_id: clean(c.id, 100),
    name: clean(c.name, 180),
    set_name: clean(c.set?.name, 220),
    set_code: clean(c.set?.id, 80),
    collector_number: clean(c.localId, 80),
    rarity: clean(c.rarity, 120),
    type: clean(Array.isArray(c.types) ? c.types.join(', ') : c.category, 120),
    description: clean(c.effect || c.description || '', 1200),
    image: clean(c.image, 500),
    language: 'EN',
    market_price_usd: null,
    raw_hint: { hp: c.hp ?? null, illustrator: clean(c.illustrator, 150) }
  }));
}

async function searchMagic(q) {
  const params = new URLSearchParams({ q });
  const body = await getJson(`https://api.scryfall.com/cards/search?${params}`);
  return (body?.data || []).slice(0, 20).map((c) => ({
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
    raw_hint: { released_at: c.released_at || '', mana_cost: clean(c.mana_cost, 80) }
  }));
}

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      ok: true,
      module: 'External Card Lookup Beta',
      read_only: true,
      providers: [
      { id: 'POKEMON', name: 'TCGdex', api_key: false },
      { id: 'YUGIOH', name: 'YGOPRODeck', api_key: false },
      { id: 'MAGIC', name: 'Scryfall', api_key: false }]

    }
  });
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
  const imageBase64 = String(req.body?.image_base64 || '');

  if (!imageBase64) {
    return res.status(400).json({
      success: false, error: 'IMAGE_REQUIRED',
      message: 'Captura una fotografía de la carta.'
    });
  }

  if (imageBase64.length > 10_000_000) {
    return res.status(413).json({
      success: false, error: 'IMAGE_TOO_LARGE',
      message: 'La fotografía es demasiado grande.'
    });
  }

  if (!q || q.length < 2) {
    return res.status(400).json({
      success: false, error: 'QUERY_REQUIRED',
      message: 'No fue posible obtener texto suficiente para buscar candidatos externos.'
    });
  }

  try {
    let candidates = [];

    if (game === 'YUGIOH') candidates = await searchYgo(q);else
    if (game === 'POKEMON') candidates = await searchPokemon(q);else
    if (game === 'MAGIC') candidates = await searchMagic(q);else
    return res.status(400).json({
      success: false, error: 'GAME_REQUIRED',
      message: 'Selecciona Pokémon, Yu-Gi-Oh! o Magic.'
    });

    if (!candidates.length) {
      return res.json({
        success: true,
        data: {
          game, query: q, matches: [],
          candidate_count: 0, compared_count: 0,
          message: 'La fuente externa no encontró candidatos para comparar.'
        }
      });
    }

    const visualResponse = await fetch(`${VISUAL_SERVICE_URL}/external-rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: imageBase64,
        candidates: candidates.slice(0, 30),
        limit: 10
      }),
      signal: AbortSignal.timeout(120000)
    });

    const ranked = await visualResponse.json().catch(() => ({}));

    if (!visualResponse.ok) {
      return res.status(502).json({
        success: false, error: 'VISUAL_RANK_FAILED',
        message: 'OpenCLIP no pudo comparar la fotografía con las coincidencias externas.'
      });
    }

    return res.json({
      success: true,
      data: {
        game,
        query: q,
        ...ranked,
        provider: candidates[0]?.source || ''
      }
    });
  } catch (error) {
    console.error(brandText("[GMX][EXTERNAL_PHOTO_SEARCH]"), game, q, error);

    const text = String(error?.message || error);
    const offline = /fetch failed|ECONNREFUSED|aborted|timeout/i.test(text);

    return res.status(offline ? 503 : 502).json({
      success: false,
      error: offline ? 'VISUAL_SERVICE_OFFLINE' : 'EXTERNAL_PHOTO_SEARCH_FAILED',
      message: offline ?
      'El servicio local OpenCLIP no está iniciado.' :
      'No fue posible completar la búsqueda visual externa.',
      provider_error_detail: text.slice(0, 240)
    });
  }
});

export default router;
