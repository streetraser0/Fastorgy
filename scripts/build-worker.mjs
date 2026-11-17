import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(path.join(root, '.openai/hosting.json'), 'utf8'));
if (manifest.static) throw Error('Worker publication requires the reviewed source manifest to omit static.');
if (!manifest.project_id) throw Error('Existing Site identity is required.');
const names = execFileSync('git', ['ls-files', '-z', 'dist'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm' };
function contentSecurityPolicy(bytes) {
  // Match the HTML parser's line-ending and null preprocessing before hashing
  // reviewed inline source. Hashes change automatically with each page build.
  const html = bytes.toString('utf8').replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd'), hashes = new Set();
  const scripts = /<!--[\s\S]*?-->|<script(?=[\t\n\f />])((?:[^"'<>]|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script[\t\n\f ]*>/gi;
  for (const match of html.matchAll(scripts)) {
    if (match[1] === undefined) continue; // HTML comment, not a script element.
    const attributes = [...match[1].matchAll(/(?:^|[\t\n\f ])([^\t\n\f "'<>/=]+)(?:[\t\n\f ]*=[\t\n\f ]*(?:"[^"]*"|'[^']*'|[^\t\n\f >]+))?/g)];
    if (attributes.some(attribute => attribute[1].toLowerCase() === 'src')) continue;
    hashes.add("'sha256-" + createHash('sha256').update(match[2]).digest('base64') + "'");
  }
  return ["script-src 'self'" + (hashes.size ? ' ' + [...hashes].join(' ') : ''), "script-src-attr 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');
}
const assets = {};
for (const name of names) {
  const relative = name.slice('dist/'.length);
  if (!relative || relative.startsWith('server/') || relative.startsWith('.openai/') || relative.startsWith('drizzle/') || relative.endsWith('.map')) continue;
  const bytes = await readFile(path.join(root, name));
  assets['/' + relative] = { data: bytes.toString('base64'), type: MIME[path.extname(relative).toLowerCase()] || 'application/octet-stream', size: bytes.length, etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"', ...(path.extname(relative).toLowerCase() === '.html' ? { csp: contentSecurityPolicy(bytes) } : {}) };
}
if (!assets['/index.html']) throw Error('The existing index.html must be tracked before building.');
const source = await readFile(path.join(root, 'worker/index.js'), 'utf8');
if (!source.includes('/* SITES_STATIC_ASSETS */ {}')) throw Error('Missing deterministic asset marker.');
const built = source.replace('/* SITES_STATIC_ASSETS */ {}', JSON.stringify(assets));
const compressedBytes = gzipSync(built).length;
if (compressedBytes > 10 * 1024 * 1024) throw Error('Worker exceeds the 10 MiB compressed artifact budget.');
await mkdir(path.join(root, 'dist/server'), { recursive: true });
await mkdir(path.join(root, 'dist/.openai'), { recursive: true });
await writeFile(path.join(root, 'dist/server/index.js'), built);
await writeFile(path.join(root, 'dist/.openai/hosting.json'), JSON.stringify(manifest, null, 2) + '\n');
// Match the official @openai/sites-vite-plugin deployment metadata layout.
await rm(path.join(root, 'dist/drizzle'), { recursive: true, force: true });
await cp(path.join(root, 'drizzle'), path.join(root, 'dist/.openai/drizzle'), { recursive: true });
console.log(JSON.stringify({ worker: 'dist/server/index.js', assets: Object.keys(assets).length, sizeBytes: Buffer.byteLength(built), gzipBytes: compressedBytes, migrations: 'dist/.openai/drizzle' }));
