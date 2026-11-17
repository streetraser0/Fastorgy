/* Server-only preparation. Nothing here registers a webhook, schedules work or connects the demo. */
'use strict';
const { createHash, randomBytes: secureRandomBytes, timingSafeEqual } = require('node:crypto');

const EVENTS = Object.freeze(['outbid', 'newBidOwn', 'endingSoon', 'auctionEnded', 'matchingNew', 'priceDrop', 'accountChanged']);
const CONSENT_VERSION = 'telegram-personal-notifications-v1';
const FREQUENCY_MS = Object.freeze({ instant: 0, hourly: 3600000, daily: 86400000 });
const COMMANDS = Object.freeze({ '/bids': 'bids', '/lots': 'lots', '/subscriptions': 'subscriptions' });
class TelegramError extends Error {
  constructor(code) { super('Telegram integration rejected: ' + code); this.name = 'TelegramError'; this.code = code; }
}
function fail(code) { throw new TelegramError(code); }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value)) fail('invalid-id'); return value; }
function numericId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)) return value;
  fail('invalid-private-chat');
}
function nowMs(clock) { const value = clock(); if (!Number.isSafeInteger(value) || value <= 0) fail('invalid-clock'); return value; }
const hash = value => createHash('sha256').update(value).digest('hex');
function secretMatches(provided, configured) {
  if (typeof provided !== 'string' || provided.length > 256 || typeof configured !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(configured)) return false;
  return timingSafeEqual(createHash('sha256').update(provided).digest(), createHash('sha256').update(configured).digest());
}
function amount(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,15})$/.test(value) || BigInt(value) > BigInt(Number.MAX_SAFE_INTEGER)) fail('invalid-budget');
  return value;
}
function uniqueList(value, pattern, maximum) {
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== 'string' || !pattern.test(item))) fail('invalid-preferences');
  return Object.freeze([...new Set(value)]);
}
function validatePreferences(value) {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.events) || value.events.length > EVENTS.length || value.events.some(event => !EVENTS.includes(event))) fail('invalid-preferences');
  const categories = uniqueList(value.categories, /^[a-z][a-z0-9_:-]{0,63}$/, 64);
  const regionCodes = uniqueList(value.regionCodes, /^\d{2}$/, 100);
  const minPriceKopecks = amount(value.minPriceKopecks), maxPriceKopecks = amount(value.maxPriceKopecks);
  if (minPriceKopecks !== null && maxPriceKopecks !== null && BigInt(minPriceKopecks) > BigInt(maxPriceKopecks)) fail('invalid-budget');
  if (!Object.hasOwn(FREQUENCY_MS, value.frequency)) fail('invalid-frequency');
  const quiet = value.quietHours;
  if (!record(quiet) || typeof quiet.enabled !== 'boolean' || typeof quiet.timeZone !== 'string' || quiet.timeZone.length > 100 || !Number.isInteger(quiet.startMinute) || quiet.startMinute < 0 || quiet.startMinute > 1439 || !Number.isInteger(quiet.endMinute) || quiet.endMinute < 0 || quiet.endMinute > 1439 || quiet.enabled && quiet.startMinute === quiet.endMinute) fail('invalid-quiet-hours');
  try { new Intl.DateTimeFormat('en-GB', { timeZone: quiet.timeZone }).format(0); } catch { fail('invalid-time-zone'); }
  return Object.freeze({ version: 1, events: Object.freeze([...new Set(value.events)]), categories, regionCodes, minPriceKopecks, maxPriceKopecks, frequency: value.frequency, quietHours: Object.freeze({ enabled: quiet.enabled, timeZone: quiet.timeZone, startMinute: quiet.startMinute, endMinute: quiet.endMinute }) });
}
function quietNow(preferences, time) {
  const quiet = preferences.quietHours; if (!quiet.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: quiet.timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(time);
  const value = Number(parts.find(part => part.type === 'hour').value) * 60 + Number(parts.find(part => part.type === 'minute').value);
  return quiet.startMinute < quiet.endMinute ? value >= quiet.startMinute && value < quiet.endMinute : value >= quiet.startMinute || value < quiet.endMinute;
}
function matchesEvent(preferences, event) {
  if (!preferences.events.includes(event.type)) return false;
  if (!['matchingNew', 'priceDrop'].includes(event.type)) return true;
  if (preferences.categories.length && !preferences.categories.includes(event.category)) return false;
  if (preferences.regionCodes.length && !preferences.regionCodes.includes(event.regionCode)) return false;
  const price = amount(event.priceKopecks); if (price === null) return false;
  return !(preferences.minPriceKopecks !== null && BigInt(price) < BigInt(preferences.minPriceKopecks) || preferences.maxPriceKopecks !== null && BigInt(price) > BigInt(preferences.maxPriceKopecks));
}
function origin(value) {
  let url; try { url = new URL(value); } catch { fail('invalid-site-origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('invalid-site-origin');
  return url.origin;
}
function sameOriginLink(value, siteOrigin, expectedPath) {
  let url; try { url = new URL(value); } catch { fail('invalid-account-link'); }
  if (typeof expectedPath !== 'string' || !/^\/[A-Za-z0-9/_-]*$/.test(expectedPath) || expectedPath.includes('//') || url.origin !== siteOrigin || url.username || url.password || url.pathname !== expectedPath || url.search || url.hash || /[\x00-\x20]/.test(value)) fail('invalid-account-link');
  return url.href;
}
function validBinding(binding) {
  return record(binding) && binding.active === true && binding.consent?.version === CONSENT_VERSION && typeof binding.consent.acceptedAt === 'string' && Number.isFinite(Date.parse(binding.consent.acceptedAt)) && Number.isSafeInteger(binding.linkedTelegramUpdateId) && binding.linkedTelegramUpdateId >= 0 && typeof binding.id === 'string' && typeof binding.principalId === 'string' && Number.isSafeInteger(binding.version) && binding.version > 0;
}
function messageFor(event, siteOrigin) {
  const labels = { outbid: 'Вашу ставку перебили.', newBidOwn: 'На ваш лот сделана новая ставка.', endingSoon: 'Торги по интересующему лоту скоро завершатся.', auctionEnded: 'Торги завершились. Проверьте результат в кабинете.', matchingNew: 'Новый лот соответствует вашей подборке.', priceDrop: 'Цена интересующего лота снизилась.', accountChanged: 'В личном кабинете изменился статус. Откройте сайт для подробностей.' };
  const rows = [labels[event.type]];
  if (event.type !== 'accountChanged') {
    if (!Number.isSafeInteger(event.lotId) || event.lotId <= 0) fail('invalid-canonical-event');
    rows.push('Лот № ' + event.lotId);
    const price = amount(event.priceKopecks);
    if (price !== null) rows.push('Текущая цена: ' + (BigInt(price) / 100n).toLocaleString('ru-RU') + ',' + (BigInt(price) % 100n).toString().padStart(2, '0') + ' ₽');
  }
  rows.push(siteOrigin + '/');
  // Titles, seller text, bank details, user names and raw provider data are deliberately absent.
  return rows.join('\n');
}

function createTelegramAdapter({ configuration = { state: 'disabled' }, authorizeAccount, repository, transport, clock = Date.now, randomBytes = secureRandomBytes } = {}) {
  const config = Object.freeze({ ...configuration });
  async function storage(method, input) {
    try {
      if (!repository || typeof repository[method] !== 'function') fail('repository-unavailable');
      return await repository[method](input);
    } catch { fail('repository-unavailable'); }
  }
  function ready() {
    if (config.state !== 'ready' || typeof config.reviewReference !== 'string' || !config.reviewReference.trim() || typeof config.botUsername !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{3,27}bot$/i.test(config.botUsername) || !secretMatches(config.webhookSecret, config.webhookSecret) || !repository || typeof authorizeAccount !== 'function') fail('integration-disabled');
    return origin(config.publicOrigin);
  }
  async function principal(context) {
    ready(); let grant; try { grant = await authorizeAccount(context); } catch { fail('authorization-unavailable'); }
    if (!record(grant) || grant.allowed !== true) fail('forbidden'); return id(grant.principalId);
  }
  async function currentBinding(principalId) {
    const binding = await storage('getBindingByPrincipal', principalId);
    if (!validBinding(binding) || binding.principalId !== principalId) return null;
    if (numericId(binding.chatId) !== numericId(binding.telegramUserId)) fail('invalid-private-chat'); return binding;
  }
  return Object.freeze({
    async createLink(context) {
      const principalId = await principal(context), now = nowMs(clock), token = randomBytes(32).toString('base64url');
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail('invalid-random-source');
      await storage('storeLinkNonce', { nonceHash: hash(token), principalId, createdAt: now, expiresAt: now + 10 * 60000 });
      return Object.freeze({ url: 'https://t.me/' + config.botUsername + '?start=' + token, expiresAt: now + 10 * 60000, requiresBrowserConfirmation: true });
    },
    async confirmLink(context, pendingId, acceptance) {
      const principalId = await principal(context); id(pendingId);
      if (acceptance?.accepted !== true || acceptance.version !== CONSENT_VERSION) fail('consent-required');
      const result = await storage('confirmPendingBinding', { principalId, pendingId, now: nowMs(clock), consentVersion: CONSENT_VERSION });
      if (!validBinding(result) || result.principalId !== principalId) fail('binding-not-confirmed');
      if (numericId(result.chatId) !== numericId(result.telegramUserId)) fail('invalid-private-chat');
      return Object.freeze({ connected: true, bindingId: result.id });
    },
    async setPreferences(context, preferences) {
      const principalId = await principal(context), clean = validatePreferences(preferences), binding = await currentBinding(principalId);
      if (!binding) fail('not-connected');
      await storage('savePreferences', { principalId, bindingId: binding.id, expectedVersion: binding.version, preferences: clean }); return clean;
    },
    async disconnect(context) {
      const principalId = await principal(context), binding = await currentBinding(principalId);
      if (binding) await storage('disconnectBinding', { bindingId: binding.id, principalId });
      return Object.freeze({ connected: false });
    },
    async handleWebhook({ secret, update } = {}) {
      const siteOrigin = ready(); if (!secretMatches(secret, config.webhookSecret)) fail('invalid-webhook-secret');
      const message = update?.message;
      if (!Number.isSafeInteger(update?.update_id) || update.update_id < 0 || !record(message) || message.chat?.type !== 'private' || message.from?.is_bot !== false || typeof message.text !== 'string' || message.text.length > 256 || !Number.isSafeInteger(message.date) || message.date <= 0) return Object.freeze({ status: 'ignored' });
      const chatId = numericId(message.chat.id), telegramUserId = numericId(message.from.id);
      if (chatId !== telegramUserId) fail('invalid-private-chat');
      const now = nowMs(clock), messageAt = message.date * 1000;
      if (!Number.isSafeInteger(messageAt) || messageAt > now + 300000 || messageAt < now - 86400000) return Object.freeze({ status: 'stale-update' });
      if (await storage('claimWebhookUpdate', { updateId: update.update_id, chatId, telegramUserId, messageAt, receivedAt: now }) !== true) return Object.freeze({ status: 'duplicate-update' });
      const text = message.text.trim(), start = text.match(/^\/start ([A-Za-z0-9_-]{43})$/);
      if (start) {
        const pending = await storage('consumeLinkNonce', { nonceHash: hash(start[1]), chatId, telegramUserId, telegramUpdateId: update.update_id, now, pendingExpiresInMs: 5 * 60000 });
        if (!record(pending) || typeof pending.pendingId !== 'string') return Object.freeze({ status: 'expired-link', reply: { chatId, text: 'Ссылка недействительна или уже использована. Создайте новую в кабинете.' } });
        id(pending.pendingId);
        return Object.freeze({ status: 'pending-confirmation', reply: { chatId, text: 'Вернитесь в личный кабинет и подтвердите подключение Telegram. До подтверждения личные уведомления не отправляются.' } });
      }
      const binding = await storage('getBindingByChatId', chatId);
      if (validBinding(binding)) {
        const acceptedSecond = Math.floor(Date.parse(binding.consent.acceptedAt) / 1000) * 1000;
        if (messageAt < acceptedSecond || messageAt === acceptedSecond && update.update_id <= binding.linkedTelegramUpdateId) return Object.freeze({ status: 'stale-binding-command' });
      }
      if (text === '/stop') {
        if (validBinding(binding) && numericId(binding.telegramUserId) === telegramUserId && numericId(binding.chatId) === chatId) await storage('disconnectBinding', { bindingId: binding.id, principalId: binding.principalId });
        return Object.freeze({ status: 'stopped', reply: { chatId, text: 'Личные уведомления отключены. Для нового подключения используйте кабинет на сайте.' } });
      }
      if (!validBinding(binding) || numericId(binding.telegramUserId) !== telegramUserId || numericId(binding.chatId) !== chatId) return Object.freeze({ status: 'not-connected', reply: { chatId, text: 'Подключите Telegram из личного кабинета на сайте и подтвердите привязку.' } });
      if (!Object.hasOwn(COMMANDS, text)) return Object.freeze({ status: 'help', reply: { chatId, text: 'Доступны /bids — ставки, /lots — лоты, /subscriptions — уведомления, /stop — отключить уведомления. Ставки и платежи выполняются только на сайте.' } });
      const section = COMMANDS[text], path = config.accountPaths?.[section] || '/account/' + section;
      const link = sameOriginLink(await storage('getAccountLink', { principalId: binding.principalId, section }), siteOrigin, path);
      return Object.freeze({ status: 'account-link', reply: { chatId, text: 'Откройте личный кабинет. Сайт проверит ваш вход.\n' + link } });
    },
    async deliver(eventId) {
      const siteOrigin = ready(); id(eventId);
      if (!transport || typeof transport.sendMessage !== 'function') fail('integration-disabled');
      // This repository call must read the canonical server outbox and current recipient ACL.
      // Caller-supplied event objects, browser localStorage and webhook text are never events.
      const event = await storage('getAuthorizedEvent', eventId);
      if (!record(event) || event.id !== eventId || !EVENTS.includes(event.type)) fail('invalid-canonical-event');
      const principalId = id(event.principalId), binding = await currentBinding(principalId);
      if (!binding) return Object.freeze({ status: 'not-connected' });
      const preferences = validatePreferences(binding.preferences), now = nowMs(clock);
      if (!matchesEvent(preferences, event)) return Object.freeze({ status: 'filtered' });
      const key = hash(binding.id + '\0' + eventId), text = messageFor(event, siteOrigin);
      const claim = await storage('claimDelivery', { key, eventId, bindingId: binding.id, bindingVersion: binding.version, now, minimumIntervalMs: FREQUENCY_MS[preferences.frequency] });
      if (!record(claim) || !['claimed', 'sent', 'busy', 'unknown', 'deferred', 'cancelled'].includes(claim.status)) fail('invalid-delivery-claim');
      if (claim.status !== 'claimed') return Object.freeze({ status: claim.status });
      const leaseId = id(claim.leaseId), lease = { key, leaseId, bindingId: binding.id, bindingVersion: binding.version };
      if (quietNow(preferences, now)) { await storage('deferDelivery', { ...lease, eventId, reason: 'quiet-hours' }); return Object.freeze({ status: 'deferred' }); }
      if (await storage('deliveryStillAllowed', lease) !== true) { await storage('cancelDelivery', lease); return Object.freeze({ status: 'cancelled' }); }
      let result;
      try { result = await transport.sendMessage({ chatId: numericId(binding.chatId), text }); } catch { result = { status: 'unknown' }; }
      if (result?.status !== 'sent' || !Number.isSafeInteger(result.messageId) || result.messageId <= 0) {
        await storage('markUnknown', { ...lease, reason: result?.status === 'blocked' ? 'blocked' : 'provider-outcome-unconfirmed' });
        return Object.freeze({ status: 'unknown' });
      }
      // A crash after Telegram accepts a message but before this commit is reconciled,
      // never blindly retried: Telegram sendMessage has no exactly-once idempotency key.
      await storage('markSent', { ...lease, messageId: result.messageId, sentAt: nowMs(clock) });
      return Object.freeze({ status: 'sent', messageId: result.messageId });
    }
  });
}

function createTelegramTransport({ token, fetcher = globalThis.fetch } = {}) {
  if (typeof token !== 'string' || !/^\d{6,16}:[A-Za-z0-9_-]{20,128}$/.test(token) || typeof fetcher !== 'function') fail('transport-not-configured');
  return Object.freeze({ async sendMessage({ chatId, text }) {
    const target = numericId(chatId); if (typeof text !== 'string' || !text || text.length > 3500) fail('invalid-message');
    let response;
    try { response = await fetcher('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: target, text, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(8000) }); } catch { return { status: 'unknown' }; }
    if (response.status === 403) return { status: 'blocked' };
    if (!response.ok) return { status: 'unknown' };
    let body; try { body = await response.json(); } catch { return { status: 'unknown' }; }
    if (body?.ok !== true || !Number.isSafeInteger(body.result?.message_id) || body.result.message_id <= 0 || String(body.result.chat?.id) !== target) return { status: 'unknown' };
    return { status: 'sent', messageId: body.result.message_id };
  } });
}
module.exports = Object.freeze({ EVENTS, CONSENT_VERSION, TelegramError, validatePreferences, matchesEvent, quietNow, secretMatches, createTelegramAdapter, createTelegramTransport });
