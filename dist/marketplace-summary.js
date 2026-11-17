/* A lazy, device-local demo summary. It is not platform revenue or real payment evidence. */
(() => {
 'use strict';
 if (window.FasMarketplaceSummary) return;
 const BASELINE_KEY = 'fas-marketplace-baseline-v1:';
 const MAX_BASELINE_IDS = 10000, MAX_LOTS_BYTES = 8 * 1024 * 1024, MAX_HISTORY_BYTES = 2 * 1024 * 1024;
 const publishedStates = new Set(['live', 'scheduled', 'paused', 'sold', 'cancelled', 'withdrawn', 'ended', 'closed']);
 const record = value => value && typeof value === 'object' && !Array.isArray(value);
 const positive = value => Number.isSafeInteger(value) && value > 0;
 const timestamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
 const read = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
 const parsedArrays = new Map();
 const visibleMounts = new Set();
 let adapter = {}, mount = null, compactMount = null, observer = null, visitorsObserver = null, inViewport = false, activated = false, dirty = true, queued = false;
 let memo = null, result = null, scans = 0, previousMarkup = '', previousCompactMarkup = '', boundaryTimer = null;
 let workspaceRaw, workspaceOwner = null;
 function lots() {
  const value = read(() => adapter.getLots?.() ?? (typeof cars !== 'undefined' ? cars : []), []);
  return Array.isArray(value) ? value : [];
 }
 function profileId() {
  const value = read(() => {
   if (adapter.getProfileId) return adapter.getProfileId();
   const raw = localStorage.getItem('fas-seller-workspace-v1');
   if (raw !== workspaceRaw) {
    workspaceRaw = raw;
    const workspace = read(() => JSON.parse(raw || 'null'), null);
    const id = workspace?.version === 1 ? workspace.profile?.id : null;
    workspaceOwner = typeof id === 'string' && id.trim() && id.length <= 256 ? id : null;
   }
   return workspaceOwner;
  }, null);
  return typeof value === 'string' && value.trim() && value.length <= 256 ? value : null;
 }
 function readArray(key, limit, history = false) {
  try {
   const raw = localStorage.getItem(key), previous = parsedArrays.get(key);
   if (previous && previous.raw === raw) return previous;
   let result;
   if (raw === null || raw === '') result = { ok: true, raw, rows: [] };
   else if (raw.length > limit || typeof Blob === 'function' && new Blob([raw]).size > limit) result = { ok: false, raw, rows: [] };
   else {
    try {
     const value = JSON.parse(raw), rows = history ? value?.version === 1 ? value.events : null : value;
     result = Array.isArray(rows) ? { ok: true, raw, rows } : { ok: false, raw, rows: [] };
    } catch { result = { ok: false, raw, rows: [] }; }
   }
   // Only the two fixed local source keys use this cache. Changed bytes are parsed again.
   parsedArrays.set(key, result);
   return result;
  } catch { return { ok: false, raw: null, rows: [] }; }
 }
 function validBaseline(value, owner, now) {
  return record(value) && value.version === 1 && value.owner === owner && Number.isFinite(timestamp(value.at)) && timestamp(value.at) <= now && Array.isArray(value.ids) && value.ids.length <= MAX_BASELINE_IDS && value.ids.every(positive) && new Set(value.ids).size === value.ids.length;
 }
 function baseline(owner, ids, now) {
  if (!owner || ids === null) return { available: false, reason: owner ? 'storage' : 'profile' };
  if (ids.length > MAX_BASELINE_IDS) return { available: false, reason: 'limit' };
  const key = BASELINE_KEY + encodeURIComponent(owner);
  let raw;
  try { raw = localStorage.getItem(key); } catch { return { available: false, reason: 'storage' }; }
  if (raw !== null) {
   const value = read(() => JSON.parse(raw), null);
   return validBaseline(value, owner, now) ? { available: true, createdNow: false, at: value.at, count: value.ids.length, current: ids.length } : { available: false, reason: 'corrupt' };
  }
  const value = { version: 1, owner, at: new Date(now).toISOString(), ids: [...ids].sort((a, b) => a - b) };
  try {
   localStorage.setItem(key, JSON.stringify(value));
   const saved = JSON.parse(localStorage.getItem(key) || 'null');
   if (!validBaseline(saved, owner, now) || JSON.stringify(saved) !== JSON.stringify(value)) return { available: false, reason: 'storage' };
   return { available: true, createdNow: true, at: saved.at, count: saved.ids.length, current: ids.length };
  } catch { return { available: false, reason: 'storage' }; }
 }
 function calculate(source, stored, history, owner, now) {
  scans++;
  const activeIds = new Set(), endedIds = new Set(), ownIds = new Set(), saleFacts = new Map();
  let conflictingSale = false, nextBoundary = null;
  const addSale = (id, amount, at) => {
   const date = timestamp(at);
   if (!positive(id) || !positive(amount) || !Number.isFinite(date) || date > now || date < 0) return;
   const key = id + '|' + new Date(date).toISOString(), previous = saleFacts.get(key);
   if (previous !== undefined && previous !== amount) conflictingSale = true;
   else saleFacts.set(key, amount);
  };
  for (const lot of source) {
   if (!record(lot) || !positive(lot.id) || activeIds.has(lot.id)) continue;
   for (const value of [lot.startsAt ?? lot.starts, lot.ends]) { const at = timestamp(value); if (Number.isFinite(at) && at > now && (nextBoundary === null || at < nextBoundary)) nextBoundary = at; }
   const live = read(() => adapter.isLive ? adapter.isLive(lot) : typeof isLotLive === 'function' ? isLotLive(lot) : lot.status === 'live' && timestamp(lot.ends) > now && (!lot.startsAt || timestamp(lot.startsAt) <= now) && positive(lot.price), false);
   if (live) activeIds.add(lot.id);
   // An elapsed published auction is ended, not necessarily sold. Drafts and
   // withdrawn/cancelled listings are deliberately excluded from this metric.
   const status = lot.status || 'live', end = timestamp(lot.ends), rawStart = lot.startsAt ?? lot.starts, start = timestamp(rawStart);
   const hasStart = rawStart !== undefined && rawStart !== null && rawStart !== '';
   const validStart = hasStart ? Number.isFinite(start) && start < end : status !== 'scheduled';
   if (live) endedIds.delete(lot.id);
   else if (['sold', 'ended', 'closed'].includes(status) || ['live', 'scheduled', 'paused'].includes(status) && Number.isFinite(end) && end <= now && validStart) endedIds.add(lot.id);
  }
  if (stored.ok) for (const lot of stored.rows) {
   if (!record(lot) || !positive(lot.id)) continue;
   if (owner && lot.sellerOwnerId === owner && publishedStates.has(lot.status)) ownIds.add(lot.id);
   if (lot.status === 'sold') addSale(lot.id, lot.soldPrice, lot.soldAt);
  }
  if (history.ok) for (const event of history.rows) {
   if (record(event) && event.kind === 'demo-purchase' && event.source === 'explicit-demo-purchase') addSale(event.lotId, event.amount, event.at);
  }
  let total = 0n;
  for (const amount of saleFacts.values()) total += BigInt(amount);
  const salesAvailable = stored.ok && history.ok && !conflictingSale;
  const addedIds = stored.ok && owner ? [...ownIds] : null;
  return {
   scope: 'device-demo', realPaymentConfirmation: false, updatedAt: new Date(now).toISOString(), nextBoundary,
   activeLots: activeIds.size, endedLots: endedIds.size, addedByYou: addedIds === null ? null : addedIds.length,
   soldLots: salesAvailable ? saleFacts.size : null, soldAmount: salesAvailable ? String(total) : null,
   baseline: baseline(owner, addedIds, now), storageAvailable: stored.ok && history.ok, conflictingSale
  };
 }
 function formatNumber(value) { return value === null ? '—' : value.toLocaleString('ru-RU'); }
 function formatMoney(value) { return value === null ? '—' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(BigInt(value)); }
 function clients() {
  // Mirror the existing authenticated visitor counter; never start another
  // request or substitute a device-local seller profile for a Site user.
  const raw = String(document.getElementById('site-user-count')?.textContent || '').replace(/[\s\u00a0\u202f]/g, '');
  const count = /^\d{1,16}$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
 }
 function compactHtml(data) {
  const metrics = [
   ['clients', 'Клиенты', formatNumber(clients()), 'вошедшие на сайт', 'Уникальные пользователи, вошедшие на сайт за всё время. Не число покупателей или подтверждённых клиентов.'],
   ['active', 'Лоты', formatNumber(data?.activeLots ?? null), 'активные · демо', 'Активные лоты доступного на этом устройстве каталога, без учёта выбранных фильтров.'],
   ['sold', 'Продано', formatNumber(data?.soldLots ?? null), 'демо · этот браузер', 'Сохранённые демопродажи на этом устройстве. Окончание срока само по себе не означает продажу.'],
   ['amount', 'Сумма продаж', formatMoney(data?.soldAmount ?? null), 'демо · этот браузер', 'Сумма сохранённых демопродаж; реальные платежи не подтверждены.'],
   ['ended', 'Завершено', formatNumber(data?.endedLots ?? null), 'лоты каталога · демо', 'Лоты доступного каталога с истёкшим сроком или статусом продано, завершено, закрыто. Черновики и отменённые лоты не учитываются.'],
   ['added', 'Добавлено лотов', formatNumber(data?.addedByYou ?? null), 'в этом браузере', 'Опубликованные объявления текущего локального профиля за всё время. Черновики исключены.']
  ];
  return '<dl class="catalog-counters-grid">' + metrics.map(([key, label, value, source, description]) => '<div class="catalog-counter" data-catalog-counter="' + key + '" title="' + escape(description) + '"><dt>' + escape(label) + '</dt><dd><span class="catalog-counter-value">' + escape(value) + '</span><span class="catalog-counter-source">' + escape(source) + '</span></dd></div>').join('') + '</dl><p class="catalog-counters-note">Лоты и продажи — демоданные. <a href="#marketplace-summary">Об источниках</a></p>';
 }
 function renderCompact(data) {
  if (!compactMount) return;
  const markup = compactHtml(data);
  if (markup !== previousCompactMarkup) { compactMount.innerHTML = markup; previousCompactMarkup = markup; }
 }
 function html(data) {
  const base = data.baseline, at = new Date(data.updatedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const comparison = base.available ? (base.createdNow ? 'Начало наблюдения: ' + new Date(base.at).toLocaleDateString('ru-RU') + '. Сравнение появится после изменений.' : 'Добавлено лотов: при первом просмотре ' + formatNumber(base.count) + ' · сейчас ' + formatNumber(base.current) + '. Снимок от ' + new Date(base.at).toLocaleDateString('ru-RU') + '.') : base.reason === 'profile' ? 'Число ваших объявлений появится после создания профиля на этом устройстве.' : 'Сравнение недоступно: исходный снимок не подтверждён или не сохранён.';
  const metrics = [['Активных лотов', formatNumber(data.activeLots)], ['Добавлено лотов', formatNumber(data.addedByYou)], ['Демопродаж в истории', formatNumber(data.soldLots)], ['Сумма демопродаж', formatMoney(data.soldAmount)]];
  return '<div class="marketplace-summary-heading"><div><span class="marketplace-summary-kicker">Сводка каталога</span><h2 id="marketplace-summary-title">Демостатистика на этом устройстве</h2></div><button class="marketplace-summary-refresh" type="button" data-marketplace-summary-refresh>Обновить</button></div><dl class="marketplace-summary-grid">' + metrics.map(([label, value]) => '<div><dt>' + escape(label) + '</dt><dd>' + escape(value) + '</dd></div>').join('') + '</dl><p class="marketplace-summary-comparison">' + escape(comparison) + '</p><p class="marketplace-summary-note">Данные этого браузера на ' + escape(at) + '. Демопродажи не подтверждают реальные сделки или оплату. Это не общая статистика платформы.' + (!data.storageAvailable || data.conflictingSale ? ' Часть сохранённых данных недоступна или противоречива; итог продаж не показан.' : '') + '</p><p class="marketplace-summary-note marketplace-summary-sources">В верхней сводке «Завершено» — ' + escape(formatNumber(data.endedLots)) + ': лоты каталога с истёкшим сроком или завершённым статусом, без черновиков и отменённых. «Клиенты» — отдельный серверный счётчик уникальных вошедших на сайт пользователей за всё время, а не подтверждённых покупателей. Если источник недоступен, показано «—».</p>';
 }
 function cancelBoundary() {
  if (boundaryTimer !== null) clearTimeout(boundaryTimer);
  boundaryTimer = null;
 }
 function armBoundary(data) {
  cancelBoundary();
  if (!activated || !inViewport || document.hidden || !Number.isFinite(data?.nextBoundary)) return;
  const wait = Math.min(2147483647, Math.max(1, data.nextBoundary - Date.now() + 1));
  boundaryTimer = setTimeout(() => { boundaryTimer = null; memo = null; schedule(); }, wait);
 }
 function placeholder() {
  return '<div class="marketplace-summary-heading"><div><span class="marketplace-summary-kicker">Сводка каталога</span><h2 id="marketplace-summary-title">Демостатистика на этом устройстве</h2></div></div><dl class="marketplace-summary-grid marketplace-summary-placeholder" aria-hidden="true">' + ['Активных лотов', 'Добавлено лотов', 'Демопродаж в истории', 'Сумма демопродаж'].map(label => '<div><dt>' + label + '</dt><dd>—</dd></div>').join('') + '</dl><p class="marketplace-summary-note">Сводка загрузится при прокрутке к этому блоку. Показатели относятся только к этому устройству.</p>';
 }
 function refresh({ force = false } = {}) {
  if (!activated && !force) { dirty = true; return { ok: false, reason: 'not-visible' }; }
  if (document.hidden) { dirty = true; return { ok: false, reason: 'hidden' }; }
  const now = Date.now(), source = lots(), stored = readArray('fas-lots', MAX_LOTS_BYTES), history = readArray('fas-auction-history-v1', MAX_HISTORY_BYTES, true), owner = profileId();
  if (!force && memo && now >= timestamp(result?.updatedAt) && (!Number.isFinite(result?.nextBoundary) || now < result.nextBoundary) && memo.source === source && memo.length === source.length && memo.stored === stored.raw && memo.history === history.raw && memo.owner === owner && memo.storedOK === stored.ok && memo.historyOK === history.ok) { dirty = false; armBoundary(result); renderCompact(result); return { ok: true, cached: true, data: result }; }
  const data = calculate(source, stored, history, owner, now);
  memo = { source, length: source.length, stored: stored.raw, history: history.raw, owner, storedOK: stored.ok, historyOK: history.ok };
  result = data; dirty = false; armBoundary(data);
  if (mount) { const markup = html(data); if (markup !== previousMarkup) { mount.innerHTML = markup; previousMarkup = markup; } }
  renderCompact(data);
  return { ok: true, cached: false, data };
 }
 function schedule() {
  dirty = true;
  if (!activated || !inViewport || document.hidden || queued) return;
  queued = true;
  const run = () => { queued = false; if (inViewport && !document.hidden && dirty) refresh(); };
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 500 });
  else setTimeout(run, 40);
 }
 function activate() { activated = true; inViewport = true; return refresh(); }
 function checkViewport() {
  inViewport = [mount, compactMount].some(element => { const rect = element?.getBoundingClientRect?.(); return rect && rect.top < (window.innerHeight || 800) + 250 && rect.bottom > -250; });
  if (inViewport) activate(); else cancelBoundary();
 }
 function configure(options = {}) { adapter = { ...adapter, ...options }; memo = null; schedule(); return state(); }
 function state() { return { activated, inViewport, dirty, scans, data: result ? { ...result, baseline: { ...result.baseline } } : null }; }
 function start() {
  mount = document.getElementById('marketplace-summary');
  if (mount) { mount.setAttribute('aria-labelledby', 'marketplace-summary-title'); mount.innerHTML = placeholder(); }
  const toolbar = document.querySelector?.('.discovery-catalog>.toolbar');
  if (typeof toolbar?.appendChild === 'function' && document.createElement) {
   compactMount = document.createElement('section');
   compactMount.id = 'catalog-counters'; compactMount.className = 'catalog-counters';
   compactMount.setAttribute('aria-label', 'Сводка каталога и посещаемости');
   toolbar.appendChild(compactMount); toolbar.classList.add('has-catalog-counters');
   renderCompact(null);
   const visitors = document.getElementById('site-user-count');
   if (visitors && typeof window.MutationObserver === 'function') {
    visitorsObserver = new window.MutationObserver(() => { if (activated && inViewport && !document.hidden) renderCompact(result); });
    visitorsObserver.observe(visitors, { childList: true, characterData: true, subtree: true });
   }
  }
  if (!mount && !compactMount) return;
  if (typeof window.IntersectionObserver === 'function') {
   observer = new window.IntersectionObserver(entries => {
    for (const entry of entries) if (entry.target === mount || entry.target === compactMount) { if (entry.isIntersecting) visibleMounts.add(entry.target); else visibleMounts.delete(entry.target); }
    inViewport = visibleMounts.size > 0;
    if (inViewport) activate(); else cancelBoundary();
   }, { rootMargin: '250px' });
   if (mount) observer.observe(mount);
   if (compactMount) observer.observe(compactMount);
  } else { window.addEventListener?.('scroll', checkViewport, { passive: true }); window.addEventListener?.('resize', checkViewport, { passive: true }); checkViewport(); }
 }
 document.addEventListener?.('click', event => { if (!event.target.closest?.('[data-marketplace-summary-refresh]')) return; event.preventDefault(); refresh({ force: true }); });
 document.addEventListener?.('visibilitychange', () => { if (document.hidden) cancelBoundary(); else if (activated) { memo = null; schedule(); } });
 window.addEventListener?.('pagehide', cancelBoundary);
 window.addEventListener?.('storage', event => { if (['fas-lots', 'fas-auction-history-v1', 'fas-seller-workspace-v1'].includes(event.key) || event.key === null) { memo = null; schedule(); } });
 window.FasMarketplaceSummary = Object.freeze({ configure, refresh, invalidate: schedule, activate, state });
 start();
})();
