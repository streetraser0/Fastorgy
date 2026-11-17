'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const WORKSPACE = 'fas-seller-workspace-v1';
const read = name => fs.readFileSync(path.join(root, 'dist', name), 'utf8');
const NOW = Date.parse('2026-11-14T12:00:00Z');

// Exercise the production profile lookup rather than the optional test adapter.
function summaryBoot({ fallback = false } = {}) {
 let ownerParses = 0, inventoryReads = 0, denied = false, top = 2000;
 const records = {
  [WORKSPACE]: JSON.stringify({ version: 1, profile: { id: 'owner-a' }, drafts: [{ data: { description: 'x'.repeat(400000) } }] }),
  'fas-lots': JSON.stringify([
   { id: 1, status: 'live', sellerOwnerId: 'owner-a' },
   { id: 2, status: 'live', sellerOwnerId: 'owner-b' }
  ])
 };
 const source = new Proxy(Array.from({ length: 52870 }, (_, i) => ({ id: i + 1, status: 'live', price: 1, ends: new Date(NOW + 3600000).toISOString() })), {
  get(target, key, receiver) { if (/^\d+$/.test(String(key))) inventoryReads++; return Reflect.get(target, key, receiver); }
 });
 const events = {}, timers = new Map(); let timerId = 0, intersection;
 const mount = { innerHTML: '', setAttribute() {}, getBoundingClientRect() { return { top, bottom: top + 200 }; } };
 const document = { hidden: false, getElementById: id => id === 'marketplace-summary' ? mount : null, addEventListener(type, callback) { events[type] = callback; } };
 const context = {
  console, Date: class extends Date { static now() { return NOW; } }, Number, String, Object, Array, Map, Set, BigInt, Intl, Blob,
  JSON: { stringify: JSON.stringify, parse(raw) { if (raw === records[WORKSPACE]) ownerParses++; return JSON.parse(raw); } },
  document, innerHeight: 800,
  localStorage: { getItem(key) { if (denied) throw Error('storage denied'); return records[key] ?? null; }, setItem(key, value) { if (denied) throw Error('storage denied'); records[key] = value; } },
  addEventListener(type, callback) { events[type] = callback; },
  setTimeout(callback, wait) { const id = ++timerId; timers.set(id, { callback, wait }); return id; }, clearTimeout(id) { timers.delete(id); }
 };
 if (!fallback) context.IntersectionObserver = class { constructor(callback) { intersection = callback; } observe() {} };
 context.window = context;
 vm.createContext(context); vm.runInContext(read('marketplace-summary.js'), context);
 const api = context.FasMarketplaceSummary;
 api.configure({ getLots: () => source, isLive: lot => lot.status === 'live' });
 return {
  api, records, events,
  visible() { top = 0; fallback ? events.scroll() : intersection([{ target: mount, isIntersecting: true }]); },
  refresh() { fallback ? events.scroll() : api.refresh(); },
  deny(value) { denied = value; },
  parses: () => ownerParses, reads: () => inventoryReads,
  workspaceBytes: () => Buffer.byteLength(records[WORKSPACE])
 };
}
const measurements = {};
for (const fallback of [false, true]) {
 const h = summaryBoot({ fallback });
 assert.equal(h.parses(), 0, 'offscreen startup does not parse the workspace');
 h.visible();
 assert.equal(h.api.state().data.activeLots, 52870);
 assert.equal(h.api.state().data.addedByYou, 1);
 const initial = h.parses(), reads = h.reads(), scans = h.api.state().scans;
 for (let i = 0; i < 100; i++) h.refresh();
 assert.equal(h.parses(), initial, 'unchanged default profile lookup does not reparse a 400KB workspace');
 assert.equal(h.reads(), reads, 'cached refresh retains the inventory scan bound');
 assert.equal(h.api.state().scans, scans);
 measurements[fallback ? 'scrollFallback' : 'observer'] = { workspaceBytes: h.workspaceBytes(), initialWorkspaceParses: initial, extraParsesFor100Refreshes: h.parses() - initial, catalogueScans: scans };
 h.records[WORKSPACE] = JSON.stringify({ version: 1, profile: { id: 'owner-b' } }); h.refresh();
 assert.equal(h.parses(), initial + 1, 'changed bytes are parsed again');
 assert.equal(h.api.state().data.baseline.count, 1);
 assert(h.records['fas-marketplace-baseline-v1:owner-b'], 'a changed owner receives its own baseline');
 h.records[WORKSPACE] = '{invalid-workspace'; h.refresh(); const broken = h.parses();
 assert.equal(h.api.state().data.addedByYou, null);
 for (let i = 0; i < 20; i++) h.refresh();
 assert.equal(h.parses(), broken, 'unchanged malformed bytes do not trigger repeated parsing');
 h.records[WORKSPACE] = JSON.stringify({ version: 1, profile: { id: 'owner-a' } }); h.refresh();
 assert.equal(h.api.state().data.addedByYou, 1);
 h.deny(true); h.refresh(); assert.equal(h.api.state().data.addedByYou, null, 'storage failure never exposes a cached owner');
 h.deny(false); h.refresh(); assert.equal(h.api.state().data.addedByYou, 1, 'same-byte recovery restores the correct owner');
 delete h.records[WORKSPACE]; h.refresh(); assert.equal(h.api.state().data.addedByYou, null);
 h.records[WORKSPACE] = JSON.stringify({ version: 2, profile: { id: 'owner-a' } }); h.refresh(); assert.equal(h.api.state().data.addedByYou, null, 'unsupported workspace schema does not provide an owner');
 h.records[WORKSPACE] = JSON.stringify({ version: 1, profile: { id: { nested: 'invalid owner' } } }); h.refresh(); assert.equal(h.api.state().data.addedByYou, null, 'an invalid profile identifier never becomes an owner');
}

// Use the actual voice parser with a full-size inventory and count public-city reads.
{
 const { setup } = require('./helpers/quickbar-dom.cjs');
 const h = setup({ mobile: true }), c = h.context; let cityReads = 0;
 for (const file of ['geo-data.js', 'catalog-data.js', 'search-intent.js']) vm.runInContext(read(file), c);
 c.cars = Array.from({ length: 52870 }, (_, index) => ({ id: index + 1, regionCode: '36', get city() { cityReads++; return index % 2 ? 'Воронеж' : 'Контрольногородск'; } }));
 c.getRegionCode = lot => lot.regionCode;
 vm.runInContext(read('voice-assistant.js'), c);
 const voice = c.FasVoiceAssistant;
 for (const query of ['Найди красный седан', 'Найди универсал до миллиона', 'Найди айфон 256 гигабайт', 'найди деревообрабатывающий станок', 'find a red pickup']) {
  const result = voice.parse(query); assert.equal(result.action, 'search', query); assert(result.query, 'the property query is preserved');
 }
 assert.equal(cityReads, 0, 'queries with no fallback location phrase do not walk all 52870 lot cities');
 measurements.voice = { lots: c.cars.length, ordinaryQueries: 5, cityReads };
 for (const query of ['Найди автомобиль в Москве', 'Найди машину, в Москве', 'Найди машину В\nМоскве']) {
  const result = voice.parse(query); assert.equal(result.action, 'search'); assert.equal(result.criteria.city, 'Москва', query);
 }
 assert.equal(cityReads, 0, 'the shared location parser still resolves standard cities without an inventory walk');
 for (const phrase of ['в', 'из', 'около', 'рядом с', 'in', 'near', 'around', 'from']) {
  const result = voice.parse('Найди машину ' + phrase + ' Контрольногородск');
  assert.equal(result.action, 'search'); assert.equal(result.criteria.city, 'Контрольногородск', phrase + ' retains the inventory fallback');
 }
 const upper = voice.parse('Найди машину В\nКонтрольногородск'); assert.equal(upper.criteria.city, 'Контрольногородск', 'case and newline retain the fallback');
 assert(cityReads > 0, 'custom-city phrases still consult current inventory');
 c.cars = [{ id: 1, city: 'Другойконтрольногород', regionCode: '77' }];
 const changed = voice.parse('Найди машину в Другойконтрольногород'); assert.equal(changed.criteria.city, 'Другойконтрольногород', 'there is no stale city cache after inventory replacement');
}
// A rejected query must not warm or even enumerate a cold catalogue.
function prepareBoot() {
 const tasks = [], context = { console, Date, Number, String, Object, Array, Map, Set, JSON, performance: { now: () => 0 }, setTimeout(callback) { tasks.push(callback); return tasks.length; }, current: lot => lot.price };
 context.window = context; vm.createContext(context);
 for (const file of ['search-typos.js', 'search-identifiers.js', 'search-intent.js', 'keyword-search.js']) vm.runInContext(read(file), context);
 return { api: context.FasKeywordSearch, tasks, step() { assert(tasks.length); tasks.shift()(); }, finish() { while (tasks.length) tasks.shift()(); } };
}
(async () => {
 const h = prepareBoot(); let rowReads = 0, fieldReads = 0;
 const rows = Array.from({ length: 52870 }, (_, index) => ({ id: index + 1, category: 'cars', price: 1000, get name() { fieldReads++; return 'Автомобиль ' + index; }, get description() { fieldReads++; return 'Обслуживание по регламенту'; } }));
 const inventory = new Proxy(rows, { get(target, key, receiver) { if (/^\d+$/.test(String(key))) rowReads++; return Reflect.get(target, key, receiver); } });
 const invalidQueries = ['автомобиль до 20 тысяч долларов', 'автомобиль от 3 млн до 2 млн', 'квартира от 80 до 40 м²'];
 for (const query of invalidQueries) {
  const compiled = h.api.compile(query); assert(compiled.intent?.error, query + ' is a canonical clarification/error');
  const resultPromise = h.api.prepare(inventory, compiled);
  assert.equal(rowReads, 0, 'invalid queries do not enumerate a cold 52870-lot catalogue');
  assert.equal(fieldReads, 0, 'invalid queries do not build document indexes');
  assert.equal(h.tasks.length, 0, 'invalid queries schedule no indexing chunks');
  const result = await resultPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { cancelled: false, prepared: 0, total: 52870, chunks: 0, maxChunkMs: 0 });
 }
 measurements.invalidPreparation = { lots: rows.length, rejectedQueries: invalidQueries.length, rowReads, indexedFieldReads: fieldReads, scheduledChunks: h.tasks.length };
 let cancelled = false;
 const work = h.api.prepare(inventory, 'обслуживание', { cancelled: () => cancelled });
 assert.equal(rowReads, rows.length, 'a valid query still finds pending documents');
 assert.equal(fieldReads, 0, 'valid document preparation starts after a task boundary');
 h.step(); assert.equal(fieldReads, 200, 'the first valid task indexes 100 names and descriptions');
 cancelled = true; h.finish(); const stopped = await work;
 assert.equal(stopped.cancelled, true); assert.equal(stopped.prepared, 100); assert.equal(fieldReads, 200, 'cancellation preserves the unprocessed catalogue');
 const complete = prepareBoot(), small = rows.slice(0, 251); let progress = 0;
 const validWork = complete.api.prepare(small, 'обслуживание', { onProgress(value) { progress = value.prepared; } });
 complete.finish(); const result = await validWork;
 assert.equal(result.cancelled, false); assert.equal(result.prepared, small.length); assert.equal(result.chunks, 3); assert.equal(progress, small.length);
 assert(complete.api.matches(small[200], 'обслуживание'), 'a successfully prepared valid query still matches its content');
 measurements.validPreparation = { prepared: result.prepared, chunks: result.chunks, cancelledPrepared: stopped.prepared, cancelled: stopped.cancelled };
 console.log('PASS: cached default-profile summary, bounded voice location work, zero cold-catalogue preparation for rejected queries, and preserved valid preparation/cancellation.');
 if (process.env.PERFORMANCE_FOLLOWUP_MEASUREMENTS) fs.writeFileSync(process.env.PERFORMANCE_FOLLOWUP_MEASUREMENTS, JSON.stringify(measurements, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
