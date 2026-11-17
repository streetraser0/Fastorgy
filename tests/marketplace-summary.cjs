const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/marketplace-summary.js', 'utf8');
const NOW = Date.parse('2026-11-14T12:00:00Z'), RealDate = Date;
const liveLot = (id, extra = {}) => ({ id, name: 'Лот ' + id, status: 'live', price: 1000, ends: new Date(NOW + 3600000).toISOString(), ...extra });
function boot(options = {}) {
 let time = NOW, profile = options.profile === undefined ? 'alice' : options.profile, lots = options.lots || [], failStorage = !!options.failStorage;
 const records = { ...(options.records || {}) }, events = {}, timers = new Map();
 let nextTimer = 1, writes = 0, reads = 0, html = '', observer;
 const mount = { setAttribute() {}, get innerHTML() { return html; }, set innerHTML(v) { html = v; writes++; }, getBoundingClientRect() { return { top: 2000, bottom: 2500 }; } };
 const document = { hidden: false, getElementById: id => id === 'marketplace-summary' ? mount : null, addEventListener(type, fn) { events[type] = fn; } };
 const context = { console, Date: class extends RealDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }, JSON: options.json || JSON, Number, String, Object, Array, Map, Set, BigInt, Intl, Blob, document,
  localStorage: { getItem(key) { reads++; if (failStorage) throw Error('storage denied'); return records[key] ?? null; }, setItem(key, value) { if (failStorage) throw Error('quota'); records[key] = value; } },
  IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
  setTimeout(fn, wait) { const id = nextTimer++; timers.set(id, { fn, wait }); return id; }, clearTimeout(id) { timers.delete(id); }, addEventListener(type, fn) { events[type] = fn; } };
 context.window = context; vm.createContext(context); vm.runInContext(source, context);
 const api = context.FasMarketplaceSummary;
 api.configure({ getLots: () => lots, getProfileId: () => profile, isLive: lot => lot.status === 'live' && Date.parse(lot.ends) > time && (!lot.startsAt || Date.parse(lot.startsAt) <= time) && Number.isSafeInteger(lot.price) && lot.price > 0 });
 return { api, records, document, timers, mount, events, setLots(value) { lots = value; }, setProfile(value) { profile = value; }, failStorage(value) { failStorage = value; }, advance(ms) { time += ms; }, visible(value = true) { observer([{ target: mount, isIntersecting: value }]); }, flushShortTimers() { for (const [id, value] of [...timers]) if (value.wait <= 500) { timers.delete(id); value.fn(); } }, reads: () => reads, writes: () => writes, html: () => html };
}
{
 let inventoryReads = 0;
 const lots = new Proxy(Array.from({ length: 52870 }, (_, i) => liveLot(i + 1)), { get(target, key, receiver) { if (/^\d+$/.test(String(key))) inventoryReads++; return Reflect.get(target, key, receiver); } });
 const h = boot({ lots });
 assert.equal(h.api.state().activated, false); assert.equal(h.api.state().scans, 0); assert.equal(inventoryReads, 0); assert.equal(h.reads(), 0, 'lazy placeholder reads neither catalogue nor local storage');
 assert.match(h.html(), /Демостатистика на этом устройстве/); assert.match(h.html(), /Сводка загрузится/); assert(!h.html().includes('<dd>0</dd>'), 'placeholder does not invent zero metrics');
 for (let i = 0; i < 100; i++) h.api.invalidate(); assert.equal(h.timers.size, 0, 'offscreen invalidation queues no catalogue work');
 h.visible(); assert.equal(h.api.state().data.activeLots, 52870); const reads = inventoryReads, scans = h.api.state().scans;
 for (let i = 0; i < 100; i++) h.api.refresh(); assert.equal(h.api.state().scans, scans); assert.equal(inventoryReads, reads, 'unchanged refresh does not walk 52k lots');
 h.visible(false); for (let i = 0; i < 100; i++) h.api.invalidate(); assert.equal(h.timers.size, 0, 'leaving viewport cancels the boundary timer and defers work');
}
{
 const at = new Date(NOW - 1000).toISOString(), max = Number.MAX_SAFE_INTEGER;
 const saved = [liveLot(1, { sellerOwnerId: 'alice' }), liveLot(2, { sellerOwnerId: 'alice', status: 'cancelled' }), liveLot(3, { sellerOwnerId: 'alice', status: 'draft' }), liveLot(4, { sellerOwnerId: 'bob' }), liveLot(5, { status: 'sold', soldPrice: max, soldAt: at }), liveLot(6, { status: 'sold', soldPrice: max, soldAt: at })];
 const history = { version: 1, events: [{ lotId: 5, kind: 'demo-purchase', source: 'explicit-demo-purchase', amount: max, at }, { lotId: 7, kind: 'demo-purchase', source: 'explicit-demo-purchase', amount: 1, at }, { lotId: 8, kind: 'market-quote', source: 'accepted-market-update', amount: 999999, at }] };
 const h = boot({ lots: [...saved, liveLot(9, { ends: new Date(NOW - 1).toISOString() })], records: { 'fas-lots': JSON.stringify(saved), 'fas-auction-history-v1': JSON.stringify(history) } });
 h.visible(); const data = h.api.state().data;
 assert.equal(data.activeLots, 2); assert.equal(data.addedByYou, 2, 'published withdrawals count as previously added, drafts and other owners do not');
 assert.equal(data.soldLots, 3, 'a sold lot and its explicit purchase event count once'); assert.equal(data.soldAmount, String(BigInt(max) * 2n + 1n), 'totals remain exact beyond Number.MAX_SAFE_INTEGER');
 assert.equal(data.scope, 'device-demo'); assert.equal(data.realPaymentConfirmation, false); assert.match(h.html(), /Это не общая статистика платформы/); assert.match(h.html(), /не подтверждают реальные сделки или оплату/);
 const baselineRaw = h.records['fas-marketplace-baseline-v1:alice']; assert(baselineRaw); assert.equal(data.baseline.createdNow, true); assert.equal(data.baseline.count, 2);
 const next = [...saved, liveLot(10, { sellerOwnerId: 'alice' })]; h.records['fas-lots'] = JSON.stringify(next); h.setLots(next); h.api.invalidate(); h.flushShortTimers();
 const changed = h.api.state().data; assert.equal(changed.addedByYou, 3); assert.equal(changed.baseline.count, 2); assert.equal(changed.baseline.current, 3); assert.equal(h.records['fas-marketplace-baseline-v1:alice'], baselineRaw, 'baseline is stable across new publications'); assert.match(h.html(), /при первом просмотре 2 · сейчас 3/);
 h.setProfile('bob'); h.api.invalidate(); h.flushShortTimers(); assert.equal(h.api.state().data.addedByYou, 1); assert.equal(h.api.state().data.baseline.count, 1, 'a new profile never receives another owner baseline');
}
{
 for (const records of [{ 'fas-lots': '{broken' }, { 'fas-auction-history-v1': '{broken' }]) {
  const h = boot({ lots: [liveLot(1)], records }); h.visible(); assert.equal(h.api.state().data.activeLots, 1); assert.equal(h.api.state().data.soldLots, null); assert.equal(h.api.state().data.soldAmount, null); assert.match(h.html(), /итог продаж не показан/);
 }
 const denied = boot({ lots: [liveLot(1)], failStorage: true }); denied.visible(); assert.equal(denied.api.state().data.activeLots, 1); assert.equal(denied.api.state().data.addedByYou, null); assert.equal(denied.api.state().data.soldLots, null); assert.equal(denied.api.state().data.baseline.available, false);
 const key = 'fas-marketplace-baseline-v1:alice', invalid = JSON.stringify({ version: 1, owner: 'alice', at: new Date(NOW - 1).toISOString(), ids: [1, 1] }), corrupt = boot({ records: { [key]: invalid } }); corrupt.visible(); assert.equal(corrupt.api.state().data.baseline.available, false); assert.equal(corrupt.records[key], invalid, 'invalid history is not replaced with an invented baseline');
 const noProfile = boot({ profile: null }); noProfile.visible(); assert.equal(noProfile.api.state().data.addedByYou, null); assert.equal(noProfile.api.state().data.soldLots, 0, 'empty durable history is a genuine zero');
 const at = new Date(NOW - 1000).toISOString(), conflict = boot({ records: { 'fas-lots': JSON.stringify([liveLot(1, { status: 'sold', soldAt: at, soldPrice: 1000 })]), 'fas-auction-history-v1': JSON.stringify({ version: 1, events: [{ lotId: 1, kind: 'demo-purchase', source: 'explicit-demo-purchase', at, amount: 2000 }] }) } }); conflict.visible(); assert.equal(conflict.api.state().data.conflictingSale, true); assert.equal(conflict.api.state().data.soldLots, null, 'conflicting amounts never become a reported volume');
}
{
 const h = boot({ lots: [liveLot(1, { ends: new Date(NOW + 1000).toISOString() }), liveLot(2, { startsAt: new Date(NOW + 2000).toISOString() })] }); h.visible(); assert.equal(h.api.state().data.activeLots, 1); assert.equal(h.timers.size, 1);
 h.advance(1001); h.visible(false); h.visible(true); assert.equal(h.api.state().data.activeLots, 0, 'revisiting after expiry crosses the cached time boundary');
 h.advance(1000); const pending = [...h.timers].find(([, t]) => t.wait > 500); assert(pending); h.timers.delete(pending[0]); pending[1].fn(); h.flushShortTimers(); assert.equal(h.api.state().data.activeLots, 1, 'one boundary wakeup observes scheduled activation without 1s polling');
 h.document.hidden = true; h.events.visibilitychange(); assert.equal(h.timers.size, 0, 'hidden page cancels boundary timer'); h.api.invalidate(); assert.equal(h.timers.size, 0);
}
{
 let parses = 0;
 const json = { stringify: JSON.stringify, parse(value) { parses++; return JSON.parse(value); } };
 const h = boot({ lots: [liveLot(1)], records: { 'fas-lots': '[]', 'fas-auction-history-v1': '{"version":1,"events":[]}' }, json });
 h.visible(); const before = parses;
 for (let i = 0; i < 100; i++) h.api.refresh();
 assert.equal(parses, before, 'unchanged refresh reuses the bounded raw JSON parse cache as well as the inventory result');
 h.records['fas-lots'] = '{broken'; h.api.refresh(); assert.equal(h.api.state().data.soldLots, null);
 const broken = parses; for (let i = 0; i < 20; i++) h.api.refresh(); assert.equal(parses, broken, 'unchanged invalid bytes are not reparsed on every scroll');
 h.records['fas-lots'] = '[]'; h.api.refresh(); assert.equal(h.api.state().data.soldLots, 0, 'changed source bytes invalidate a previously failed parse');
}
// Real publication calls the central committed-inventory invalidator and changes the lazy block.
(async () => {
 const { boot: catalogueBoot, raw } = require('./helpers/category-seller-harness.cjs');
 const h = catalogueBoot({ fixtureInventory: [] }); vm.runInContext(source, h.context);
 const api = h.context.window.FasMarketplaceSummary; api.activate(); assert.equal(api.state().data.addedByYou, 0);
 h.context.window.FasSellerUI.openEditor('draft-initial'); h.setRaw({ ...raw, name: 'Реальный обработчик тестовой публикации' }); await h.publish();
 assert.equal(h.run('cars.length'), 1); assert.equal(api.state().dirty, true, 'actual durable seller publication invalidates summary through central hook');
 api.refresh(); assert.equal(api.state().data.addedByYou, 1); assert.equal(api.state().data.activeLots, 1); assert.equal(api.state().data.baseline.count, 0); assert.equal(api.state().data.baseline.current, 1);
 const css = fs.readFileSync('dist/marketplace-summary.css', 'utf8'); assert.match(css, /min-height:285px/); assert.match(css, /min-height:390px/);
 console.log('PASS: honest lazy local demo counters, exact BigInt sales with durable-event dedupe/conflict handling, owner-scoped captured baselines, safe corrupt/unavailable data, cached 52k inventory, time-boundary refresh and actual committed-publication invalidation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
