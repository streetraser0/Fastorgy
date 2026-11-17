const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { profilePlan, MAX_PROFILES } = require('../scripts/diagnostics/model-marketplace-100.cjs');
const { boot } = require('./helpers/category-seller-harness.cjs');

const plans = Array.from({ length: 1000 }, (_, index) => profilePlan(index));
assert.equal(MAX_PROFILES, 1000);
assert.deepEqual(Object.fromEntries(['seller', 'bidder', 'buyer'].map(role => [role, plans.filter(plan => plan.role === role).length])), { seller: 400, bidder: 400, buyer: 200 });
for (const role of ['seller', 'bidder', 'buyer']) {
 const cases = new Set(plans.filter(plan => plan.role === role).map(plan => plan.scenario));
 assert.equal(cases.size, role === 'buyer' ? 5 : 8, role + ' retains its distinct recovery/validation cases');
}
assert.equal(new Set(plans.map(plan => plan.durationMinutes)).size, 8);
assert.equal(new Set(plans.map(plan => plan.location.regionCode)).size, 5);
assert.equal(new Set(plans.map(plan => plan.experience)).size, 4);
assert.throws(() => profilePlan(-1));
assert.throws(() => profilePlan(1000));

// The test dependency is cloned inside each VM, never shared across profiles.
const fixture = { id: 998000001, name: 'Изолированный лот', city: 'Воронеж', regionCode: '36', category: 'cars', subcategory: 'cars', price: 100000, start: 100000, step: 1000, deposit: 0, bids: 0, status: 'live', ends: new Date(Date.now() + 86400000).toISOString() };
const a = boot({ fixtureInventory: [fixture] });
const b = boot({ fixtureInventory: [fixture] });
assert.equal(a.run('cars.length'), 1);
assert.equal(b.run('cars.length'), 1);
a.run('cars[0].price=200000;cars.push({...cars[0],id:998000002});localStorage.setItem("model-only","alice")');
assert.equal(b.run('cars.length'), 1);
assert.equal(b.run('cars[0].price'), 100000);
assert.equal(fixture.price, 100000);
assert.equal(b.records['model-only'], undefined);
assert.equal(b.run('typeof commitDemoBid'), 'function', 'actual auction code remains loaded');
assert.equal(typeof b.context.window.FasSellerUI.openEditor, 'function', 'actual seller handlers remain loaded');

// A real CLI run validates the report contract without running a 1000-model load in unit tests.
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'fas-model-scale-'));
try {
 const reportPath = path.join(folder, 'model.json');
 const runner = path.join(__dirname, '../scripts/diagnostics/model-marketplace-100.cjs');
 const child = spawnSync(process.execPath, ['--expose-gc', runner], { cwd: path.join(__dirname, '..'), env: { ...process.env, MODEL_PROFILES: '1', MODEL_BOOT_MODE: 'isolated-fixtures', MODEL_REPORT: reportPath }, encoding: 'utf8', timeout: 30000 });
 assert.equal(child.status, 0, child.stderr + child.stdout);
 const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
 assert.equal(report.finished, true);
 assert.equal(report.sourceUnchangedDuringRun, true);
 assert.equal(report.totals.completed, 1);
 assert.equal(report.totals.passed, 1);
 assert.equal(report.bootMode, 'isolated-fixtures');
 assert(report.sourceFiles.includes('scripts/diagnostics/model-marketplace-100.cjs'));
 assert(report.sourceFiles.includes('tests/helpers/category-seller-harness.cjs'));
 assert(report.sourceFiles.includes('dist/catalog-data.js'));
 assert(report.profiles[0].watchers['announced-term-locked-before-expiry']);
 assert(report.profiles[0].watchers['bid-owned-lot-withdrawal-blocked']);
 assert(report.resources.maxRssKiB > 0);
 const rejected = spawnSync(process.execPath, [runner], { cwd: path.join(__dirname, '..'), env: { ...process.env, MODEL_PROFILES: '1001', MODEL_REPORT: reportPath }, encoding: 'utf8', timeout: 10000 });
 assert.notEqual(rejected.status, 0);
 assert.match(rejected.stderr, /1 to 1000/);
} finally {
 fs.rmSync(folder, { recursive: true, force: true });
}
console.log('PASS: 1000-model plan keeps 400 sellers/400 bidders/200 buyers, varied cases/regions/durations; fixture VMs and storage remain isolated; actual CLI verifies expanded frozen-source contract and safety bound.');
