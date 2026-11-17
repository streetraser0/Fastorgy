/* Server-only MAX boundary. Disabled by default; no endpoint, scheduler or real bot is created here. */
'use strict';
const { createHash, randomBytes: secureRandomBytes, timingSafeEqual } = require('node:crypto');
const API_ORIGIN = 'https://platform-api2.max.ru';
const EVENTS = Object.freeze(['outbid', 'newBidOwn', 'endingSoon', 'auctionEnded', 'matchingNew', 'priceDrop', 'accountChanged']);
const COMMANDS = new Set(['/bids', '/lots', '/subscriptions', '/stop', '/help']);
const MAX_MONEY = 9007199254740991n;
class MaxIntegrationError extends Error { constructor(code) { super('MAX integration: ' + code); this.name = 'MaxIntegrationError'; this.code = code; } }
const fail = code => { throw new MaxIntegrationError(code); };
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(value).digest('hex');
function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value)) fail('invalid-id'); return value; }
function maxId(value, signed = false) {
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('unsafe-provider-id'); value = String(value); }
  if (typeof value !== 'string' || !(signed ? /^-?[1-9]\d{0,18}$/ : /^[1-9]\d{0,18}$/).test(value)) fail('invalid-provider-id');
  const number = BigInt(value); if (number > 9223372036854775807n || number < -9223372036854775808n) fail('invalid-provider-id'); return value;
}
function amount(value) { if (value === null) return null; if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,15})$/.test(value) || BigInt(value) > MAX_MONEY) fail('invalid-price'); return value; }
function plain(value, limit = 160) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : ''; }
function origin(value) { try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin; } catch {} fail('invalid-site-origin'); }
function botURL(value) { try { const url = new URL(value); if (url.protocol === 'https:' && url.hostname === 'max.ru' && !url.port && !url.username && !url.password && /^\/[A-Za-z0-9_]{3,100}$/.test(url.pathname) && !url.search && !url.hash) return url.href; } catch {} fail('invalid-bot-url'); }
function preferences(value) {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.events) || value.events.some(event => !EVENTS.includes(event)) || value.events.length > EVENTS.length) fail('invalid-preferences');
  for (const [key, pattern] of [['categories', /^[a-z][a-z0-9_-]{0,63}$/], ['regionCodes', /^\d{2}$/]]) if (!Array.isArray(value[key]) || value[key].length > 128 || value[key].some(entry => typeof entry !== 'string' || !pattern.test(entry))) fail('invalid-preferences');
  const min = amount(value.minPriceKopecks), max = amount(value.maxPriceKopecks);
  if (min !== null && max !== null && BigInt(min) > BigInt(max) || !['instant', 'hourly', 'daily'].includes(value.frequency)) fail('invalid-preferences');
  const quiet = value.quietHours;
  if (!object(quiet) || typeof quiet.enabled !== 'boolean' || typeof quiet.timeZone !== 'string' || quiet.timeZone.length > 100 || ![quiet.startMinute, quiet.endMinute].every(number => Number.isInteger(number) && number >= 0 && number < 1440)) fail('invalid-preferences');
  try { new Intl.DateTimeFormat('en', { timeZone: quiet.timeZone }).format(); } catch { fail('invalid-timezone'); }
  return Object.freeze({ version: 1, events: [...new Set(value.events)], categories: [...new Set(value.categories)], regionCodes: [...new Set(value.regionCodes)], minPriceKopecks: min, maxPriceKopecks: max, frequency: value.frequency, quietHours: { ...quiet } });
}
function quietNow(settings, now) {
  const quiet = settings.quietHours; if (!quiet.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: quiet.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now));
  const minute = Number(parts.find(part => part.type === 'hour').value) * 60 + Number(parts.find(part => part.type === 'minute').value);
  return quiet.startMinute === quiet.endMinute || (quiet.startMinute < quiet.endMinute ? minute >= quiet.startMinute && minute < quiet.endMinute : minute >= quiet.startMinute || minute < quiet.endMinute);
}
function matches(event, settings) {
  if (!settings.events.includes(event.kind)) return false;
  if (!['matchingNew', 'priceDrop'].includes(event.kind)) return true;
  const lot = event.lot; if (!object(lot)) return false;
  if (settings.categories.length && !settings.categories.includes(lot.category) || settings.regionCodes.length && !settings.regionCodes.includes(lot.regionCode)) return false;
  const price = amount(lot.priceKopecks); if (price === null) return false;
  return (settings.minPriceKopecks === null || BigInt(price) >= BigInt(settings.minPriceKopecks)) && (settings.maxPriceKopecks === null || BigInt(price) <= BigInt(settings.maxPriceKopecks));
}
function binding(value, principalId) {
  id(principalId);
  if (!object(value) || value.provider !== 'max' || value.status !== 'active' || value.optedIn !== true || value.principalId !== principalId || !Number.isSafeInteger(value.version) || value.version < 1 || !Number.isSafeInteger(value.activatedAt) || value.activatedAt <= 0) fail('binding-unavailable');
  return { ...value, id: id(value.id), maxUserId: maxId(value.maxUserId), chatId: maxId(value.chatId, true), preferences: preferences(value.preferences) };
}
function eventMessage(event, publicOrigin) {
  const headings = { outbid: 'Вашу ставку перебили', newBidOwn: 'На ваш лот поступила новая ставка', endingSoon: 'Торги скоро закончатся', auctionEnded: 'Торги завершены', matchingNew: 'Новый лот по вашей подписке', priceDrop: 'Цена подходящего лота снизилась', accountChanged: 'В личном кабинете есть изменение' };
  const lines = ['ФАС торги', headings[event.kind]], lot = event.lot; let url = publicOrigin + '/';
  if (object(lot)) {
    if (!Number.isSafeInteger(lot.id) || lot.id <= 0) fail('invalid-lot');
    lines.push('Лот № ' + lot.id);
    if (lot.priceKopecks !== undefined && lot.priceKopecks !== null) { const price = BigInt(amount(lot.priceKopecks)); lines.push((price / 100n).toLocaleString('ru-RU') + ',' + String(price % 100n).padStart(2, '0') + ' ₽'); }
    url += '?lot=' + lot.id;
  }
  return { text: lines.join('\n'), url };
}
function header(headers, name) { if (typeof headers?.get === 'function') return headers.get(name); const key = Object.keys(headers || {}).find(key => key.toLowerCase() === name.toLowerCase()); return key ? headers[key] : null; }
function authenticateWebhook(headers, secret) {
  const received = header(headers, 'X-Max-Bot-Api-Secret');
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) || typeof received !== 'string' || received.length > 256 || !timingSafeEqual(Buffer.from(digest(secret), 'hex'), Buffer.from(digest(received), 'hex'))) fail('webhook-unauthorized');
}
function normalizeUpdate(raw, now) {
  const bytes = typeof raw === 'string' ? Buffer.from(raw) : Buffer.isBuffer(raw) ? raw : null;
  if (!bytes || bytes.length > 65536) fail('invalid-update');
  let update; try { update = JSON.parse(bytes.toString('utf8')); } catch { fail('invalid-update'); }
  if (!object(update) || !Number.isSafeInteger(update.timestamp) || update.timestamp <= 0 || update.timestamp > now + 300000 || update.timestamp < now - 86400000) fail('invalid-update');
  let result;
  if (['bot_started', 'bot_stopped', 'dialog_removed'].includes(update.update_type)) {
    if (update.user?.is_bot !== false) fail('invalid-update');
    result = { kind: update.update_type, maxUserId: maxId(update.user.user_id), chatId: maxId(update.chat_id, true), eventAt: update.timestamp };
    if (update.update_type === 'bot_started') {
      if (update.payload !== undefined && update.payload !== null && (typeof update.payload !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(update.payload))) fail('invalid-link-payload');
      result.nonceHash = update.payload ? digest(update.payload) : null;
    }
  } else if (update.update_type === 'message_created') {
    const message = update.message;
    if (!object(message) || message.sender?.is_bot !== false || message.recipient?.chat_type !== 'dialog' || typeof message.body?.mid !== 'string' || !message.body.mid || message.body.mid.length > 200) fail('invalid-update');
    const candidate = typeof message.body.text === 'string' ? message.body.text.trim() : '';
    result = { kind: 'command', command: COMMANDS.has(candidate) ? candidate : '/help', maxUserId: maxId(message.sender.user_id), chatId: maxId(message.recipient.chat_id, true), eventAt: update.timestamp, messageId: message.body.mid };
  } else return null;
  return Object.freeze({ ...result, eventKey: 'max:' + digest(JSON.stringify(result)) });
}
function createMaxAdapter({ configuration = { state: 'disabled' }, authorizeAccount, repository, transport, clock = Date.now, randomBytes = secureRandomBytes } = {}) {
  const configurationSnapshot = Object.freeze({ ...configuration });
  function ready() {
    if (configurationSnapshot.state !== 'ready' || typeof configurationSnapshot.reviewReference !== 'string' || !configurationSnapshot.reviewReference.trim() || !repository) fail('integration-disabled');
    origin(configurationSnapshot.publicOrigin); botURL(configurationSnapshot.botUrl);
    if (!/^[A-Za-z0-9_-]{32,256}$/.test(configurationSnapshot.webhookSecret || '')) fail('integration-disabled');
  }
  async function storage(method, request) { if (typeof repository[method] !== 'function') fail('repository-unconfigured'); try { return await repository[method](request); } catch { fail('repository-unavailable'); } }
  async function account(context, operation) { ready(); if (typeof authorizeAccount !== 'function') fail('authorization-unavailable'); let grant; try { grant = await authorizeAccount(context, operation); } catch { fail('authorization-unavailable'); } if (grant?.allowed !== true || grant.operation !== operation) fail('forbidden'); return id(grant.principalId); }
  async function beginLink(context) {
    const principalId = await account(context, 'link_max'), bytes = randomBytes(32), now = clock();
    if (!Buffer.isBuffer(bytes) || bytes.length !== 32 || (!Number.isSafeInteger(now) || now <= 0)) fail('invalid-link-entropy');
    const nonce = bytes.toString('base64url'), expiresAt = now + 600000;
    await storage('savePendingLink', { provider: 'max', principalId, nonceHash: digest(nonce), createdAt: now, expiresAt });
    return { url: botURL(configurationSnapshot.botUrl) + '?start=' + nonce, expiresAt, requiresBrowserConfirmation: true };
  }
  async function confirmLink(context, linkId) { const principalId = await account(context, 'confirm_link_max'); binding(await storage('confirmPendingBinding', { provider: 'max', principalId, linkId: id(linkId), now: clock() }), principalId); return { connected: true }; }
  async function handleWebhook({ headers, body }) {
    ready(); authenticateWebhook(headers, configurationSnapshot.webhookSecret); const update = normalizeUpdate(body, clock()); if (!update) return { accepted: true, ignored: true };
    // The host atomically writes an inbox row and applies provisional link/stop rules.
    // It must never activate a new identity without confirmLink in the authenticated website.
    const receipt = await storage('applyInboundUpdate', { provider: 'max', ...update, receivedAt: clock() });
    if (receipt?.durable !== true) fail('inbox-unavailable'); return { accepted: true, queued: true, duplicate: receipt.duplicate === true };
  }
  async function readCommand(eventKey) {
    ready(); id(eventKey);
    const update = await storage('getVerifiedInboundUpdate', { provider: 'max', eventKey });
    if (!object(update) || update.verified !== true || update.eventKey !== eventKey || update.kind !== 'command' || !COMMANDS.has(update.command)) fail('unauthorized-update');
    const command = update.command, identity = { maxUserId: maxId(update.maxUserId), chatId: maxId(update.chatId, true) };
    const raw = await storage('getBindingForMaxIdentity', identity), bound = binding(raw, raw?.principalId);
    if (bound.maxUserId !== identity.maxUserId || bound.chatId !== identity.chatId) fail('binding-unavailable');
    if (update.bindingId !== bound.id || update.bindingVersion !== bound.version || update.eventAt < bound.activatedAt) fail('stale-update');
    if (command === '/stop') { await storage('stopBinding', { provider: 'max', principalId: bound.principalId, bindingId: bound.id, bindingVersion: bound.version, now: clock() }); return { stopped: true }; }
    if (command === '/help') return { maxUserId: bound.maxUserId, text: 'ФАС торги\n/bids — мои ставки\n/lots — мои лоты\n/subscriptions — подписки\n/stop — отключить уведомления', url: origin(configurationSnapshot.publicOrigin) + '/' };
    const kind = { '/bids': 'my_bids', '/lots': 'my_lots', '/subscriptions': 'subscriptions' }[command], view = await storage('getAccountView', { principalId: bound.principalId, kind, limit: 5 });
    if (!object(view) || view.principalId !== bound.principalId || !Number.isSafeInteger(view.count) || view.count < 0) fail('unauthorized-view');
    const text = 'ФАС торги\n' + { my_bids: 'Мои ставки', my_lots: 'Мои лоты', subscriptions: 'Мои подписки' }[kind] + ': ' + view.count + '\nПодробности доступны после входа на сайт.';
    return { maxUserId: bound.maxUserId, text, url: origin(configurationSnapshot.publicOrigin) + '/' };
  }
  async function deliver(eventId, principalId) {
    ready(); id(eventId); id(principalId); if (typeof transport?.send !== 'function') fail('transport-unconfigured');
    const event = await storage('getAuthorizedEvent', { provider: 'max', eventId, principalId });
    if (!object(event) || event.id !== eventId || event.principalId !== principalId || !EVENTS.includes(event.kind)) fail('unauthorized-event');
    const bound = binding(await storage('getBindingByPrincipal', { provider: 'max', principalId }), principalId), settings = bound.preferences, now = clock();
    if (!matches(event, settings)) return { status: 'filtered' };
    const message = eventMessage(event, origin(configurationSnapshot.publicOrigin));
    const minimumIntervalMs = { instant: 500, hourly: 3600000, daily: 86400000 }[settings.frequency];
    const key = 'max:' + digest(JSON.stringify([event.id, bound.id, bound.version]));
    const claim = await storage('claimDelivery', { provider: 'max', key, eventId, principalId, bindingId: bound.id, bindingVersion: bound.version, now, minimumIntervalMs, globalLimitPerSecond: 30 });
    if (!['claimed', 'sent', 'busy', 'unknown', 'deferred', 'cancelled'].includes(claim?.status)) fail('invalid-delivery-claim'); if (claim.status !== 'claimed') return { status: claim.status };
    const leaseId = id(claim.leaseId), context = { key, leaseId, eventId, principalId, bindingId: bound.id, bindingVersion: bound.version, now: clock() };
    if (quietNow(settings, now)) { await storage('deferDelivery', { ...context, reason: 'quiet-hours' }); return { status: 'deferred', reason: 'quiet-hours' }; }
    if (await storage('deliveryStillAllowed', context) !== true) { await storage('cancelDelivery', context); return { status: 'cancelled' }; }
    let result;
    try { result = await transport.send({ userId: bound.maxUserId, ...message }); } catch { result = { status: 'unknown' }; }
    if (result?.status === 'sent' && typeof result.messageId === 'string' && result.messageId.length > 0 && result.messageId.length <= 200) {
      try { await storage('markSent', { ...context, messageId: result.messageId, sentAt: clock() }); return { status: 'sent' }; } catch { /* Sent remotely but local confirmation failed: never blind-retry. */ }
    }
    await storage('markUnknown', { ...context, recordedAt: clock() }); return { status: 'unknown' };
  }
  return Object.freeze({ beginLink, confirmLink, handleWebhook, readCommand, deliver, status: () => ({ state: configurationSnapshot.state === 'ready' ? 'configured-not-probed' : 'disabled', provider: 'max' }) });
}
function createMaxTransport({ token, fetcher, timeoutMs = 10000 } = {}) {
  if (typeof token !== 'string' || !/^[\x21-\x7e]{16,2048}$/.test(token) || typeof fetcher !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000) fail('transport-unconfigured');
  return Object.freeze({ async send({ userId, text, url }) {
    const recipient = maxId(userId); if (typeof text !== 'string' || !text || text.length > 4000 || typeof url !== 'string') fail('invalid-message');
    const target = new URL(url); if (target.protocol !== 'https:' || target.username || target.password) fail('invalid-message');
    let response, body;
    try { response = await fetcher(API_ORIGIN + '/messages?user_id=' + recipient + '&disable_link_preview=true', { method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs), body: JSON.stringify({ text, attachments: [{ type: 'inline_keyboard', payload: { buttons: [[{ type: 'link', text: 'Открыть сайт', url: target.href }]] } }] }) }); body = await response.json(); } catch { return { status: 'unknown' }; }
    if (response.status === 200 && body?.message?.recipient?.chat_type === 'dialog' && maxId(body.message.recipient.user_id) === recipient && typeof body.message.body?.mid === 'string' && body.message.body.mid.length > 0 && body.message.body.mid.length <= 200) return { status: 'sent', messageId: body.message.body.mid };
    return { status: 'unknown' };
  } });
}
module.exports = Object.freeze({ API_ORIGIN, EVENTS, MaxIntegrationError, preferences, quietNow, matches, authenticateWebhook, normalizeUpdate, createMaxAdapter, createMaxTransport });
