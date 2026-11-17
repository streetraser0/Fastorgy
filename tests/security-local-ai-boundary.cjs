const assert = require('node:assert/strict');
const fs = require('node:fs');

(async () => {
  const pagePolicy = "script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
  const asset = (type, csp) => ({
    type, csp, data: Buffer.from('controlled fixture').toString('base64'),
    size: 18, etag: '"local-ai-boundary"'
  });
  const assets = {
    '/index.html': asset('text/html; charset=utf-8', pagePolicy),
    '/local-ai-worker.js': asset('application/javascript'),
    '/local-ai.js': asset('application/javascript'),
    '/vendor/transformers-2.17.2.min.js': asset('application/javascript')
  };
  const source = fs.readFileSync('worker/index.js', 'utf8')
    .replace('/* SITES_STATIC_ASSETS */ {}', JSON.stringify(assets));
  const worker = (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
  const request = (path, options = {}) => new Request('https://local-ai.example' + path, options);
  const call = (path, options) => worker.fetch(request(path, options), {});

  const response = await call('/local-ai-worker.js');
  assert.equal(response.status, 200);
  const policy = response.headers.get('Content-Security-Policy');
  const directives = new Map(policy.split(';').map(value => value.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(directives.get('script-src'), ["'self'", 'blob:', "'wasm-unsafe-eval'"]);
  assert(!directives.get('script-src').includes("'unsafe-eval'"), 'ordinary JS string evaluation remains forbidden');
  assert.deepEqual(directives.get('worker-src'), ["'none'"], 'the single-thread encoder cannot create nested workers');
  assert.deepEqual(directives.get('connect-src'), ["'self'", 'blob:', 'https://cdn.jsdelivr.net', 'https://huggingface.co', 'https://us.aws.cdn.hf.co']);
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=3600');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');

  const page = await call('/');
  assert.equal(page.headers.get('Content-Security-Policy'), pagePolicy, 'the model does not broaden document policy');
  assert(!pagePolicy.includes('blob:') && !pagePolicy.includes('wasm-unsafe-eval'));
  for (const path of ['/local-ai.js', '/vendor/transformers-2.17.2.min.js']) {
    assert.equal((await call(path)).headers.get('Content-Security-Policy'), null, 'worker-specific policy cannot spread by filename prefix');
  }
  for (const options of [{ method: 'HEAD' }, { headers: { 'If-None-Match': '"local-ai-boundary"' } }]) {
    const result = await call('/local-ai-worker.js', options);
    assert.equal(result.headers.get('Content-Security-Policy'), policy);
    assert.equal((await result.arrayBuffer()).byteLength, 0);
  }
  assert.equal((await call('/api/assistant', { method: 'POST', body: 'not a model provider' })).status, 404,
    'local inference does not open an unauthenticated server model or financial route');
  console.log('PASS: optional encoder WASM permission stays on the dedicated worker, ordinary page policy and private cache are unchanged, remote origins are bounded and no model API is opened.');
})().catch(error => { console.error(error); process.exitCode = 1; });
