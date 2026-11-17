const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fas-server-resource-test-'));
const databaseFile = path.join(temporary, 'db.sqlite');
const runner = String.raw`import json,sqlite3,sys
db=sqlite3.connect(sys.argv[1],timeout=15);db.row_factory=sqlite3.Row
result=[]
try:
 db.execute('BEGIN IMMEDIATE')
 for item in json.load(open(sys.argv[2])):
  before=db.total_changes
  cursor=db.execute(item['sql'],item.get('values',[]))
  result.append({'results':[dict(row) for row in cursor.fetchall()] if cursor.description else [],'meta':{'changes':db.total_changes-before}})
 db.commit()
except:
 db.rollback();raise
print(json.dumps(result))`;
const seed = String.raw`import sqlite3,sys
db=sqlite3.connect(sys.argv[1])
user,count,kind,at,older=sys.argv[2],int(sys.argv[3]),sys.argv[4],sys.argv[5],sys.argv[6]
db.executemany('INSERT INTO sale_events (id,user_hash,lot_id,name,category,category_label,region,amount,sold_at,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
 [('seed-'+user+'-'+str(i),user,100000+i,'Local audit fixture',('legacy_'+str(i).zfill(3)) if kind=='legacy' else 'cars','x'*120,'',1,older if i==0 and kind=='quota' else at,at) for i in range(count)])
db.commit()`;
let queryCount = 0, batchNumber = 0;
function pythonSync(code, args) {
 return cp.execFileSync('python', ['-c', code, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
}
function python(code, args) {
 return new Promise((resolve, reject) => {
  const child = cp.spawn('python', ['-c', code, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', error = '';
  child.stdout.on('data', value => { output += value });
  child.stderr.on('data', value => { error += value });
  child.on('error', reject);
  child.on('close', status => status === 0 ? resolve(output) : reject(new Error('SQLite fixture failed: ' + error)));
 });
}
const db = {
 prepare(sql) {
  const item = { sql, values: [], bind(...values) { assert(values.length <= 100, 'D1 bound-parameter budget'); item.values = values; return item }, async run() { return (await db.batch([item]))[0] }, async first() { return (await db.batch([item]))[0].results[0] || null } };
  return item;
 },
 async batch(statements) {
  assert(statements.length <= 100, 'D1 statement budget');
  queryCount += statements.length;
  const input = path.join(temporary, 'batch-' + batchNumber++ + '.json');
  fs.writeFileSync(input, JSON.stringify(statements));
  try { return JSON.parse(await python(runner, [databaseFile, input])) }
  finally { fs.unlinkSync(input) }
 }
};
const userHash = user => createHash('sha256').update('fas-site-user:v1:' + user).digest('hex');

(async () => {
 pythonSync('import sqlite3,json,sys;db=sqlite3.connect(sys.argv[1]);journal=json.load(open(sys.argv[2]+"/meta/_journal.json"));[db.executescript(open(sys.argv[2]+"/"+entry["tag"]+".sql").read()) for entry in journal["entries"]];db.commit()', [databaseFile, path.join(root, 'drizzle')]);
 const source = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
 const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
 const realNow = Date.now;
 let now = Date.parse('2026-11-13T12:00:00.000Z');
 Date.now = () => now;
 const at = new Date(now - 1000).toISOString();
 const sale = (id, extra = {}) => ({ lotId: id, name: 'Local audit demo', category: 'cars', categoryLabel: 'Автомобили', amount: 1, soldAt: at, ...extra });
 const call = async (user, records, route = '', headers = {}) => worker.fetch(new Request('https://audit.example.test/api/analytics/sales' + route, {
  method: records ? 'POST' : 'GET', headers: { ...(user === null ? {} : { 'oai-authenticated-user-id': user }), ...(records ? { 'Content-Type': 'application/json' } : {}), ...headers },
  ...(records ? { body: JSON.stringify({ records }) } : {})
 }), { DB: db });
 try {
  for (const [user, headers, status] of [[null, {}, 401], ['viewer', { Origin: 'https://other.example.test' }, 403], ['viewer', { 'Sec-Fetch-Site': 'same-site' }, 403]]) {
   const before = queryCount;
   assert.equal((await call(user, [sale(1)], '', headers)).status, status);
   assert.equal(queryCount, before, 'rejected requests do no quota or storage work');
  }

  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/category-tree.js'), 'utf8'), context);
  const categories = Array.from(context.FasCategories.leaves(), category => category.id);
  assert.equal(categories.length, 31);
  let response = await call('taxonomy', categories.map((category, index) => sale(index + 1, { category })));
  assert.deepEqual(await response.json(), { accepted: 31, duplicates: 0, source: 'demo' }, 'all current sale leaves and legacy bases remain accepted');
  const before = queryCount;
  assert.equal((await call('taxonomy', [sale(40, { category: 'category_000001' })])).status, 422, 'new arbitrary category identifiers cannot amplify group arrays');
  assert.equal(queryCount, before);

  response = await call('quota', [sale(1, { amount: 17 })]);
  assert.equal((await response.json()).accepted, 1);
  pythonSync(seed, [databaseFile, userHash('quota'), '9998', 'quota', new Date(now - 86400000).toISOString(), new Date(now - 364 * 86400000).toISOString()]);
  // Both requests start with one remaining slot. Independent SQLite connections
  // execute the same transactional batches D1 uses, exercising the SQL guard.
  const concurrent = await Promise.all([call('quota', [sale(2), sale(3)]), call('quota', [sale(4), sale(5)])]);
  const outcomes = await Promise.all(concurrent.map(async result => { assert.equal(result.status, 409); return result.json() }));
  assert.equal(outcomes.reduce((sum, result) => sum + result.accepted, 0), 1, 'concurrent inserts cannot exceed the retained budget');
  assert.equal(outcomes.reduce((sum, result) => sum + result.rejected, 0), 3);
  assert(outcomes.every(result => result.error === 'demo-history-limit' && result.retainedLimit === 10000 && result.duplicates === 0));
  response = await call('quota', [sale(1, { amount: 999 })]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: 0, duplicates: 1, source: 'demo' }, 'idempotent replay remains successful at the budget');
  response = await call('quota', [sale(1), sale(6)]);
  assert.equal(response.status, 409);
  const mixed = await response.json();
  assert.equal(mixed.accepted, 0); assert.equal(mixed.duplicates, 1); assert.equal(mixed.rejected, 1);
  assert.equal((await db.prepare('SELECT amount FROM sale_events WHERE user_hash = ? AND lot_id = 1').bind(userHash('quota')).first()).amount, 17, 'replay cannot overwrite existing values');
  response = await call('quota', null, '?limit=1');
  const history = await response.json();
  assert.equal(history.total, 10000); assert.equal(history.records.length, 1);
  assert.equal(history.categoryGroupsTruncated, false); assert.equal(history.availableCategoriesTruncated, false);
  response = await call('other-user', [sale(1)]);
  assert.equal((await response.json()).accepted, 1, 'another authenticated user has an independent budget');

  now += 2 * 86400000;
  response = await call('quota', [sale(7, { soldAt: new Date(now - 1000).toISOString() })]);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).accepted, 1, 'calendar retention frees capacity without deleting retained history');
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM sale_events WHERE user_hash = ?').bind(userHash('quota')).first()).count, 10000);

  pythonSync(seed, [databaseFile, userHash('legacy'), '120', 'legacy', at, at]);
  response = await call('legacy', null, '?limit=1');
  const body = await response.text(), legacy = JSON.parse(body);
  assert.equal(legacy.total, 120); assert.equal(legacy.summary.dealCount, 120);
  assert.equal(legacy.records.length, 1); assert.equal(legacy.categories.length, 100); assert.equal(legacy.availableCategories.length, 100);
  assert.equal(legacy.categoryGroupsLimit, 100); assert.equal(legacy.categoryGroupsTruncated, true); assert.equal(legacy.availableCategoriesTruncated, true);
  assert(Buffer.byteLength(body) < 60000, 'legacy category arrays stay bounded independently of history pagination');
  const filtered = await (await call('legacy', null, '?category=legacy_119')).json();
  assert.equal(filtered.total, 1); assert.equal(filtered.records[0].category, 'legacy_119', 'legacy categories outside the first group page remain filterable');
  assert.equal(filtered.categoryGroupsTruncated, false);
  const allLegacy = await (await call('legacy', null, '?limit=500')).json();
  assert.equal(allLegacy.records.length, 120, 'group bounds do not delete or truncate legacy history');
 } finally { Date.now = realNow }
 console.log('PASS: canonical sale categories, bounded legacy groups, atomic per-user demo retention quota, concurrent near-limit inserts, explicit partial rejection, replay and retention capacity.');
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(temporary, { recursive: true, force: true }));
