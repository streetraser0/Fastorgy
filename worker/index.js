/* Hosted metrics only. Browser-submitted sales are always demo records. */
const STATIC_ASSETS = /* SITES_STATIC_ASSETS */ {};
const MAX_BODY_BYTES = 65536;
const MAX_BATCH = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const MAX_RETAINED_DEMO_SALES = 10000;
const MAX_CATEGORY_GROUPS = 100;
const RATE_WINDOW_MS = 60000;
const RATE_LIMITS = Object.freeze({ metrics: 120, 'sales-read': 60, 'sales-write': 20 });
// Match the sale leaves in category-tree.js, including all eight legacy bases.
const SALE_CATEGORIES = new Set(['cars', 'motorcycles', 'trucks', 'machinery', 'vessels', 'trailers', 'snowmobiles', 'atvs', 'property', 'houses', 'land', 'garages', 'commercial', 'furniture', 'home_appliances', 'kitchenware', 'home_textiles', 'building_materials', 'garden', 'tools', 'phones', 'computers', 'computer_parts', 'audio_video', 'cameras', 'games', 'office_electronics', 'equipment', 'ready_business', 'business_materials', 'other']);
const MAX_INTEGER = Number.MAX_SAFE_INTEGER;
const SAFE_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Strict-Transport-Security': 'max-age=31536000' };

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { ...SAFE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', 'Cross-Origin-Resource-Policy': 'same-origin', Vary: 'Cookie' } });
}
function failure(code, message, status) { return json({ error: code, message }, status); }
function utcYearAgo(timestamp) {
  const now = new Date(timestamp), year = now.getUTCFullYear() - 1, month = now.getUTCMonth();
  const day = Math.min(now.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds())).toISOString();
}
function identity(request) {
  const value = request.headers.get('oai-authenticated-user-id');
  return value && value.trim() && value.length <= 512 ? value.trim() : null;
}
async function hash(value) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function sameOrigin(request) {
  const origin = request.headers.get('Origin'), site = request.headers.get('Sec-Fetch-Site');
  // A sibling origin can send credentialed GETs without Origin. Same-site
  // is not same-origin: reject those before any private database work.
  return (!origin || origin === new URL(request.url).origin) && (!site || site === 'same-origin' || site === 'none');
}
async function readJSON(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw { code: 'content-type', status: 415 };
  const declared = request.headers.get('Content-Length');
  if (declared && Number(declared) > MAX_BODY_BYTES) throw { code: 'body-too-large', status: 413 };
  const reader = request.body?.getReader();
  if (!reader) throw { code: 'invalid-json', status: 400 };
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw { code: 'body-too-large', status: 413 }; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'body-too-large') throw error;
    // A decoding/read failure can occur before the client finishes sending.
    // Stop that producer; cancellation failures must not replace the 400.
    try { await reader.cancel(); } catch {}
    throw { code: 'invalid-json', status: 400 };
  } finally { reader.releaseLock(); }
}
function string(value, maximum, required = false) {
  if (typeof value !== 'string' || value.trim().length > maximum || (required && !value.trim())) return null;
  return value.trim();
}
function optionalCount(value) {
  return value === null || value === undefined ? null : Number.isSafeInteger(value) && value >= 0 && value <= 1000000 ? value : false;
}
function normalizeSale(value, now, since) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const name = string(value.name, 300, true), category = string(value.category, 64, true);
  const categoryLabel = value.categoryLabel === undefined ? category : string(value.categoryLabel, 120, true);
  const region = value.region === undefined ? '' : string(value.region, 120);
  const participantCount = optionalCount(value.participantCount), bidCount = optionalCount(value.bidCount);
  const sold = typeof value.soldAt === 'string' ? Date.parse(value.soldAt) : NaN;
  const method = value.method === undefined ? 'unknown' : value.method;
  if (!Number.isSafeInteger(value.lotId) || value.lotId <= 0 || !Number.isSafeInteger(value.amount) || value.amount <= 0 || value.amount > MAX_INTEGER ||
      !name || !SALE_CATEGORIES.has(category) || !categoryLabel || region === null || participantCount === false || bidCount === false ||
      !Number.isFinite(sold) || sold > now || sold < Date.parse(since) || !['auction', 'buy-now', 'unknown'].includes(method)) return null;
  return { lotId: value.lotId, name, category, categoryLabel, region, amount: value.amount, soldAt: new Date(sold).toISOString(), participantCount, bidCount, method, source: 'demo' };
}
function exactTotal(raw) {
  const value = BigInt(String(raw ?? '0'));
  return value <= BigInt(MAX_INTEGER) ? Number(value) : value.toString();
}
function summary(row = {}) {
  const total = BigInt(String(row.amount_millions ?? '0')) * 1000000n + BigInt(String(row.amount_remainder ?? '0')), count = Number(row.deal_count || 0), known = Number(row.participant_known_deals || 0);
  return { dealCount: count, totalAmount: exactTotal(total), totalAmountExact: total.toString(), averageAmount: count ? Number((total + BigInt(Math.floor(count / 2))) / BigInt(count)) : 0,
    reportedParticipantCount: known ? Number(row.participant_count || 0) : null, participantKnownDeals: known };
}
function saleRow(row) {
  return { id: row.id, lotId: row.lot_id, name: row.name, category: row.category, categoryLabel: row.category_label, region: row.region,
    amount: row.amount, soldAt: row.sold_at, participantCount: row.participant_count ?? null, bidCount: row.bid_count ?? null, method: row.method, source: 'demo' };
}
const SELECT_TOTALS = 'COUNT(*) AS deal_count, CAST(COALESCE(SUM(amount / 1000000), 0) AS TEXT) AS amount_millions, CAST(COALESCE(SUM(amount % 1000000), 0) AS TEXT) AS amount_remainder, SUM(CASE WHEN participant_count IS NOT NULL THEN 1 ELSE 0 END) AS participant_known_deals, COALESCE(SUM(participant_count), 0) AS participant_count';
async function rateLimit(db, userHash, scope, now) {
  const limit = RATE_LIMITS[scope], bucket = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  // One row per authenticated principal/scope. The conditional UPSERT grants a
  // slot atomically across concurrent Workers without a separate read/count.
  const result = await db.prepare('INSERT INTO api_rate_limits (user_hash, scope, bucket_start, request_count) VALUES (?, ?, ?, 1) ON CONFLICT(user_hash, scope) DO UPDATE SET request_count = CASE WHEN api_rate_limits.bucket_start = excluded.bucket_start THEN api_rate_limits.request_count + 1 ELSE 1 END, bucket_start = excluded.bucket_start WHERE api_rate_limits.bucket_start < excluded.bucket_start OR (api_rate_limits.bucket_start = excluded.bucket_start AND api_rate_limits.request_count < ?)').bind(userHash, scope, bucket, limit).run();
  if (result?.success === false) throw Error('Rate limit storage failed.');
  const changes = result?.meta?.changes;
  if (changes === 1) return null;
  if (changes !== 0) throw Error('Rate limit storage did not confirm admission.');
  const response = failure('rate-limit', 'Слишком много запросов. Повторите немного позже.', 429);
  response.headers.set('Retry-After', String(Math.max(1, Math.ceil((bucket + RATE_WINDOW_MS - now) / 1000))));
  return response;
}
async function visits(request, db, userHash, now) {
  const throttled = await rateLimit(db, userHash, 'metrics', now);
  if (throttled) return throttled;
  if (request.method === 'POST') {
    const at = new Date(now).toISOString();
    await db.prepare('INSERT INTO site_users (user_hash, first_seen, last_seen) VALUES (?, ?, ?) ON CONFLICT(user_hash) DO UPDATE SET last_seen = excluded.last_seen').bind(userHash, at, at).run();
  }
  // Keep the total-count fast path and use the timestamp index for online users;
  // SUM(CASE ...) would inspect every historical user on each small request.
  const row = await db.prepare('SELECT (SELECT COUNT(*) FROM site_users) AS total_users, (SELECT COUNT(*) FROM site_users WHERE last_seen >= ?) AS online_users').bind(new Date(now - 300000).toISOString()).first();
  return json({ totalUsers: Number(row?.total_users || 0), onlineUsers: Number(row?.online_users || 0), period: 'all-time', onlineWindowMinutes: 5, serverTime: new Date(now).toISOString() });
}
async function getSales(db, userHash, now, url) {
  const period = url.searchParams.get('period') || 'year', category = url.searchParams.get('category') || '', rawLimit = url.searchParams.get('limit') || String(DEFAULT_LIMIT), rawOffset = url.searchParams.get('offset') || '0';
  const limit = Number(rawLimit), offset = Number(rawOffset);
  if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(offset) || offset < 0 || offset > MAX_INTEGER - limit) return failure('invalid-pagination', 'Некорректная страница истории сделок.', 400);
  if (!['year', '90', '30'].includes(period) || category && !/^[a-z][a-z0-9_]{0,63}$/.test(category)) return failure('invalid-filter', 'Некорректный период или категория статистики.', 400);
  const throttled = await rateLimit(db, userHash, 'sales-read', now);
  if (throttled) return throttled;
  const retentionSince = utcYearAgo(now), since = period === 'year' ? retentionSince : new Date(Math.max(Date.parse(retentionSince), now - Number(period) * 86400000)).toISOString();
  const where = 'user_hash = ? AND sold_at >= ?' + (category ? ' AND category = ?' : ''), parameters = [userHash, since, ...(category ? [category] : [])];
  const results = await db.batch([
    db.prepare('DELETE FROM sale_events WHERE sold_at < ?').bind(retentionSince),
    db.prepare(`SELECT ${SELECT_TOTALS} FROM sale_events WHERE ${where}`).bind(...parameters),
    db.prepare(`SELECT category, MAX(category_label) AS category_label, ${SELECT_TOTALS} FROM sale_events WHERE ${where} GROUP BY category ORDER BY category LIMIT ?`).bind(...parameters, MAX_CATEGORY_GROUPS + 1),
    db.prepare(`SELECT SUBSTR(sold_at, 1, 7) AS month, ${SELECT_TOTALS} FROM sale_events WHERE ${where} GROUP BY SUBSTR(sold_at, 1, 7) ORDER BY month`).bind(...parameters),
    db.prepare(`SELECT id, lot_id, name, category, category_label, region, amount, sold_at, participant_count, bid_count, method FROM sale_events WHERE ${where} ORDER BY sold_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...parameters, limit, offset),
    db.prepare('SELECT category, MAX(category_label) AS category_label FROM sale_events WHERE user_hash = ? AND sold_at >= ? GROUP BY category ORDER BY category LIMIT ?').bind(userHash, retentionSince, MAX_CATEGORY_GROUPS + 1)
  ]);
  const rows = results[4].results || [], months = new Map((results[3].results || []).map(row => [row.month, row]));
  const first = new Date(since), last = new Date(now), monthly = [];
  for (let year = first.getUTCFullYear(), month = first.getUTCMonth(); year < last.getUTCFullYear() || year === last.getUTCFullYear() && month <= last.getUTCMonth();) {
    const key = String(year) + '-' + String(month + 1).padStart(2, '0'), row = months.get(key);
    monthly.push({ month: key, dealCount: Number(row?.deal_count || 0), totalAmount: summary(row).totalAmount });
    if (++month === 12) { month = 0; year++; }
  }
  const categoryRows = results[2].results || [], availableCategoryRows = results[5].results || [];
  const categories = categoryRows.slice(0, MAX_CATEGORY_GROUPS).map(row => ({ category: row.category, categoryLabel: row.category_label, ...summary(row) }));
  categories.sort((a, b) => BigInt(a.totalAmountExact) === BigInt(b.totalAmountExact) ? a.category.localeCompare(b.category) : BigInt(a.totalAmountExact) > BigInt(b.totalAmountExact) ? -1 : 1);
  return json({ source: 'demo', retention: '12-calendar-months', period, category, since, retentionSince, until: new Date(now).toISOString(), summary: summary(results[1].results?.[0]),
    availableCategories: availableCategoryRows.slice(0, MAX_CATEGORY_GROUPS).map(row => ({ category: row.category, categoryLabel: row.category_label })), categories, monthly,
    categoryGroupsLimit: MAX_CATEGORY_GROUPS, categoryGroupsTruncated: categoryRows.length > MAX_CATEGORY_GROUPS, availableCategoriesTruncated: availableCategoryRows.length > MAX_CATEGORY_GROUPS,
    records: rows.map(saleRow), total: Number(results[1].results?.[0]?.deal_count || 0), limit, offset, nextOffset: offset + rows.length < Number(results[1].results?.[0]?.deal_count || 0) ? offset + rows.length : null, truncated: offset + rows.length < Number(results[1].results?.[0]?.deal_count || 0) });
}
async function postSales(request, db, userHash, now) {
  const payload = await readJSON(request);
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.records) || !payload.records.length || payload.records.length > MAX_BATCH) return failure('invalid-records', 'Передайте от 1 до 50 корректных записей демосделок.', 422);
  const since = utcYearAgo(now), rows = payload.records.map(value => normalizeSale(value, now, since));
  if (rows.some(row => !row)) return failure('invalid-records', 'Проверьте номер лота, сумму, дату и параметры демосделки.', 422);
  const throttled = await rateLimit(db, userHash, 'sales-write', now);
  if (throttled) return throttled;
  const at = new Date(now).toISOString(), statements = [db.prepare('DELETE FROM sale_events WHERE sold_at < ?').bind(since)];
  const ids = await Promise.all(rows.map(row => hash('fas-demo-sale:v1:' + userHash + ':' + row.lotId + ':' + row.soldAt)));
  for (const [index, row] of rows.entries()) {
    // SQLite evaluates the budget in the insertion statement, inside D1's
    // transactional batch. Concurrent requests cannot race a separate count.
    // CASE avoids recounting history for replays; the inner LIMIT bounds work
    // even when a pre-existing legacy history is already over the budget.
    statements.push(db.prepare('INSERT INTO sale_events (id, user_hash, lot_id, name, category, category_label, region, amount, sold_at, participant_count, bid_count, method, source, recorded_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE CASE WHEN EXISTS (SELECT 1 FROM sale_events WHERE user_hash = ? AND lot_id = ? AND sold_at = ?) THEN 0 ELSE (SELECT COUNT(*) FROM (SELECT 1 FROM sale_events WHERE user_hash = ? AND sold_at >= ? LIMIT ?)) < ? END ON CONFLICT(user_hash, lot_id, sold_at) DO NOTHING')
      .bind(ids[index], userHash, row.lotId, row.name, row.category, row.categoryLabel, row.region, row.amount, row.soldAt, row.participantCount, row.bidCount, row.method, 'demo', at, userHash, row.lotId, row.soldAt, userHash, since, MAX_RETAINED_DEMO_SALES, MAX_RETAINED_DEMO_SALES));
  }
  statements.push(db.prepare('SELECT id FROM sale_events WHERE user_hash = ? AND id IN (' + ids.map(() => '?').join(', ') + ')').bind(userHash, ...ids));
  const results = await db.batch(statements), accepted = results.slice(1, -1).reduce((total, item) => total + Number(item.meta?.changes || 0), 0);
  const present = new Set((results.at(-1).results || []).map(row => row.id)), stored = ids.filter(id => present.has(id)).length, duplicates = stored - accepted, rejected = rows.length - stored;
  if (rejected) return json({ error: 'demo-history-limit', message: 'В истории сохраняется до 10 000 демосделок за год. Новые записи сверх лимита не сохранены; уже сохранённые сделки доступны.', accepted, duplicates, rejected, retainedLimit: MAX_RETAINED_DEMO_SALES, source: 'demo' }, 409);
  return json({ accepted, duplicates, source: 'demo' }, 200);
}
function matchesEntityTag(value, current) {
  if (typeof value !== 'string' || typeof current !== 'string') return false;
  value = value.replace(/^[\t ]+|[\t ]+$/g, '');
  if (value === '*') return true;
  const expected = current.startsWith('W/') ? current.slice(2) : current;
  let index = 0, matched = false;
  while (index < value.length) {
    while (value[index] === ' ' || value[index] === '\t') index++;
    if (value.slice(index, index + 2) === 'W/') index += 2;
    if (value[index] !== '"') return false;
    const start = index++;
    while (index < value.length && value[index] !== '"') {
      const code = value.charCodeAt(index++);
      if (code < 0x21 || code === 0x7f || code > 0xff) return false;
    }
    if (value[index] !== '"') return false;
    if (value.slice(start, ++index) === expected) matched = true;
    while (value[index] === ' ' || value[index] === '\t') index++;
    if (index === value.length) return matched;
    if (value[index++] !== ',' || index === value.length) return false;
  }
  return false;
}
function decodeAsset(value) {
  const binary = atob(value), bytes = new Uint8Array(binary.length);
  // A plain loop avoids a JS callback and iterator allocation for every byte.
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function staticResponse(request, url) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { ...SAFE_HEADERS, Allow: 'GET, HEAD' } });
  const path = url.pathname === '/' ? '/index.html' : url.pathname, asset = STATIC_ASSETS[path];
  if (!asset) return new Response('Not found', { status: 404, headers: { ...SAFE_HEADERS, 'Cache-Control': 'no-store' } });
  const cache = path.endsWith('.html') ? 'no-store, private' : path === '/sw.js' ? 'no-cache, private' : 'private, max-age=3600';
  const headers = { ...SAFE_HEADERS, 'Content-Type': asset.type, 'Content-Length': String(asset.size), 'Cache-Control': cache, ETag: asset.etag };
  // The optional local model runs in a dedicated worker. Its verified WASM
  // needs this permission; ordinary pages and scripts keep their existing CSP.
  if (path === '/local-ai-worker.js') headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self' blob: https://cdn.jsdelivr.net https://huggingface.co https://us.aws.cdn.hf.co; worker-src 'none'; object-src 'none'; base-uri 'none'";
  if (/^text\/html(?:;|$)/i.test(asset.type)) headers['Content-Security-Policy'] = asset.csp || "script-src 'self'; script-src-attr 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
  if (matchesEntityTag(request.headers.get('If-None-Match'), asset.etag)) return new Response(null, { status: 304, headers });
  const body = request.method === 'HEAD' ? null : decodeAsset(asset.data);
  return new Response(body, { status: 200, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return staticResponse(request, url);
    if (!['/api/metrics/visit', '/api/analytics/sales'].includes(url.pathname)) return failure('not-found', 'API не найден.', 404);
    if (!['GET', 'POST'].includes(request.method)) return failure('method-not-allowed', 'Метод не поддерживается.', 405);
    const user = identity(request);
    if (!user) return failure('authentication-required', 'Войдите на сайт, чтобы использовать серверную статистику.', 401);
    // Cross-origin reads also trigger database work and must not become a
    // credentialed resource that another page can repeatedly embed or fetch.
    if (!sameOrigin(request)) return failure('cross-origin', 'Запрос должен поступить с этого сайта.', 403);
    if (!env?.DB?.prepare || !env.DB.batch) return failure('storage-unavailable', 'Серверное хранилище статистики пока не подключено.', 503);
    try {
      const now = Date.now(), userHash = await hash('fas-site-user:v1:' + user);
      return url.pathname === '/api/metrics/visit' ? await visits(request, env.DB, userHash, now) : request.method === 'POST' ? await postSales(request, env.DB, userHash, now) : await getSales(env.DB, userHash, now, url);
    } catch (error) {
      if (error?.code && Number.isInteger(error.status)) return failure(error.code, error.code === 'body-too-large' ? 'Запрос слишком большой.' : 'Некорректный JSON-запрос.', error.status);
      return failure('storage-unavailable', 'Не удалось получить серверную статистику. Попробуйте позже.', 503);
    }
  }
};
