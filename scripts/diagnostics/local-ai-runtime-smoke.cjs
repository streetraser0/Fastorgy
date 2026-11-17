#!/usr/bin/env node
'use strict';
/**
 * Optional integration smoke for the pinned browser bundle and actual model files.
 * It runs in a Node VM, not a browser, and does not test CSP or device compatibility.
 *
 * LOCAL_AI_FIXTURE_DIR=/path/to/research-fixtures \
 *   node --experimental-vm-modules scripts/diagnostics/local-ai-runtime-smoke.cjs \
 *   --report /tmp/local-ai-runtime-smoke.json
 *
 * Fixtures are not committed: model/{config.json,tokenizer_config.json,tokenizer.json,
 * onnx/model_quantized.onnx} and node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm.
 * The production worker verifies their exact pinned lengths and SHA-256 hashes.
 * This command makes no network requests and does not read user/site storage.
 */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '../..');
const fixture = process.env.LOCAL_AI_FIXTURE_DIR;
if (!fixture || typeof vm.SourceTextModule !== 'function') {
  console.error('Set LOCAL_AI_FIXTURE_DIR and run Node with --experimental-vm-modules. See this script header for the required pinned fixtures.');
  process.exit(2);
}
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
if (reportIndex >= 0 && !reportPath) throw new Error('--report requires a filename');
const origin = 'https://local-ai-smoke.invalid';
const location = new URL(origin + '/local-ai-worker.js');
const base = 'https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/2c4055b12046f11709e9df2c122e59ffbdc2f900/';
const pinnedFiles = new Map([
  [origin + '/vendor/transformers-2.17.2.min.js', path.join(root, 'dist/vendor/transformers-2.17.2.min.js')],
  [origin + '/local-ai-prototypes.json', path.join(root, 'dist/local-ai-prototypes.json')],
  ['https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/ort-wasm-simd.wasm', path.join(fixture, 'node_modules/onnxruntime-web/dist/ort-wasm-simd.wasm')],
  ...['config.json', 'tokenizer_config.json', 'tokenizer.json', 'onnx/model_quantized.onnx'].map(name => [base + name, path.join(fixture, 'model', name)]),
]);
const requests = [], posted = [], blobs = new Set();
const started = performance.now();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sources = ['dist/local-ai-worker.js', 'dist/local-ai-policy.js', 'dist/local-ai-prototypes.json', 'dist/vendor/transformers-2.17.2.min.js'];
const report = {
  createdUtc: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, runtime: 'Node VM with browser ESM bundle; onnxruntime-web WASM SIMD, one thread' },
  scope: 'Actual production worker, vendor bundle, model integrity verification, startup and one inference; external requests replaced by exact local pinned fixtures.',
  sourceHashes: Object.fromEntries(sources.map(name => [name, sha256(fs.readFileSync(path.join(root, name)))])),
  limitations: [
    'No browser, physical phone or Safari was used.',
    'Does not exercise hosting authentication, HTTP redirects, CORS, browser CSP or download speed.',
    'One inference is startup integration evidence, not accuracy, capacity or security certification.',
    'No external network, user profile, private documents, account storage or monetary action is accessed.',
  ],
};
class SafeURL extends URL {
  static createObjectURL(blob) { const url = URL.createObjectURL(blob); blobs.add(url); return url; }
  static revokeObjectURL(url) { blobs.delete(url); URL.revokeObjectURL(url); }
}
const fixtureFetch = async (input, options = {}) => {
  const url = String(input);
  if ((options.method || 'GET') !== 'GET') throw new Error('Smoke transport accepts GET only.');
  if (blobs.has(url)) return fetch(url, options);
  const file = pinnedFiles.get(url);
  if (!file) throw new Error('Unmapped URL blocked by smoke transport: ' + url);
  const expectedCredentials = new URL(url).origin === origin ? 'same-origin' : 'omit';
  if (options.credentials !== expectedCredentials) throw new Error('Incorrect credential boundary: ' + url);
  requests.push({ url, credentials: options.credentials });
  return new Response(fs.readFileSync(file), { headers: { 'content-length': String(fs.statSync(file).size) } });
};
const context = vm.createContext({
  console, URL: SafeURL, Blob, fetch: fixtureFetch, Request, Response, Headers,
  crypto: crypto.webcrypto, WebAssembly, Uint8Array, Uint16Array, Uint32Array,
  BigInt64Array, BigUint64Array, Int8Array, Int16Array, Int32Array, Float32Array,
  Float64Array, ArrayBuffer, SharedArrayBuffer, TextEncoder, TextDecoder,
  ReadableStream, performance, setTimeout, clearTimeout, location,
  navigator: { userAgent: 'Node VM integration smoke; not a browser' }, atob, btoa,
  postMessage: data => posted.push(data),
  importScripts() { throw new Error('Unexpected classic worker import.'); },
}, { codeGeneration: { strings: false, wasm: true } });
context.self = context;
async function importPinnedBlob(url) {
  if (!blobs.has(url)) throw new Error('Only a worker-created verified bundle blob may be imported.');
  const source = await (await fetch(url)).text();
  const bundle = new vm.SourceTextModule(source, {
    context, initializeImportMeta(meta) { meta.url = url; }, importModuleDynamically: importPinnedBlob,
  });
  await bundle.link(() => { throw new Error('Unexpected external module import.'); });
  await bundle.evaluate();
  return bundle;
}
(async () => {
  new vm.Script(fs.readFileSync(path.join(root, 'dist/local-ai-policy.js'), 'utf8')).runInContext(context);
  const original = fs.readFileSync(path.join(root, 'dist/local-ai-worker.js'), 'utf8');
  const policyImport = "import './local-ai-policy.js';";
  if (original.split(policyImport).length !== 2) throw new Error('Unexpected production policy import.');
  const worker = new vm.SourceTextModule(original.replace(policyImport, ''), {
    context, initializeImportMeta(meta) { meta.url = location.href; }, importModuleDynamically: importPinnedBlob,
  });
  await worker.link(() => { throw new Error('Unexpected production worker static import.'); });
  await worker.evaluate();
  await context.onmessage({ data: { type: 'load', generation: 1 } });
  if (!posted.some(data => data.type === 'ready') || posted.some(data => data.type === 'error')) throw new Error('Actual model worker did not reach ready.');
  report.loadSeconds = +(performance.now() - started).toFixed(3) / 1000;
  const query = 'Где мой профиль?';
  await context.onmessage({ data: { type: 'ask', generation: 1, id: 1, text: query } });
  const result = posted.findLast(data => data.type === 'result' && data.id === 1);
  if (!result || result.generation !== 1 || JSON.parse(result.raw).intent !== 'cabinet') throw new Error('Expected cabinet intent was not returned.');
  report.inference = { query, expectedIntent: 'cabinet', actualIntent: JSON.parse(result.raw).intent, executedActions: 0 };
  report.artifacts = [...pinnedFiles].map(([url, file]) => ({ url, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)) }));
  report.requests = requests;
  report.success = true;
})().catch(error => { report.success = false; report.error = error.message; process.exitCode = 1; }).finally(() => {
  report.seconds = +(performance.now() - started).toFixed(3) / 1000;
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ success: report.success, inference: report.inference, artifacts: report.artifacts?.length, seconds: report.seconds, report: reportPath, error: report.error }));
  for (const url of blobs) URL.revokeObjectURL(url);
});
