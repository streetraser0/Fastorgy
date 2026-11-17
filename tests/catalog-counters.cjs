const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dist/marketplace-summary.js', 'utf8');
const NOW = Date.parse('2026-11-15T12:00:00Z'), RealDate = Date;
const lot = (id, extra = {}) => ({ id, status: 'live', price: 1000, ends: new Date(NOW + 3600000).toISOString(), ...extra });
function boot(options = {}) {
 let time = NOW, inventory = options.lots || [], observer, mutation, scans = 0, requests = 0, reads = 0;
 const records = { ...(options.records || {}) }, events = {}, timers = new Map();
 let nextTimer = 0;
 const element = () => ({ innerHTML: '', textContent: '', attributes: {}, classList: { add() {} }, setAttribute(key, value) { this.attributes[key] = value; }, getBoundingClientRect() { return { top: 3000, bottom: 3300 }; } });
 const summary = element(), visitor = element(), toolbar = element(); visitor.textContent = options.clients ?? '—';
 toolbar.children = []; toolbar.appendChild = node => toolbar.children.push(node);
 const nodes = { 'marketplace-summary': summary, 'site-user-count': visitor };
 const document = { hidden: false, createElement: element, querySelector: selector => selector === '.discovery-catalog>.toolbar' ? toolbar : null, getElementById: id => nodes[id] || null, addEventListener(type, fn) { events[type] = fn; } };
 const context = {
  console, Date: class extends RealDate { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }, JSON, Intl, BigInt, Blob, document,
  localStorage: { getItem(key) { reads++; return records[key] ?? null; }, setItem(key, value) { records[key] = value; } },
  IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
  MutationObserver: class { constructor(fn) { mutation = fn; } observe(target, config) { assert.equal(target, visitor); assert.equal(config.characterData, true); } },
  addEventListener(type, fn) { events[type] = fn; }, setTimeout(fn, wait) { const id = ++nextTimer; timers.set(id, { fn, wait }); return id; }, clearTimeout(id) { timers.delete(id); },
  fetch() { requests++; throw Error('The mirrored toolbar must not fetch'); }
 };
 context.window = context; vm.createContext(context); vm.runInContext(source, context);
 const compact = toolbar.children[0], api = context.FasMarketplaceSummary;
 api.configure({ getLots: () => inventory, getProfileId: () => options.profile ?? null, isLive: row => { scans++; return row.status === 'live' && Date.parse(row.ends) > time; } });
 const flush = () => { for (const [id, timer] of [...timers]) if (timer.wait <= 500) { timers.delete(id); timer.fn(); } };
 const metric = key => compact.innerHTML.match(new RegExp('data-catalog-counter="' + key + '"[^>]*>[\\s\\S]*?<span class="catalog-counter-value">([^<]*)</span>'))?.[1];
 return { api, compact, summary, toolbar, document, records, timers, events, metric, flush,
  visible(node = compact, visible = true) { observer([{ target: node, isIntersecting: visible }]); },
  clients(value) { visitor.textContent = value; mutation([]); }, inventory(value) { inventory = value; api.invalidate(); flush(); }, advance(ms) { time += ms; },
  counts: () => ({ scans, requests, reads })
 };
}
{
 const end = new Date(NOW - 1).toISOString(), at = new Date(NOW - 1000).toISOString();
 const stored = [lot(1, { sellerOwnerId: 'alice' }), lot(2, { sellerOwnerId: 'alice', status: 'sold', soldPrice: 4500, soldAt: at }), lot(3, { sellerOwnerId: 'alice', status: 'draft' }), lot(4, { sellerOwnerId: 'bob' })];
 const h = boot({ clients: '1\u202f234', profile: 'alice', lots: [stored[0], stored[1], lot(5, { ends: end }), lot(5, { ends: end }), lot(6, { status: 'draft', ends: end }), lot(7, { status: 'cancelled', ends: end }), lot(8, { status: 'withdrawn', ends: end }), lot(9, { status: 'closed' }), lot(10, { status: 'scheduled', startsAt: 'invalid', ends: end }), lot(11, { status: 'scheduled', ends: end })], records: { 'fas-lots': JSON.stringify(stored) } });
 assert.equal(h.toolbar.children.length, 1); assert.equal(h.compact.attributes['aria-label'], 'Сводка каталога и посещаемости');
 assert.equal(h.counts().reads, 0); assert.equal(h.counts().scans, 0); assert.equal(h.metric('active'), '—', 'an offscreen placeholder never invents inventory totals');
 h.visible();
 assert.equal(h.metric('clients'), (1234).toLocaleString('ru-RU')); assert.equal(h.metric('active'), '1'); assert.equal(h.metric('sold'), '1'); assert.equal(h.metric('ended'), '3'); assert.equal(h.metric('added'), '2'); assert.match(h.metric('amount'), /4.*500.*₽/);
 assert.match(h.compact.innerHTML, /Лоты и продажи — демоданные/); assert.match(h.compact.innerHTML, /вошедшие на сайт/); assert.match(h.summary.innerHTML, /не подтверждённых покупателей/);
 const scans = h.counts().scans, reads = h.counts().reads;
 h.clients('55'); assert.equal(h.metric('clients'), '55'); assert.equal(h.counts().scans, scans); assert.equal(h.counts().reads, reads, 'a visitor update performs no catalogue/storage scan'); assert.equal(h.counts().requests, 0);
 h.clients('—'); assert.equal(h.metric('clients'), '—', 'a server failure is not shown as zero clients');
 h.clients('<img src=x onerror=alert(1)>'); assert.equal(h.metric('clients'), '—'); assert(!h.compact.innerHTML.includes('<img'));
 h.clients('9999999999999999'); assert.equal(h.metric('clients'), '—', 'unsafe numeric counts are rejected');
 // Either visible surface can drive the one shared result. One leaving view
 // must not pause the other or cause a second catalogue scan.
 h.visible(h.summary); h.visible(h.summary, false); assert.equal(h.api.state().inViewport, true); assert.equal(h.counts().scans, scans);
 h.visible(h.compact, false); assert.equal(h.api.state().inViewport, false); assert.equal(h.timers.size, 0);
 h.clients('77'); assert.equal(h.metric('clients'), '—', 'offscreen DOM stays lazy'); h.visible(); assert.equal(h.metric('clients'), '77'); assert.equal(h.counts().scans, scans);
}
{
 const h = boot({ lots: [lot(1, { ends: new Date(NOW + 1000).toISOString() }), lot(2, { startsAt: new Date(NOW + 3000).toISOString(), status: 'scheduled' })] });
 h.visible(); assert.equal(h.metric('active'), '1'); assert.equal(h.metric('ended'), '0');
 h.advance(1001); const pending = [...h.timers].find(([, value]) => value.wait > 500); assert(pending); h.timers.delete(pending[0]); pending[1].fn(); h.flush();
 assert.equal(h.metric('active'), '0'); assert.equal(h.metric('ended'), '1', 'deadline refresh moves the lot to ended without marking a sale'); assert.equal(h.metric('sold'), '0');
 h.records['fas-lots'] = '{broken'; h.api.invalidate(); h.flush(); assert.equal(h.metric('sold'), '—'); assert.equal(h.metric('amount'), '—'); assert.equal(h.metric('added'), '—'); assert.equal(h.metric('active'), '0');
 h.document.hidden = true; h.events.visibilitychange(); assert.equal(h.timers.size, 0); h.clients('20'); assert.equal(h.metric('clients'), '—');
 h.document.hidden = false; h.events.visibilitychange(); h.flush(); assert.equal(h.metric('clients'), '20'); assert.equal(h.counts().requests, 0);
}
console.log('PASS: six toolbar counters, truthful source labels, duplicate/ended/draft rules, one lazy shared calculation, cached visitor mirroring without requests or rescans, hidden/offscreen suspension and live deadline updates.');
