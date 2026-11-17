const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'fas-csp-test-'));
const origin = 'https://audit.example.test';
const fallbackPolicy = "script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
const hash = value => "'sha256-" + createHash('sha256').update(value).digest('base64') + "'";
const parser = String.raw`import base64,hashlib,json,sys
from html.parser import HTMLParser
class Scripts(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=False);self.active=False;self.source='';self.hashes=[];self.external=[];self.events=[]
 def handle_starttag(self,tag,attrs):
  self.events.extend(name for name,value in attrs if name.startswith('on'))
  if tag!='script':return
  urls=[value for name,value in attrs if name=='src']
  self.active=not urls;self.source=''
  self.external.extend(urls)
 def handle_data(self,data):
  if self.active:self.source+=data
 def handle_endtag(self,tag):
  if tag=='script' and self.active:
   self.hashes.append("'sha256-"+base64.b64encode(hashlib.sha256(self.source.encode()).digest()).decode()+"'")
   self.active=False
text=open(sys.argv[1],encoding='utf8',newline=None).read().replace('\x00','\ufffd')
value=Scripts();value.feed(text);value.close()
print(json.dumps({'hashes':value.hashes,'external':value.external,'events':value.events}))`;
function run(command, args, options = {}) {
 return cp.execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, ...options });
}
function inspectHTML(filename) { return JSON.parse(run('python', ['-c', parser, filename])) }
function directives(policy) { return new Map(policy.split(';').map(value => value.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources])) }
function checkPolicy(policy, expectedHashes) {
 const parsed = directives(policy);
 assert.deepEqual([...parsed.keys()], ['script-src', 'script-src-attr', 'object-src', 'base-uri', 'form-action']);
 assert.deepEqual(new Set(parsed.get('script-src')), new Set(["'self'", ...expectedHashes]));
 assert.deepEqual(parsed.get('script-src-attr'), ["'none'"]);
 assert.deepEqual(parsed.get('object-src'), ["'none'"]);
 assert.deepEqual(parsed.get('base-uri'), ["'self'"]);
 assert.deepEqual(parsed.get('form-action'), ["'self'"]);
 assert(!policy.includes("'unsafe-inline'") && !policy.includes("'unsafe-eval'") && !policy.includes("'unsafe-hashes'"));
 assert(!parsed.get('script-src').includes(hash('globalThis.unreviewedInline = true;')), 'unreviewed inline source is absent from the hash allowlist');
}
async function importWorker(source) { return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default }

(async () => {
 for (const directory of ['scripts', 'worker', 'dist', '.openai']) fs.mkdirSync(path.join(temporary, directory), { recursive: true });
 fs.copyFileSync(path.join(root, 'scripts/build-worker.mjs'), path.join(temporary, 'scripts/build-worker.mjs'));
 fs.copyFileSync(path.join(root, 'worker/index.js'), path.join(temporary, 'worker/index.js'));
 fs.cpSync(path.join(root, 'drizzle'), path.join(temporary, 'drizzle'), { recursive: true });
 fs.writeFileSync(path.join(temporary, '.openai/hosting.json'), JSON.stringify({ project_id: 'local-csp-fixture', d1: 'DB' }));
 const indexFile = path.join(temporary, 'dist/index.html');
 const actualHTML = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8').replace(/\r\n?/g, '\n');
 // Browsers normalize both CRLF and CR before exposing script source to CSP.
 fs.writeFileSync(indexFile, actualHTML.replace(/\n/g, '\r\n'));
 fs.copyFileSync(path.join(root, 'dist/privacy.html'), path.join(temporary, 'dist/privacy.html'));
 fs.writeFileSync(path.join(temporary, 'dist/app.js'), 'globalThis.staticFixture = true;');
 run('git', ['init', '-q'], { cwd: temporary });
 run('git', ['add', 'dist/index.html', 'dist/privacy.html', 'dist/app.js'], { cwd: temporary });
 const build = async () => {
  run(process.execPath, ['scripts/build-worker.mjs'], { cwd: temporary });
  return importWorker(fs.readFileSync(path.join(temporary, 'dist/server/index.js'), 'utf8'));
 };
 const expected = inspectHTML(indexFile);
 assert.equal(expected.hashes.length, 3, 'the reviewed index has exactly three inline scripts: loading reserve, catalogue and auction notifications');
 const loadingSource=actualHTML.match(/<script data-featured-loading-init>([\s\S]*?)<\/script>/)?.[1];
 assert(loadingSource&&expected.hashes.includes(hash(loadingSource)), 'the reviewed loading reserve is covered by its own exact CSP hash');
 assert(expected.external.length > 0);
 assert(expected.external.every(src => new URL(src, origin).origin === origin), 'current external scripts are all allowed by self');
 assert.deepEqual(expected.events, [], 'the reviewed index uses programmatic event listeners');
 let worker = await build();
 let response = await worker.fetch(new Request(origin + '/'), {});
 assert.equal(response.status, 200);
 const policy = response.headers.get('Content-Security-Policy'), etag = response.headers.get('ETag');
 checkPolicy(policy, expected.hashes);
 assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
 assert.equal(await response.text(), actualHTML.replace(/\n/g, '\r\n'), 'policy hashing never rewrites the served document');
 for (const options of [{ method: 'HEAD' }, { headers: { 'If-None-Match': etag } }]) {
  response = await worker.fetch(new Request(origin + '/', options), {});
  assert.equal(response.status, options.method ? 200 : 304);
  assert.equal(response.headers.get('Content-Security-Policy'), policy);
  assert.equal(await response.text(), '');
 }
 response = await worker.fetch(new Request(origin + '/privacy.html'), {});
 checkPolicy(response.headers.get('Content-Security-Policy'), inspectHTML(path.join(temporary, 'dist/privacy.html')).hashes);
 assert.equal((await worker.fetch(new Request(origin + '/app.js'), {})).headers.get('Content-Security-Policy'), null);
 response = await worker.fetch(new Request(origin + '/api/analytics/sales'), {});
 assert.equal(response.status, 401);
 assert.equal(response.headers.get('Content-Security-Policy'), null);
 assert.equal(response.headers.get('Cache-Control'), 'no-store, private');

 const opening = actualHTML.indexOf('<script>');
 assert(opening >= 0);
 const originalHash = hash(actualHTML.slice(opening + 8, actualHTML.indexOf('</script>', opening + 8)));
 const changedIndex = expected.hashes.indexOf(originalHash);assert(changedIndex >= 0, 'the catalogue source has its own reviewed hash');
 fs.writeFileSync(indexFile, actualHTML.slice(0, opening + 8) + '\n/* Rehash this changed reviewed script. */\n' + actualHTML.slice(opening + 8));
 const changed = inspectHTML(indexFile);
 assert.equal(changed.hashes.length, expected.hashes.length);
 for(let index=0;index<expected.hashes.length;index++){
  if(index===changedIndex)assert.notEqual(changed.hashes[index],expected.hashes[index]);
  else assert.equal(changed.hashes[index],expected.hashes[index], 'other reviewed scripts keep their exact hashes');
 }
 worker = await build();
 response = await worker.fetch(new Request(origin + '/'), {});
 checkPolicy(response.headers.get('Content-Security-Policy'), changed.hashes);
 assert(!response.headers.get('Content-Security-Policy').includes(originalHash), 'rebuilding removes the previous inline hash');
 assert.notEqual(response.headers.get('ETag'), etag);

 // Quoted opener values, raw character references, comments, and lone CRs are
 // checked against an independent HTML parser rather than the build extractor.
 fs.writeFileSync(indexFile, '<!doctype html><!-- <script>notAnElement()</script> --><script data-note="src=fake > literal">\rglobalThis.raw = "&amp;";\r\n</script><script src="/app.js">ignoredFallback()</script><button onclick="unreviewedEvent()">Fixture</button>');
 const special = inspectHTML(indexFile);
 assert.equal(special.hashes.length, 1);
 worker = await build();
 response = await worker.fetch(new Request(origin + '/'), {});
 checkPolicy(response.headers.get('Content-Security-Policy'), special.hashes);
 assert(!response.headers.get('Content-Security-Policy').includes(hash('unreviewedEvent()')), 'event handlers are not admitted as script hashes');

 const source = fs.readFileSync(path.join(root, 'worker/index.js'), 'utf8');
 const bytes = Buffer.from('<!doctype html><script>unannotatedFixture()</script>');
 const assets = { '/index.html': { data: bytes.toString('base64'), type: 'text/html; charset=utf-8', size: bytes.length, etag: '"fallback"' } };
 worker = await importWorker(source.replace('/* SITES_STATIC_ASSETS */ {}', JSON.stringify(assets)));
 response = await worker.fetch(new Request(origin + '/'), {});
 assert.equal(response.headers.get('Content-Security-Policy'), fallbackPolicy, 'unannotated HTML fixtures fail closed to self scripts');
 console.log('PASS: per-page inline script hashes, current self scripts, HTML line endings, independent parser agreement, changed-source rebuilds, HEAD/304 policy, explicit attribute restrictions and safe HTML fallback.');
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(temporary, { recursive: true, force: true }));
