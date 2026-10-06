// Changuito Rosario — relevador diario.
// Corre en GitHub Actions (Node 20+). Baja los catálogos de Coto, Carrefour, Jumbo y Cepro,
// arma la compra mensual de 52 productos y escribe data/catalog.json y data/basket.json.
//
// Uso: node scanner/scan.mjs [--prev-dir carpeta_con_datos_de_ayer] [--out data] [--only coto,cepro] [--limit N]

import fs from 'node:fs/promises';
import path from 'node:path';
import { ITEMS, normalize } from './items.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const OUT = args.out || 'data';
const PREV_DIR = args['prev-dir'] || OUT;
const ONLY = args.only ? String(args.only).split(',') : null;
const LIMIT = args.limit ? +args.limit : Infinity; // para pruebas: corta cada categoría
const MINSCALE = args['min-scale'] != null ? +args['min-scale'] : 1; // para pruebas: baja los mínimos de control

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export const STORES = {
  coto: { name: 'Coto', kind: 'coto', bases: ['https://www.cotodigital.com.ar', 'https://www.coto.com.ar'],
          cats: ['Almacén', 'Bebidas', 'Frescos', 'Congelados', 'Limpieza', 'Perfumería'], minCatalog: 3000 },
  carrefour: { name: 'Carrefour', kind: 'vtex', bases: ['https://www.carrefour.com.ar'],
          cats: [161, 222, 255, 292, 321, 330, 336, 347, 359, 402, 451, 471], minCatalog: 3000 },
  jumbo: { name: 'Jumbo', kind: 'vtex', bases: ['https://www.jumbo.com.ar'],
          cats: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 457], minCatalog: 3000 },
  cepro: { name: 'Cepro', kind: 'woo', bases: ['https://ceprosg.com.ar'], minCatalog: 400 },
};

// ---------- utilidades ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { json = true, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA, 'accept': json ? 'application/json' : '*/*', 'accept-language': 'es-AR,es;q=0.9' }, signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return { r, body: json ? await r.json() : await r.text() };
    } catch (e) { last = e; await sleep(1500 * (i + 1)); }
  }
  throw last;
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();
const goodEan = e => /^\d{8,14}$/.test(e || '') && !/^2/.test(e) && !/^0+$/.test(e);
function cleanPromo(list) {
  return [...new Set(list.filter(Boolean))]
    .filter(t => !/^Tarjeta Carrefour/i.test(t))
    .map(t => t.replace(/^PROMO-Mi CRF\b.*?Dto de (\d+%).*$/i, '$1 Mi Carrefour').replace(/^PROMO-/, '').replace(/ Max \d+ unidades.*$/, '').replace(/ Combinable.*$/, '').replace(/\s*-(Reg|mfl)-.*$/i, '').replace(/Mi CRF/i, 'Mi Carrefour').trim())
    .filter(Boolean).slice(0, 2).join('; ').slice(0, 90);
}
export function mapCat(path) {
  // path: segmentos de categoría separados por "|", del más específico al más general
  const R = [
    ['Mascotas', /mascota|perro|gato/], ['Bebé', /beb[eé]|pañal/], ['Perfumería', /perfum|higiene|cuidado (personal|capilar|corporal|oral)|farmacia|desodorante|shampoo/],
    ['Limpieza', /limpieza|lavado|descartable|insecticida|papeles/], ['Congelados', /congelad|helado|mc cain|formados de papa/],
    ['Desayuno y dulces', /desayuno|infusi|caf[eé]|yerba|galletit|cereal|\bmate\b|\bt[eé]\b|golosina|chocolate|alfajor|mermelada|dulce de leche/],
    ['Bebidas', /bebida|gaseosa|aguas? (mineral|saboriz)|^aguas?$|cerveza|vino|jugo|aperitivo|espumante|whisky|fernet|licor/],
    ['Frutas y verduras', /fruta|verdura|vegetales/], ['Carnes y pescados', /carne|pollo|pescad|cerdo|cordero|marisco|embutido|vacun|achura|hamburgues/],
    ['Lácteos y fiambres', /l[aá]cteo|leche|queso|fiambre|yogur|manteca|crema|huevo|jam[oó]n|rotiser|pastas frescas|frescos/],
    ['Panadería', /panader|pasteler|medialuna|pan /],
    ['Almacén', /almac[eé]n|aceite|arroz|harina|fideo|conserva|condiment|especia|aderezo|caldo|legumbre|snack|copet|kiosko|az[uú]car|seco|enlatad|sal,|reposter|pastas secas/],
  ];
  for (const seg of String(path || '').toLowerCase().split('|')) for (const [k, re] of R) if (re.test(seg)) return k;
  return 'Otros';
}

// ---------- VTEX (Carrefour, Jumbo) ----------
function vtexParse(p, base) {
  const items = p.items || [];
  let it = null, o = null;
  for (const x of items) {
    const s = (x.sellers || []).find(s => s.commertialOffer && s.commertialOffer.AvailableQuantity > 0 && s.commertialOffer.Price > 0);
    if (s) { it = x; o = s.commertialOffer; break; }
  }
  if (!it) return null;
  let list = o.ListPrice || o.Price; if (list < o.Price || list > o.Price * 3) list = o.Price;
  const promo = cleanPromo([...(o.teasers || o.PromotionTeasers || []).map(t => t.name || t.Name), ...(o.discountHighlights || o.DiscountHighLight || []).map(t => t.name || t.Name)]);
  const img = ((it.images || [])[0] || {}).imageUrl || '';
  const m = img.match(/\/arquivos\/ids\/(\d+)/);
  const link = (p.link || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '').replace(/\/p$/, '');
  const kg = it.measurementUnit === 'kg';
  const price = o.Price, lp = list; // en productos por kg, VTEX ya informa el precio por kilo
  return {
    id: String(p.productId), ean: it.ean || '', n: clean(p.productName), b: clean(p.brand),
    cat: ((p.categories || [])[0] || '').split('/').filter(Boolean).reverse().join('|'),
    price, list: lp, promo, img: m ? m[1] : '', imgHost: img ? img.replace(/\/arquivos\/ids\/.*$/, '/arquivos/ids/') : '',
    link, kg,
  };
}
async function vtexCatalog(st, base) {
  const { body: tree } = await get(base + '/api/catalog_system/pub/category/tree/3');
  const byId = new Map(); (function walk(cs) { for (const c of cs) { byId.set(c.id, c); walk(c.children || []); } })(tree);
  const pathOf = c => new URL(c.url).pathname.split('/').filter(Boolean);
  const isUrl = segs => base + '/api/io/_v/api/intelligent-search/product_search/' + segs.map((s, i) => `category-${i + 1}/${s}`).join('/');
  const out = new Map();
  async function crawl(c, depth) {
    const segs = pathOf(c);
    const first = await get(isUrl(segs) + '?page=1&count=50&hideUnavailableItems=true');
    const total = first.body.recordsFiltered || 0;
    if (total > 2450 && (c.children || []).length && depth < 3) {
      for (const ch of c.children) await crawl(ch, depth + 1);
      return;
    }
    const pages = Math.min(50, Math.ceil(Math.min(total, LIMIT) / 50));
    const handle = body => { for (const p of body.products || []) { const x = vtexParse(p, base); if (x && !out.has(x.id)) out.set(x.id, x); } };
    handle(first.body);
    await pool(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), 4, async pg => {
      try { const { body } = await get(isUrl(segs) + `?page=${pg}&count=50&hideUnavailableItems=true`); handle(body); }
      catch (e) { console.warn('  página fallida', c.name, pg, e.message); }
    });
    console.log(`  ${st.name} · ${c.name}: ${total} (acumulado ${out.size})`);
  }
  for (const id of st.cats) { const c = byId.get(id); if (!c) { console.warn('  categoría no encontrada', id); continue; } await crawl(c, 1); }
  return [...out.values()];
}
async function vtexSearch(base, q) {
  const { body } = await get(base + '/api/catalog_system/pub/products/search?ft=' + encodeURIComponent(q) + '&_from=0&_to=39');
  const out = [];
  for (const p of body) for (const it of (p.items || [])) {
    const s = (it.sellers || []).find(x => x.commertialOffer && x.commertialOffer.AvailableQuantity > 0 && x.commertialOffer.Price > 0);
    if (!s) continue; const o = s.commertialOffer;
    let list = o.ListPrice || o.Price; if (list < o.Price || list > o.Price * 3) list = o.Price;
    const promo = cleanPromo([...(o.PromotionTeasers || []).map(t => t.Name), ...(o.DiscountHighLight || []).map(t => t.Name)]);
    out.push({ n: p.productName || '', p: o.Price, l: list, o: promo, mu: it.measurementUnit });
  }
  return out;
}

// ---------- Coto (Oracle Endeca) ----------
function cotoMain(j) {
  let main = null;
  (function f(x) { if (main) return; if (Array.isArray(x)) x.forEach(f); else if (x && typeof x === 'object') { if (x.totalNumRecs !== undefined && Array.isArray(x.records)) { main = x; return; } Object.values(x).forEach(f); } })(j);
  return main;
}
function cotoParse(rec) {
  const a = rec.records ? rec.records[0].attributes : rec.attributes;
  const g = k => (a[k] || [])[0];
  const n = clean(g('product.displayName')); const list = parseFloat(g('sku.activePrice'));
  if (!n || !list) return null;
  let d = []; try { d = JSON.parse(g('product.dtoDescuentos') || '[]'); } catch (e) { }
  let p = list; const promos = [];
  for (const x of d) {
    const t = (x.textoDescuento || '').trim(); const pd = parseFloat(String(x.precioDesc || x.precioDescuento || '').replace(/[^\d.]/g, ''));
    if (/^\d+%\s*dto/i.test(t) && pd && pd < p) p = pd; else if (t) promos.push(t + (pd ? ' ($' + Math.round(pd) + ' c/u)' : ''));
  }
  const img = g('product.mediumImage.url') || '';
  const m = img.match(/fotos\/medium\/(.+)\.jpg/i);
  return {
    id: String(g('sku.repositoryId') || g('product.repositoryId') || n), ean: g('product.eanPrincipal') || '', n, b: clean(g('product.MARCA') || g('product.brand')),
    cat: clean(g('parentCategory.displayName') || g('product.category') || ''), price: p, list, promo: promos.slice(0, 2).join('; ').slice(0, 90),
    img: m ? m[1] : '', link: '', kg: /x ?kg/i.test(n) || g('product.unidades.esPesable') === '1',
  };
}
async function cotoCatalog(st, base) {
  const u = (extra) => base + '/sitios/cdigi/categoria?_dyncharset=utf-8&Dy=1&format=json' + extra;
  const { body: root } = await get(u('&No=0&Nrpp=1'));
  // categorías de primer nivel desde el menú de refinamiento "Categoria"
  const cats = [];
  (function f(x) { if (Array.isArray(x)) x.forEach(f); else if (x && typeof x === 'object') { if (x['@type'] === 'RefinementMenu' && /categor/i.test(x.name || x.displayName || '')) for (const r of x.refinements || []) cats.push(r); Object.values(x).forEach(f); } })(root);
  const out = new Map();
  for (const label of st.cats) {
    const r = cats.find(c => c.label === label);
    if (!r) { console.warn('  Coto: no encontré la categoría', label); continue; }
    const N = (r.navigationState || '').match(/N-([a-z0-9]+)/i);
    if (!N) continue;
    const total = Math.min(r.count || 0, LIMIT);
    const offsets = []; for (let o = 0; o < total; o += 500) offsets.push(o);
    await pool(offsets, 3, async off => {
      try {
        const { body } = await get(u(`&N=${N[1]}&No=${off}&Nrpp=500`));
        const main = cotoMain(body); for (const rec of (main && main.records) || []) { const x = cotoParse(rec); if (x) { x.cat = (x.cat ? x.cat + '|' : '') + label; out.set(x.id, x); } }
      } catch (e) { console.warn('  Coto página fallida', label, off, e.message); }
    });
    console.log(`  Coto · ${label}: ${r.count} (acumulado ${out.size})`);
  }
  return [...out.values()];
}
async function cotoSearch(base, q) {
  const { body } = await get(base + '/sitios/cdigi/categoria?_dyncharset=utf-8&Dy=1&Ntt=' + encodeURIComponent(q) + '&No=0&Nrpp=40&format=json');
  const main = cotoMain(body); const out = [];
  for (const rec of (main && main.records) || []) { const x = cotoParse(rec); if (x) out.push({ n: x.n, p: x.price, l: x.list, o: x.promo, mu: /x ?kg/i.test(x.n) ? 'kg' : 'un' }); }
  return out;
}

// ---------- Cepro (WooCommerce) ----------
function wooParse(p) {
  if (!p.is_in_stock || !p.is_purchasable) return null;
  const k = Math.pow(10, p.prices.currency_minor_unit || 0);
  const price = +p.prices.price / k; const reg = +p.prices.regular_price / k || price;
  if (!price) return null;
  const img = ((p.images || [])[0] || {}).thumbnail || '';
  const m = img.match(/wp-content\/uploads\/(.+)$/);
  return {
    id: String(p.id), ean: '', n: clean(p.name.replace(/&amp;/g, '&').replace(/&#8211;/g, '-')), b: clean(((p.brands || [])[0] || {}).name || ''),
    cat: (p.categories || []).map(c => c.name).join('|'), price, list: Math.max(reg, price), promo: p.on_sale && reg > price ? 'Oferta' : '',
    img: m ? m[1] : '', link: (p.permalink || '').replace(/^https?:\/\/[^/]+\/producto\//, '').replace(/\/$/, ''), kg: /x ?kg\b|por kg/i.test(p.name),
  };
}
async function wooCatalog(st, base) {
  const first = await get(base + '/wp-json/wc/store/v1/products?per_page=100&page=1');
  const pages = Math.min(+first.r.headers.get('x-wp-totalpages') || 1, Math.ceil(LIMIT / 100));
  const out = new Map();
  const handle = arr => { for (const p of arr) { const x = wooParse(p); if (x) out.set(x.id, x); } };
  handle(first.body);
  await pool(Array.from({ length: Math.max(0, pages - 1) }, (_, i) => i + 2), 3, async pg => {
    try { const { body } = await get(base + `/wp-json/wc/store/v1/products?per_page=100&page=${pg}`); handle(body); }
    catch (e) { console.warn('  Cepro página fallida', pg, e.message); }
  });
  console.log(`  Cepro: ${out.size}`);
  return [...out.values()];
}
async function wooSearch(base, q) {
  const { body } = await get(base + '/wp-json/wc/store/v1/products?per_page=40&search=' + encodeURIComponent(q));
  return body.map(wooParse).filter(Boolean).map(x => ({ n: x.n, p: x.price, l: x.list, o: x.promo, mu: x.kg ? 'kg' : 'un' }));
}

// ---------- compra mensual (misma lógica que el relevador original) ----------
async function basketFor(search, base) {
  const prices = {};
  await pool(ITEMS, 4, async ([id, qs, must, excl, targets]) => {
    const cands = []; const seen = new Set();
    for (const q of qs) {
      let res = []; try { res = await search(base, q); } catch (e) { }
      for (const c of res) {
        if (seen.has(c.n + c.p)) continue; seen.add(c.n + c.p);
        if (!must.test(c.n) || excl.test(c.n)) continue;
        const nm = normalize(c.n, c.p, c.l, targets, c.mu); if (!nm) continue;
        cands.push([Math.round(nm[0]), Math.round(nm[1]), c.n.slice(0, 70), (c.o || '').slice(0, 90)]);
      }
    }
    if (!cands.length) return;
    const sorted = cands.map(c => c[0]).sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
    const ok = cands.filter(c => c[0] >= 200 && (cands.length < 3 || c[0] >= med * 0.25));
    ok.sort((a, b) => a[0] - b[0]);
    if (ok.length) prices[id] = ok[0];
  });
  return prices;
}

// ---------- principal ----------
const KIND = {
  vtex: { catalog: vtexCatalog, search: vtexSearch },
  coto: { catalog: cotoCatalog, search: cotoSearch },
  woo: { catalog: wooCatalog, search: wooSearch },
};
async function readJson(f) { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch (e) { return null; } }
const BASKET_MIN = { coto: 35, carrefour: 35, jumbo: 35, cepro: 8 };

export async function main() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(now);
  const prevCat = await readJson(path.join(PREV_DIR, 'catalog.json'));
  const prevBasket = await readJson(path.join(PREV_DIR, 'basket.json'));
  const config = await readJson(path.join(path.dirname(new URL(import.meta.url).pathname), 'basket-items.json'));
  const report = [];

  const storeMeta = {}; const catalogs = {}; const baskets = {};
  for (const [sid, st] of Object.entries(STORES)) {
    if (ONLY && !ONLY.includes(sid)) continue;
    const k = KIND[st.kind];
    let base = null, cat = null, err = null;
    for (const b of st.bases) {
      try { console.log(`→ ${st.name} (${b})`); cat = await k.catalog(st, b); base = b; break; }
      catch (e) { err = e; console.warn('  falló', b, e.message); }
    }
    const prevN = prevCat && prevCat.stores && prevCat.stores[sid] ? prevCat.stores[sid].n : 0;
    const minN = Math.max(1, Math.round((LIMIT < Infinity ? 1 : st.minCatalog) * MINSCALE), Math.round(prevN * 0.5 * MINSCALE));
    if (cat && cat.length >= minN) {
      catalogs[sid] = cat; storeMeta[sid] = { name: st.name, n: cat.length, at: now.toISOString(), ok: true };
      report.push(`${st.name}: catálogo OK (${cat.length} productos)`);
    } else {
      storeMeta[sid] = prevCat && prevCat.stores && prevCat.stores[sid]
        ? { ...prevCat.stores[sid], ok: false, stale: true }
        : { name: st.name, n: 0, at: null, ok: false };
      report.push(`${st.name}: catálogo FALLÓ (${cat ? cat.length + ' productos' : err && err.message}); se mantiene el anterior`);
    }
    // compra mensual
    let bp = null;
    if (base) { try { bp = await basketFor(k.search, base); } catch (e) { bp = null; } }
    const prevB = prevBasket && prevBasket.stores && prevBasket.stores[sid];
    const nB = bp ? Object.keys(bp).length : 0;
    const prevNB = prevB && prevB.ok !== false ? Object.keys(prevB.prices || {}).length : 0;
    const minB = Math.max(1, Math.round((BASKET_MIN[sid] || 10) * MINSCALE), Math.round(prevNB * 0.7 * MINSCALE));
    if (bp && nB >= minB) {
      baskets[sid] = { prices: bp, at: now.toISOString(), ok: true };
      report.push(`${st.name}: compra mensual OK (${nB}/52)`);
    } else {
      baskets[sid] = prevB ? { ...prevB, ok: false, stale: true } : { prices: {}, at: null, ok: false };
      report.push(`${st.name}: compra mensual FALLÓ (${nB}/52); se mantiene la anterior`);
    }
  }

  // ---- catálogo unificado por código de barras ----
  const products = new Map(); const imgHost = { coto: 'https://static.cotodigital3.com.ar/sitios/fotos/medium/', cepro: 'https://ceprosg.com.ar/wp-content/uploads/' };
  const linkBase = {
    carrefour: 'https://www.carrefour.com.ar/{}/p', jumbo: 'https://www.jumbo.com.ar/{}/p', cepro: 'https://ceprosg.com.ar/producto/{}/',
    coto: 'https://www.cotodigital.com.ar/sitios/cdigi/categoria?_dyncharset=utf-8&Ntt={}',
  };
  const prevIndex = new Map();
  if (prevCat && prevCat.products) for (const p of prevCat.products) prevIndex.set(p.i, p);
  // las cadenas que fallaron hoy reusan su parte del catálogo anterior
  for (const sid of Object.keys(STORES)) {
    if (ONLY && !ONLY.includes(sid)) continue;
    if (catalogs[sid] || !prevCat) continue;
    if (prevCat.img && prevCat.img[sid]) imgHost[sid] = prevCat.img[sid];
    catalogs[sid] = (prevCat.products || []).filter(p => p.p[sid]).map(p => ({
      id: p.i, ean: /^\d+$/.test(p.i) ? p.i : '', n: p.n, b: p.b, cat: p.c, catMapped: true,
      price: p.p[sid][0], list: p.p[sid][1], promo: p.p[sid][2], link: p.p[sid][3], kg: !!p.p[sid][4], img: p.m && p.m.startsWith(sid + ':') ? p.m.slice(sid.length + 1) : '', stale: true,
    }));
  }
  const order = ['carrefour', 'jumbo', 'coto', 'cepro']; // de quién se toma nombre e imagen
  for (const sid of order) {
    for (const x of catalogs[sid] || []) {
      if (x.imgHost && !imgHost[sid]) imgHost[sid] = x.imgHost;
      const key = goodEan(x.ean) ? x.ean : sid + ':' + x.id;
      let p = products.get(key);
      if (!p) { p = { i: key, n: x.n, b: x.b, c: x.catMapped ? x.cat : (m => m !== 'Otros' ? m : mapCat(x.n))(mapCat(x.cat)), m: x.img ? sid + ':' + x.img : '', p: {} }; products.set(key, p); }
      if (!p.m && x.img) p.m = sid + ':' + x.img;
      if (!p.b && x.b) p.b = x.b;
      if (p.p[sid] && p.p[sid][0] <= x.price) continue;
      const linkVal = sid === 'coto' ? '' : x.link;
      const entry = [Math.round(x.price), Math.round(x.list), x.promo || '', linkVal, x.kg ? 1 : 0];
      const old = prevIndex.get(key);
      if (old && old.p[sid]) { const a = old.p[sid][0]; if (a && Math.abs(x.price - a) / a >= 0.03) entry[5] = a; else if (old.p[sid][5] && x.stale) entry[5] = old.p[sid][5]; }
      p.p[sid] = entry;
    }
  }
  const list = [...products.values()].sort((a, b) => Object.keys(b.p).length - Object.keys(a.p).length || a.n.localeCompare(b.n, 'es'));
  const catalog = { v: 1, date, at: now.toISOString(), stores: storeMeta, img: imgHost, link: linkBase, products: list };
  for (const sid of Object.keys(STORES)) if (!storeMeta[sid] && prevCat && prevCat.stores && prevCat.stores[sid]) storeMeta[sid] = prevCat.stores[sid];

  const basket = {
    v: 1, date, at: now.toISOString(), items: (config && config.items) || (prevBasket && prevBasket.items) || [],
    stores: Object.fromEntries(Object.keys(STORES).map(s => [s, baskets[s] || (prevBasket && prevBasket.stores && prevBasket.stores[s]) || { prices: {}, ok: false }])),
    names: Object.fromEntries(Object.entries(STORES).map(([k, v]) => [k, v.name])),
    prev: prevBasket && prevBasket.date !== date ? { date: prevBasket.date, stores: Object.fromEntries(Object.entries(prevBasket.stores || {}).map(([k, v]) => [k, v.prices || {}])) } : (prevBasket && prevBasket.prev) || null,
  };

  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, 'catalog.json'), JSON.stringify(catalog));
  await fs.writeFile(path.join(OUT, 'basket.json'), JSON.stringify(basket));
  const summary = `Relevamiento ${date}\n` + report.map(r => '- ' + r).join('\n') + `\nProductos en el catálogo unificado: ${list.length} (${list.filter(p => Object.keys(p.p).length > 1).length} en más de un súper)`;
  await fs.writeFile(path.join(OUT, 'last-run.txt'), summary + '\n');
  console.log('\n' + summary);
  const anyOk = Object.values(storeMeta).some(s => s.ok);
  if (!anyOk) { console.error('Ninguna cadena respondió.'); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
