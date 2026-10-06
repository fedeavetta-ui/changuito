/* Changuito Rosario — app web instalable.
   Lee data/basket.json (compra mensual), data/catalog.json (catálogo completo) y data/promos.json (bancos).
   La lista y los ajustes se guardan en este teléfono (localStorage). */
'use strict';

const STORE_ORDER = ['coto', 'carrefour', 'jumbo', 'cepro'];
const STORE_NAMES = { coto: 'Coto', carrefour: 'Carrefour', jumbo: 'Jumbo', cepro: 'Cepro' };
const FRESH_G = new Set(['Carnes', 'Verdulería']);
const FRESH_P = new Set(['Carnes y pescados', 'Frutas y verduras']);
const CAT_ORDER = ['Almacén', 'Desayuno y dulces', 'Lácteos', 'Lácteos y fiambres', 'Bebidas', 'Carnes', 'Carnes y pescados', 'Verdulería', 'Frutas y verduras', 'Panadería', 'Congelados', 'Limpieza', 'Higiene', 'Perfumería', 'Bebé', 'Mascotas', 'Otros'];
const KEY = 'changuito.v1';

const $ = id => document.getElementById(id);
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ%.,/ ]/g, ' ');
const qtyTxt = q => String(q).replace('.', ',');

// ---------- estado ----------
const S = { basket: null, catalog: null, promos: null, idx: new Map(), searchIdx: null, view: 'lista', dealSeg: 'lista', cat: '', shown: 40 };
let ST = load();
function defaults() {
  return { list: null, checked: {}, settings: { stores: { coto: true, carrefour: true, jumbo: true, cepro: true }, stop: 8000, max2: true, fresh: false }, iosHint: false };
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.settings) return Object.assign(defaults(), s, { settings: Object.assign(defaults().settings, s.settings) }); } catch (e) { }
  return defaults();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { } }
function seedList() { return (S.basket ? S.basket.items : []).map(i => ({ t: 'g', id: i.id, qty: i.qty })); }

// ---------- datos ----------
async function getJSON(url) { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); }
async function boot() {
  route();
  try { S.basket = await getJSON('data/basket.json'); } catch (e) { S.basket = null; }
  if (!ST.list) { ST.list = seedList(); save(); }
  renderAll();
  try { S.promos = await getJSON('data/promos.json'); } catch (e) { S.promos = null; }
  try {
    S.catalog = await getJSON('data/catalog.json');
    for (const p of S.catalog.products || []) S.idx.set(p.i, p);
  } catch (e) { S.catalog = null; }
  S.searchIdx = null;
  renderAll();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
}
function stamp() {
  const at = (S.catalog && S.catalog.at) || (S.basket && S.basket.at);
  if (!at) { $('stamp').textContent = 'Sin datos todavía'; return; }
  const d = new Date(at);
  $('stamp').innerHTML = 'Precios del<br>' + d.toLocaleString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' });
}

// ---------- precios ----------
const genItem = id => S.basket && S.basket.items.find(i => i.id === id);
function entryOf(it) {
  // devuelve {name, cat, fresh, prices:{store:{p,l,label,promo,link,prev}}}
  if (it.t === 'g') {
    const g = genItem(it.id); if (!g) return null;
    const prices = {};
    for (const s of STORE_ORDER) {
      const r = S.basket.stores[s] && S.basket.stores[s].prices && S.basket.stores[s].prices[it.id];
      if (r) {
        const prev = S.basket.prev && S.basket.prev.stores[s] && S.basket.prev.stores[s][it.id];
        prices[s] = { p: r[0], l: r[1], label: r[2], promo: r[3] || '', prev: prev && Math.abs(prev[0] - r[0]) / prev[0] >= 0.03 ? prev[0] : null };
      }
    }
    return { name: g.name, cat: g.cat, fresh: FRESH_G.has(g.cat), prices, generic: true };
  }
  const p = S.idx.get(it.i);
  if (!p) return { name: it.n || 'Producto', cat: it.c || 'Otros', fresh: FRESH_P.has(it.c), prices: {}, missing: !!S.catalog };
  const prices = {};
  for (const s of STORE_ORDER) { const r = p.p[s]; if (r) prices[s] = { p: r[0], l: r[1], promo: r[2] || '', link: linkOf(s, r[3], p.n), kg: !!r[4], prev: r[5] || null }; }
  return { name: p.n, brand: p.b, cat: p.c, fresh: FRESH_P.has(p.c), prices, img: imgOf(p), prod: p };
}
function linkOf(s, v, name) {
  const t = S.catalog && S.catalog.link && S.catalog.link[s]; if (!t) return '';
  if (s === 'coto') return t.replace('{}', encodeURIComponent(name));
  return v ? t.replace('{}', v) : '';
}
function imgOf(p) {
  if (!p.m || !S.catalog || !S.catalog.img) return '';
  const i = p.m.indexOf(':'); const s = p.m.slice(0, i), v = p.m.slice(i + 1); const h = S.catalog.img[s]; if (!h) return '';
  if (s === 'coto') return h + v + '.jpg';
  if (s === 'cepro') return h + v;
  return h + v + '-160-160';
}
const enabled = () => STORE_ORDER.filter(s => ST.settings.stores[s]);

// ---------- recomendación ----------
function subsets(arr, max) { const out = []; for (let m = 1; m < (1 << arr.length); m++) { const x = arr.filter((_, i) => m & (1 << i)); if (x.length <= max) out.push(x); } return out; }
function plan(stores, rows) {
  let total = 0, missing = []; const assign = {}; stores.forEach(s => assign[s] = []);
  for (const r of rows) {
    let best = null;
    for (const s of stores) { const x = r.e.prices[s]; if (x && (!best || x.p < best.p)) best = { s, p: x.p }; }
    if (!best) { missing.push(r); continue; }
    total += best.p * r.it.qty; assign[best.s].push({ r, cost: best.p * r.it.qty });
  }
  const used = Object.values(assign).filter(a => a.length).length;
  return { stores, total, assign, missing, used, eff: total + Math.max(0, used - 1) * ST.settings.stop };
}
function rowsForPlan() {
  return (ST.list || []).map(it => ({ it, e: entryOf(it) })).filter(r => r.e && !(r.e.fresh && !ST.settings.fresh));
}
function recommend() {
  const st = enabled(); const rows = rowsForPlan();
  if (!st.length || !rows.length) return { st, rows, best: null };
  const max = ST.settings.max2 ? 2 : st.length;
  const plans = subsets(st, max).map(x => plan(x, rows));
  const byEff = (a, b) => a.missing.length - b.missing.length || a.eff - b.eff;
  const best = plans.slice().sort(byEff)[0];
  const singles = plans.filter(p => p.stores.length === 1).sort(byEff);
  const all = plan(st, rows);
  return { st, rows, best, singles, all };
}

// ---------- vistas ----------
function renderAll() { stamp(); renderList(); renderSettings(); if (S.view === 'buscar') renderSearch(); if (S.view === 'ofertas') renderDeals(); badge(); }
function badge() {
  const n = (ST.list || []).length - Object.keys(ST.checked || {}).filter(k => ST.checked[k]).length;
  $('listBadge').hidden = !n; $('listBadge').textContent = n;
}
const rowKey = it => it.t === 'g' ? 'g:' + it.id : 'p:' + it.i;

function renderVerdict() {
  const v = $('verdict');
  if (!S.basket) { v.innerHTML = '<p class="empty">No pude cargar los precios. Revisá la conexión y volvé a abrir la app.</p>'; return; }
  const R = recommend();
  if (!R.st.length) { v.innerHTML = '<p>Elegí al menos un súper en Ajustes.</p>'; return; }
  if (!R.best) { v.innerHTML = '<p class="empty">Tu lista está vacía. Agregá productos desde Buscar.</p>'; return; }
  const b = R.best; const names = Object.keys(b.assign).filter(s => b.assign[s].length).map(s => STORE_NAMES[s]);
  const one = R.singles[0];
  let line;
  if (b.used <= 1) {
    line = R.all.used > 1 && one && one.missing.length === R.all.missing.length
      ? `Comprá todo en <b>${names[0]}</b>. Dividir te ahorraría ${fmt(one.total - R.all.total)}, pero con las paradas extra no compensa.`
      : `Comprá todo en <b>${names[0] || '—'}</b>.`;
  } else {
    line = one && one.missing.length === b.missing.length
      ? `Conviene dividir entre <b>${names.join(' y ')}</b>: ahorrás ${fmt(one.total - b.total)} frente a hacer todo en ${STORE_NAMES[one.stores[0]]} y, descontando ${fmt((b.used - 1) * ST.settings.stop)} por la parada extra, quedás ${fmt(one.eff - b.eff)} adelante.`
      : `Para cubrir la lista hace falta ir a <b>${names.join(' y ')}</b>.`;
  }
  const cards = [];
  if (one) cards.push(`<div class="opt ${b.used <= 1 ? 'win' : ''}"><span class="lbl">Todo en un lugar</span><span class="big">${fmt(one.total)}</span><span class="sub">${STORE_NAMES[one.stores[0]]}${R.singles[1] ? ' · le sigue ' + STORE_NAMES[R.singles[1].stores[0]] + ' (' + fmt(R.singles[1].total) + ')' : ''}${one.missing.length ? ' · faltan ' + one.missing.length : ''}</span></div>`);
  if (b.used > 1) cards.push(`<div class="opt win"><span class="lbl">Plan recomendado</span><span class="big">${fmt(b.total)}</span><span class="sub">${names.join(' + ')} · con traslado ${fmt(b.eff)}</span></div>`);
  if (R.all.used > 1) cards.push(`<div class="opt"><span class="lbl">Cada cosa donde está más barata</span><span class="big">${fmt(R.all.total)}</span><span class="sub">${R.all.used} lugares · con traslado ${fmt(R.all.eff)}</span></div>`);
  const stops = Object.keys(b.assign).filter(s => b.assign[s].length).map(s => {
    const a = b.assign[s]; const t = a.reduce((x, y) => x + y.cost, 0);
    return `<div class="stop"><h3><span>${STORE_NAMES[s]}</span><span class="num">${fmt(t)}</span></h3><ul>${a.map(x => `<li>${esc(x.r.e.name)}${x.r.it.qty !== 1 ? ' ×' + qtyTxt(x.r.it.qty) : ''}</li>`).join('')}</ul></div>`;
  }).join('');
  const miss = b.missing.length ? `<div class="warnbox">${b.missing.length} producto${b.missing.length > 1 ? 's' : ''} de tu lista no ${b.missing.length > 1 ? 'están' : 'está'} en los súpers elegidos: ${b.missing.slice(0, 4).map(r => esc(r.e.name)).join(', ')}${b.missing.length > 4 ? '…' : ''}</div>` : '';
  const fr = !ST.settings.fresh && (ST.list || []).some(it => { const e = entryOf(it); return e && e.fresh; }) ? '<p class="hint">Sin carnes ni verdulería (se compran en el barrio). Podés sumarlas en Ajustes.</p>' : '';
  v.innerHTML = `<div class="eyebrow">Tu compra sale</div><div class="pricetag"><small>$</small>${Math.round(b.total).toLocaleString('es-AR')}</div><p>${line}</p>${fr}<div class="opts">${cards.join('')}</div>${miss}<details class="stops"><summary>Qué comprar en cada lugar</summary>${stops}</details>`;
}
function renderList() {
  renderVerdict();
  const box = $('listBody'); const list = ST.list || [];
  if (!list.length) { box.innerHTML = '<p class="empty">Todavía no hay nada en tu lista.</p>'; return; }
  const st = enabled(); const groups = {};
  list.forEach((it, i) => { const e = entryOf(it); if (!e) return; (groups[e.cat] = groups[e.cat] || []).push({ it, e, i }); });
  const cats = Object.keys(groups).sort((a, b) => (CAT_ORDER.indexOf(a) + 99) % 99 - (CAT_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
  box.innerHTML = cats.map(c => `<div class="group"><h3><span>${esc(c)}</span><span>${groups[c].length}</span></h3><div class="rows">${groups[c].map(({ it, e, i }) => {
    const ps = st.map(s => [s, e.prices[s]]).filter(x => x[1]).sort((a, b) => a[1].p - b[1].p);
    const k = rowKey(it); const done = !!ST.checked[k];
    let sub;
    if (e.missing) sub = 'Ya no aparece en el catálogo';
    else if (!ps.length) sub = 'No está en los súpers elegidos';
    else {
      const [s, x] = ps[0]; const off = x.l > x.p ? ` <span class="off">-${Math.round((1 - x.p / x.l) * 100)}%</span>` : '';
      sub = `<span class="best">${STORE_NAMES[s]} ${fmt(x.p)}${x.kg ? '/kg' : ''}</span>${off}${ps[1] ? ` · ${STORE_NAMES[ps[1][0]]} ${fmt(ps[1][1].p)}` : ''}${e.fresh && !ST.settings.fresh ? ' · <i>en el barrio</i>' : ''}`;
    }
    return `<div class="row ${done ? 'done' : ''}" data-i="${i}"><input type="checkbox" class="check" ${done ? 'checked' : ''} aria-label="Ya lo tengo: ${esc(e.name)}" data-act="check"><div class="rmain" data-act="open"><div class="rname">${e.generic ? '' : '<span class="kind">Producto</span>'}${esc(e.name)}</div><div class="rsub">${sub}</div></div><div class="qty"><button data-act="dec" aria-label="Uno menos">−</button><span>${qtyTxt(it.qty)}</span><button data-act="inc" aria-label="Uno más">+</button></div></div>`;
  }).join('')}</div></div>`).join('');
}
$('listBody').addEventListener('click', ev => {
  const row = ev.target.closest('.row'); if (!row) return; const i = +row.dataset.i; const it = ST.list[i]; if (!it) return;
  const act = (ev.target.closest('[data-act]') || {}).dataset?.act;
  if (act === 'inc') { it.qty = Math.round((it.qty + (it.qty < 1 ? 0.5 : 1)) * 10) / 10; }
  else if (act === 'dec') {
    const step = it.qty <= 1 ? 0.5 : 1; it.qty = Math.round((it.qty - step) * 10) / 10;
    if (it.qty <= 0) { const e = entryOf(it); ST.list.splice(i, 1); toast(`Saqué ${e ? e.name : 'el producto'} de la lista`, () => { ST.list.splice(i, 0, Object.assign(it, { qty: 1 })); save(); renderAll(); }); }
  }
  else if (act === 'check') { const k = rowKey(it); ST.checked[k] = ev.target.checked; if (!ev.target.checked) delete ST.checked[k]; }
  else if (act === 'open') { openItem(it); return; }
  else return;
  save(); renderList(); badge();
});

// ---------- hoja de detalle ----------
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').hidden = false; $('sheetBg').hidden = false; $('sheetClose').focus(); }
function closeSheet() { $('sheet').hidden = true; $('sheetBg').hidden = true; }
$('sheetClose').onclick = closeSheet; $('sheetBg').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSheet(); stopScan(); } });
function priceRows(e) {
  const st = STORE_ORDER.filter(s => e.prices[s]); if (!st.length) return '<p class="hint">No está en ningún súper relevado.</p>';
  const min = Math.min(...st.filter(s => ST.settings.stores[s]).map(s => e.prices[s].p));
  return st.sort((a, b) => e.prices[a].p - e.prices[b].p).map(s => {
    const x = e.prices[s]; const off = x.l > x.p ? `<span class="strike">${fmt(x.l)}</span> ` : '';
    const ch = x.prev ? (x.p < x.prev ? `<span class="down">▼ ${Math.round((1 - x.p / x.prev) * 100)}%</span> (antes ${fmt(x.prev)})` : `<span class="up">▲ ${Math.round((x.p / x.prev - 1) * 100)}%</span> (antes ${fmt(x.prev)})`) : '';
    const meta = [x.label ? esc(x.label) : '', x.promo ? '🏷 ' + esc(x.promo) : '', ch, x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener">Ver en la web</a>` : '', !ST.settings.stores[s] ? 'No lo tenés activado' : ''].filter(Boolean).join(' · ');
    return `<div class="prow ${x.p === min && ST.settings.stores[s] ? 'best' : ''}"><span class="st">${STORE_NAMES[s]}</span><span>${off}<span class="pp">${fmt(x.p)}${x.kg ? '/kg' : ''}</span></span>${meta ? `<div class="meta">${meta}</div>` : ''}</div>`;
  }).join('');
}
function thumbHtml(src, name, cls = 'thumb') { return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} ph',textContent:'${esc((name || '?')[0])}'}))">` : `<div class="${cls} ph">${esc((name || '?')[0])}</div>`; }
function openItem(it) {
  const e = entryOf(it); if (!e) return;
  const head = e.generic ? `<h2 id="sheetTitle">${esc(e.name)}</h2><p class="hint">Compra mensual: en cada súper, la opción más barata de esa presentación.</p>` : `<div class="hero">${thumbHtml(e.img, e.name)}<div><h2 id="sheetTitle">${esc(e.name)}</h2><div class="hint">${esc(e.brand || '')}</div></div></div>`;
  const i = ST.list.indexOf(it);
  openSheet(`${head}${priceRows(e)}<div class="sheet-actions"><div class="qty"><button data-sa="dec" aria-label="Uno menos">−</button><span id="sq">${qtyTxt(it.qty)}</span><button data-sa="inc" aria-label="Uno más">+</button></div><button class="btn" data-sa="del">Sacar de la lista</button></div>`);
  $('sheetBody').querySelector('.sheet-actions').onclick = ev => {
    const a = (ev.target.closest('[data-sa]') || {}).dataset?.sa; if (!a) return;
    if (a === 'inc') it.qty = Math.round((it.qty + (it.qty < 1 ? 0.5 : 1)) * 10) / 10;
    if (a === 'dec') it.qty = Math.max(0.5, Math.round((it.qty - (it.qty <= 1 ? 0.5 : 1)) * 10) / 10);
    if (a === 'del') { ST.list.splice(ST.list.indexOf(it), 1); save(); closeSheet(); renderAll(); toast('Lo saqué de la lista', () => { ST.list.splice(i, 0, it); save(); renderAll(); }); return; }
    $('sq').textContent = qtyTxt(it.qty); save(); renderList(); badge();
  };
}
function openProduct(p) {
  const it = (ST.list || []).find(x => x.t === 'p' && x.i === p.i);
  if (it) return openItem(it);
  const e = entryOf({ t: 'p', i: p.i });
  openSheet(`<div class="hero">${thumbHtml(e.img, e.name)}<div><h2 id="sheetTitle">${esc(e.name)}</h2><div class="hint">${esc(e.brand || '')}</div></div></div>${priceRows(e)}<div class="sheet-actions"><button class="btn primary" id="addBtn">＋ Agregar a mi lista</button></div>`);
  $('addBtn').onclick = () => { addProduct(p); closeSheet(); };
}
function addProduct(p, qty = 1) {
  const it = (ST.list || []).find(x => x.t === 'p' && x.i === p.i);
  if (it) it.qty += qty; else ST.list.push({ t: 'p', i: p.i, qty, n: p.n, c: p.c });
  save(); badge(); renderList(); if (S.view === 'buscar') renderResults(); toast('Agregado a tu lista');
}

// ---------- buscar ----------
function buildIndex() {
  if (S.searchIdx || !S.catalog) return;
  S.searchIdx = S.catalog.products.map(p => norm(p.n + ' ' + (p.b || '')));
}
function renderSearch() {
  const cats = S.catalog ? [...new Set(S.catalog.products.map(p => p.c))].sort((a, b) => (CAT_ORDER.indexOf(a) + 99) % 99 - (CAT_ORDER.indexOf(b) + 99) % 99) : [];
  $('catChips').innerHTML = ['', ...cats].map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${S.cat === c}">${c ? esc(c) : 'Todo'}</button>`).join('');
  renderResults();
}
$('catChips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; S.shown = 40; renderSearch(); });
let qT; $('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { S.shown = 40; renderResults(); }, 140); });
function search(q) {
  buildIndex(); if (!S.catalog) return [];
  const toks = norm(q).split(/\s+/).filter(Boolean); const st = enabled(); const out = [];
  const P = S.catalog.products;
  for (let k = 0; k < P.length; k++) {
    const p = P[k];
    if (S.cat && p.c !== S.cat) continue;
    if (toks.length && !toks.every(t => S.searchIdx[k].includes(t))) continue;
    if (!st.some(s => p.p[s])) continue;
    out.push(p);
  }
  if (toks.length) {
    const t0 = toks[0];
    out.sort((a, b) => (Object.keys(b.p).length - Object.keys(a.p).length) || (norm(a.n).startsWith(t0) ? -1 : 0) - (norm(b.n).startsWith(t0) ? -1 : 0) || a.n.length - b.n.length);
  }
  return out;
}
function resultHtml(p) {
  const st = enabled(); const ps = st.filter(s => p.p[s]).map(s => [s, p.p[s]]).sort((a, b) => a[1][0] - b[1][0]);
  const inl = (ST.list || []).find(x => x.t === 'p' && x.i === p.i);
  const chips = ps.map(([s, r], j) => `<span class="pchip ${j === 0 && ps.length > 1 ? 'best' : ''}">${STORE_NAMES[s]} <b>${fmt(r[0])}${r[4] ? '/kg' : ''}</b></span>`).join('');
  return `<div class="res" data-i="${esc(p.i)}">${thumbHtml(imgOf(p), p.n)}<div><div class="brandl">${esc(p.b || '')}</div><div class="rname">${esc(p.n)}</div><div class="pchips">${chips}</div><div class="res-foot">${inl ? `<span class="inlist">✓ En tu lista (${qtyTxt(inl.qty)})</span>` : '<span></span>'}<button class="btn small primary" data-add="1">＋ Agregar</button></div></div></div>`;
}
function renderResults() {
  const box = $('results');
  if (!S.catalog || !S.catalog.products || !S.catalog.products.length) { box.innerHTML = '<p class="empty">El catálogo completo aparece después del primer relevamiento automático. Mientras tanto, tu compra mensual ya funciona en la pestaña Lista.</p>'; return; }
  const q = $('q').value.trim();
  if (!q && !S.cat) { box.innerHTML = `<p class="empty">Buscá entre ${S.catalog.products.length.toLocaleString('es-AR')} productos de ${STORE_ORDER.filter(s => S.catalog.stores[s] && S.catalog.stores[s].n).map(s => STORE_NAMES[s]).join(', ')}.<br>También podés escanear el código de barras.</p>`; return; }
  const r = search(q);
  if (!r.length) { box.innerHTML = `<p class="empty">No encontré “${esc(q)}”. Probá con menos palabras.</p>`; return; }
  box.innerHTML = `<p class="hint" style="margin:0 2px 8px">${r.length.toLocaleString('es-AR')} resultado${r.length > 1 ? 's' : ''}</p>` + r.slice(0, S.shown).map(resultHtml).join('') + (r.length > S.shown ? '<button class="btn more" id="moreBtn">Ver más</button>' : '');
}
$('results').addEventListener('click', ev => {
  if (ev.target.id === 'moreBtn') { S.shown += 40; renderResults(); return; }
  const card = ev.target.closest('.res'); if (!card) return; const p = S.idx.get(card.dataset.i); if (!p) return;
  if (ev.target.closest('[data-add]')) { addProduct(p); return; }
  openProduct(p);
});
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

// ---------- escáner ----------
let scanStop = null;
async function startScan() {
  if (!S.catalog || !S.catalog.products.length) { toast('El catálogo todavía no está cargado'); return; }
  $('scanner').hidden = false; $('scanMsg').textContent = 'Apuntá al código de barras del producto';
  const video = $('scanVideo');
  const found = code => {
    const c = String(code).replace(/\D/g, ''); const cand = [c, c.padStart(13, '0'), c.replace(/^0+/, '')];
    const p = cand.map(x => S.idx.get(x)).find(Boolean);
    stopScan();
    if (p) openProduct(p); else toast(`El código ${c} no está en ninguno de los súpers relevados`);
  };
  try {
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = stream; await video.play();
      let alive = true;
      scanStop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); };
      const tick = async () => { if (!alive) return; try { const r = await det.detect(video); if (r.length) return found(r[0].rawValue); } catch (e) { } requestAnimationFrame(tick); };
      tick();
    } else {
      await loadScript('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js');
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) found(res.getText()); });
      scanStop = () => controls.stop();
    }
  } catch (e) {
    stopScan();
    toast(e && e.name === 'NotAllowedError' ? 'Necesito permiso para usar la cámara' : 'No pude abrir la cámara en este teléfono');
  }
}
function stopScan() { if (scanStop) { try { scanStop(); } catch (e) { } scanStop = null; } $('scanner').hidden = true; }
function loadScript(src) { return new Promise((ok, ko) => { if ([...document.scripts].some(s => s.src === src)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s); }); }
$('btnScan').onclick = startScan; $('scanClose').onclick = stopScan;

// ---------- ofertas ----------
$('dealSeg').addEventListener('click', e => { const b = e.target.closest('[data-seg]'); if (!b) return; S.dealSeg = b.dataset.seg; renderDeals(); });
function dealRow(name, s, x, sub, onclick) {
  const pct = x.l > x.p ? Math.round((1 - x.p / x.l) * 100) : 0;
  return `<div class="deal" ${onclick}><div><b>${esc(name)}</b> · ${STORE_NAMES[s]}<div class="w">${sub}</div></div><div class="pr">${fmt(x.p)}${pct ? `<div class="strike">${fmt(x.l)}</div>` : ''}</div></div>`;
}
function renderDeals() {
  document.querySelectorAll('#dealSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.seg === S.dealSeg));
  const box = $('deals'); const st = enabled(); let html = '';
  if (S.dealSeg === 'lista') {
    const rows = [];
    (ST.list || []).forEach((it, i) => { const e = entryOf(it); if (!e) return; for (const s of st) { const x = e.prices[s]; if (!x) continue; if (x.l > x.p || /2do|2da|3x2|2x1|%/i.test(x.promo)) rows.push({ e, s, x, i, save: (x.l - x.p) * it.qty }); } });
    rows.sort((a, b) => b.save - a.save);
    html = rows.length ? `<div class="rows">${rows.slice(0, 40).map(r => dealRow(r.e.name, r.s, r.x, [r.x.label, r.x.promo, r.save > 0 ? 'ahorrás ' + fmt(r.save) + ' en el mes' : ''].filter(Boolean).map(esc).join(' · '), `data-li="${r.i}"`)).join('')}</div>` : '<p class="empty">No hay rebajas en los productos de tu lista en los súpers elegidos.</p>';
  } else if (S.dealSeg === 'bajas') {
    const rows = [];
    (ST.list || []).forEach((it, i) => { const e = entryOf(it); if (!e) return; for (const s of st) { const x = e.prices[s]; if (x && x.prev && x.p < x.prev) rows.push({ name: e.name, s, x, d: x.p / x.prev - 1, attr: `data-li="${i}"`, mine: true }); } });
    const mineP = new Set((ST.list || []).filter(x => x.t === 'p').map(x => x.i));
    if (S.catalog) for (const p of S.catalog.products) for (const s of st) { const r = p.p[s]; if (!mineP.has(p.i) && r && r[5] && r[0] < r[5] && r[5] - r[0] >= 150) rows.push({ name: p.n, s, x: { p: r[0], l: r[1] }, d: r[0] / r[5] - 1, prev: r[5], attr: `data-pi="${esc(p.i)}"` }); }
    rows.sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0) || a.d - b.d);
    const prevDate = S.basket && S.basket.prev && S.basket.prev.date;
    html = rows.length ? `<p class="hint" style="margin:0 2px 8px">Comparado con el relevamiento anterior${prevDate ? ' (' + prevDate.split('-').reverse().join('/') + ')' : ''}. Primero lo de tu lista.</p><div class="rows">${rows.slice(0, 60).map(r => `<div class="deal" ${r.attr}><div><b>${esc(r.name)}</b> · ${STORE_NAMES[r.s]}<div class="w">${r.mine ? 'En tu lista · ' : ''}antes ${fmt(r.prev || r.x.prev)}</div></div><div class="pr">${fmt(r.x.p)}<div class="down">▼ ${Math.round(-r.d * 100)}%</div></div></div>`).join('')}</div>` : '<p class="empty">Todavía no hay bajas para mostrar. Aparecen desde el segundo relevamiento.</p>';
  } else if (S.dealSeg === 'todas') {
    const rows = [];
    if (S.catalog) for (const p of S.catalog.products) for (const s of st) { const r = p.p[s]; if (r && r[1] > r[0] && r[1] - r[0] >= 200) { const pct = 1 - r[0] / r[1]; if (pct >= 0.15 && pct <= 0.8) rows.push({ p, s, r, pct }); } }
    rows.sort((a, b) => b.pct - a.pct);
    html = rows.length ? `<p class="hint" style="margin:0 2px 8px">Rebajas de 15% o más publicadas hoy en las webs.</p><div class="rows">${rows.slice(0, 80).map(x => dealRow(x.p.n, x.s, { p: x.r[0], l: x.r[1] }, `-${Math.round(x.pct * 100)}%${x.r[2] ? ' · ' + esc(x.r[2]) : ''}`, `data-pi="${esc(x.p.i)}"`)).join('')}</div>` : '<p class="empty">Las ofertas del catálogo completo aparecen después del primer relevamiento automático.</p>';
  } else {
    const P = S.promos;
    html = P && P.items ? `<p class="hint" style="margin:0 2px 8px">${esc(P.note || '')}</p><div class="rows">${P.items.filter(x => !x.store || ST.settings.stores[x.store]).map(x => `<div class="bank"><div class="d">${esc(x.day)}</div><div><b>${esc(STORE_NAMES[x.store] || x.store)}</b> · ${esc(x.with)}</div><div class="w">${esc(x.discount)}</div></div>`).join('')}</div>${P.source ? `<p class="hint">Fuente: <a href="${esc(P.source.url)}" target="_blank" rel="noopener">${esc(P.source.name)}</a></p>` : ''}` : '<p class="empty">No pude cargar los descuentos bancarios.</p>';
  }
  box.innerHTML = html;
}
$('deals').addEventListener('click', ev => {
  const d = ev.target.closest('.deal'); if (!d) return;
  if (d.dataset.li != null) { const it = ST.list[+d.dataset.li]; if (it) openItem(it); }
  else if (d.dataset.pi) { const p = S.idx.get(d.dataset.pi); if (p) openProduct(p); }
});

// ---------- ajustes ----------
function renderSettings() {
  $('storeChips').innerHTML = STORE_ORDER.map(s => `<label class="chip"><input type="checkbox" data-st="${s}" ${ST.settings.stores[s] ? 'checked' : ''}>${STORE_NAMES[s]}</label>`).join('');
  $('stopCost').value = ST.settings.stop; $('stopCostVal').textContent = fmt(ST.settings.stop);
  $('max2').checked = ST.settings.max2; $('fresh').checked = ST.settings.fresh;
  const rows = STORE_ORDER.map(s => {
    const c = S.catalog && S.catalog.stores && S.catalog.stores[s]; const b = S.basket && S.basket.stores && S.basket.stores[s];
    const nb = b && b.prices ? Object.keys(b.prices).length : 0;
    const when = x => x && x.at ? new Date(x.at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' }) : '—';
    const ok = (c && c.ok) || (b && b.ok);
    return `<div class="stat"><span><b>${STORE_NAMES[s]}</b><br><span class="hint">${c && c.n ? c.n.toLocaleString('es-AR') + ' productos' : 'catálogo pendiente'} · compra mensual ${nb}/52</span></span><span class="${ok ? 'ok' : 'bad'}">${ok ? 'Al día' : (c || b) && (c && c.at || b && b.at) ? 'Del ' + when(c && c.at ? c : b) : 'Sin datos'}</span></div>`;
  }).join('');
  $('dataStatus').innerHTML = rows + `<p class="hint">Se actualiza solo todos los días a la mañana.</p>`;
  renderInstall();
}
$('storeChips').addEventListener('change', e => { const s = e.target.dataset.st; if (!s) return; ST.settings.stores[s] = e.target.checked; save(); renderAll(); });
$('stopCost').addEventListener('input', e => { ST.settings.stop = +e.target.value; $('stopCostVal').textContent = fmt(ST.settings.stop); save(); renderVerdict(); });
$('max2').addEventListener('change', e => { ST.settings.max2 = e.target.checked; save(); renderVerdict(); });
$('fresh').addEventListener('change', e => { ST.settings.fresh = e.target.checked; save(); renderList(); });
$('btnReset').onclick = () => { if (!confirm('¿Volver a la compra mensual de 52 productos? Se borra lo que agregaste.')) return; ST.list = seedList(); ST.checked = {}; save(); renderAll(); toast('Lista restablecida'); };
$('btnUncheck').onclick = () => { ST.checked = {}; save(); renderAll(); toast('Listo, todo desmarcado'); };

// instalación
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; renderInstall(); });
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function renderInstall() {
  const c = $('installCard'); if (isStandalone()) { c.hidden = true; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (deferredPrompt) { c.hidden = false; c.innerHTML = '<h2>Instalar la app</h2><p class="hint">Queda con su ícono en la pantalla de inicio y se abre como cualquier app.</p><button class="btn primary" id="instBtn">Instalar Changuito</button>'; $('instBtn').onclick = async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; renderInstall(); }; }
  else if (ios) { c.hidden = false; c.innerHTML = '<h2>Instalar la app</h2><p class="hint">En Safari tocá <b>Compartir</b> (el cuadrado con la flecha) y después <b>Agregar a inicio</b>.</p>'; }
  else { c.hidden = false; c.innerHTML = '<h2>Instalar la app</h2><p class="hint">En Chrome abrí el menú ⋮ y tocá <b>Agregar a la pantalla principal</b> o <b>Instalar app</b>.</p>'; }
}

// compartir
$('btnShare').onclick = async () => {
  const R = recommend(); let txt = 'Lista del súper (Changuito Rosario)\n';
  if (R.best) {
    for (const s of Object.keys(R.best.assign).filter(s => R.best.assign[s].length)) {
      txt += `\n${STORE_NAMES[s].toUpperCase()}\n` + R.best.assign[s].map(x => `- ${x.r.e.name}${x.r.it.qty !== 1 ? ' x' + qtyTxt(x.r.it.qty) : ''}`).join('\n') + '\n';
    }
    const fr = (ST.list || []).map(it => ({ it, e: entryOf(it) })).filter(r => r.e && r.e.fresh && !ST.settings.fresh);
    if (fr.length) txt += '\nBARRIO (carnicería y verdulería)\n' + fr.map(r => `- ${r.e.name}${r.it.qty !== 1 ? ' x' + qtyTxt(r.it.qty) : ''}`).join('\n') + '\n';
    txt += `\nTotal estimado en súper: ${fmt(R.best.total)}`;
  }
  try { if (navigator.share) { await navigator.share({ title: 'Lista del súper', text: txt }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(txt); toast('Lista copiada: pegala en WhatsApp'); } catch (e) { toast('No pude compartir desde este navegador'); }
};

// ---------- navegación ----------
function route() {
  const v = (location.hash || '#lista').slice(1); S.view = ['lista', 'buscar', 'ofertas', 'ajustes'].includes(v) ? v : 'lista';
  for (const x of ['lista', 'buscar', 'ofertas', 'ajustes']) $('v-' + x).hidden = x !== S.view;
  document.querySelectorAll('.tabbar a').forEach(a => { if (a.dataset.tab === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (S.view === 'buscar') { renderSearch(); }
  if (S.view === 'ofertas') renderDeals();
  if (S.view === 'ajustes') renderSettings();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { closeSheet(); route(); });
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { location.hash = b.dataset.go; setTimeout(() => $('q').focus(), 50); });

// ---------- aviso ----------
let toastT;
function toast(msg, undo) {
  const t = $('toast'); t.innerHTML = esc(msg) + (undo ? ' <button class="btn small" id="undoBtn" style="margin-left:8px">Deshacer</button>' : ''); t.hidden = false;
  if (undo) $('undoBtn').onclick = () => { undo(); t.hidden = true; };
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, undo ? 5000 : 2600);
}

boot();
