'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { CONSENT_VERSION, createTelegramAdapter, createTelegramTransport, validatePreferences, quietNow, secretMatches } = require('./adapter.cjs');
const NOW = Date.parse('2026-11-14T09:00:00.000Z');
const SECRET = 'test-webhook-secret-not-a-real-credential-0000';
const cleanPreferences = overrides => ({ version: 1, events: ['outbid', 'newBidOwn', 'endingSoon', 'auctionEnded', 'matchingNew', 'priceDrop', 'accountChanged'], categories: ['cars'], regionCodes: ['36'], minPriceKopecks: '10000', maxPriceKopecks: '100000000', frequency: 'instant', quietHours: { enabled: false, timeZone: 'Europe/Moscow', startMinute: 1320, endMinute: 480 }, ...overrides });
const digest = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const nonces = new Map(), pending = new Map(), bindings = new Map(), jobs = new Map(), sent = [], calls = [], inboundUpdates = new Set(); let updateSequence = 0;
  let now = NOW, event = { id: 'event-1', principalId: 'alice', type: 'outbid', lotId: 10, priceKopecks: '250000', category: 'cars', regionCode: '36', title: 'Паспорт пользователя и https://evil.example — не должны отправляться' };
  let transportResult = { status: 'sent', messageId: 123 }, revokeBeforeSend = false;
  const repository = {
    async storeLinkNonce(row) { nonces.set(row.nonceHash, row); },
    async claimWebhookUpdate({ updateId }) { if (inboundUpdates.has(updateId)) return false; inboundUpdates.add(updateId); return true; },
    async consumeLinkNonce({ nonceHash, chatId, telegramUserId, telegramUpdateId, now, pendingExpiresInMs }) {
      const row = nonces.get(nonceHash); if (!row || row.expiresAt <= now) return null;
      nonces.delete(nonceHash); const result = { pendingId: 'pending-1', principalId: row.principalId, chatId, telegramUserId, telegramUpdateId, expiresAt: now + pendingExpiresInMs };
      pending.set(result.pendingId, result); return result;
    },
    async confirmPendingBinding({ principalId, pendingId, now, consentVersion }) {
      const row = pending.get(pendingId);
      if (!row || row.principalId !== principalId || row.expiresAt <= now || [...bindings.values()].some(binding => binding.chatId === row.chatId && binding.principalId !== principalId)) return null;
      pending.delete(pendingId);
      const binding = { id: 'binding-' + principalId, version: 1, principalId, chatId: row.chatId, telegramUserId: row.telegramUserId, linkedTelegramUpdateId: row.telegramUpdateId, active: true, consent: { version: consentVersion, acceptedAt: new Date(now).toISOString() }, preferences: cleanPreferences() };
      bindings.set(principalId, binding); return binding;
    },
    async getBindingByPrincipal(principalId) { return bindings.get(principalId) || null; },
    async getBindingByChatId(chatId) { return [...bindings.values()].find(binding => binding.chatId === chatId) || null; },
    async savePreferences({ principalId, bindingId, expectedVersion, preferences }) { const row = bindings.get(principalId); assert.equal(row.id, bindingId); assert.equal(row.version, expectedVersion); row.preferences = preferences; row.version++; },
    async disconnectBinding({ bindingId, principalId }) { const row = bindings.get(principalId); if (row?.id === bindingId) { row.active = false; row.version++; } },
    async getAccountLink({ principalId, section }) { calls.push(['account-link', principalId, section]); return 'https://auction.example/account/' + section; },
    async getAuthorizedEvent(eventId) { assert.equal(eventId, event.id); return event; },
    async deferDelivery(row) { jobs.set(row.key, { ...row, status: 'deferred' }); },
    async claimDelivery(row) { calls.push(['claim', row.minimumIntervalMs]); if (jobs.has(row.key)) { const previous = jobs.get(row.key); return previous.status === 'claimed' ? { status: 'busy' } : previous; } const claim = { ...row, status: 'claimed', leaseId: 'lease-1' }; jobs.set(row.key, claim); return claim; },
    async deliveryStillAllowed({ bindingId, bindingVersion }) { const row = [...bindings.values()].find(value => value.id === bindingId); return !revokeBeforeSend && row?.active === true && row.version === bindingVersion; },
    async markSent(row) { jobs.set(row.key, { ...row, status: 'sent' }); },
    async markUnknown(row) { jobs.set(row.key, { ...row, status: 'unknown' }); },
    async cancelDelivery(row) { jobs.set(row.key, { ...row, status: 'cancelled' }); }
  };
  const adapter = createTelegramAdapter({ configuration: { state: 'ready', reviewReference: 'isolated-unit-fixture', botUsername: 'FastTorgiTestBot', publicOrigin: 'https://auction.example', webhookSecret: SECRET }, authorizeAccount: async context => ({ allowed: context?.authenticated === true, principalId: context?.principalId }), repository, transport: { async sendMessage(message) { sent.push(message); return transportResult; } }, clock: () => now, randomBytes: size => Buffer.alloc(size, 7) });
  const context = principalId => ({ authenticated: true, principalId });
  const update = text => ({ update_id: ++updateSequence, message: { date: Math.floor(now / 1000), text, chat: { type: 'private', id: 12345 }, from: { id: 12345, is_bot: false } } });
  async function connect(principalId = 'alice') {
    const link = await adapter.createLink(context(principalId)), token = new URL(link.url).searchParams.get('start');
    const response = await adapter.handleWebhook({ secret: SECRET, update: update('/start ' + token) }); assert.equal(response.status, 'pending-confirmation');
    return adapter.confirmLink(context(principalId), 'pending-1', { accepted: true, version: CONSENT_VERSION });
  }
  return { adapter, context, update, connect, repository, nonces, pending, bindings, jobs, sent, calls, setNow: value => { now = value; }, setEvent: value => { event = { ...event, ...value }; }, result: value => { transportResult = value; }, revoke: () => { revokeBeforeSend = true; } };
}

(async () => {
  await assert.rejects(createTelegramAdapter().createLink({}), { code: 'integration-disabled' });
  const f = fixture();
  await assert.rejects(f.adapter.createLink({ authenticated: false }), { code: 'forbidden' });
  const link = await f.adapter.createLink(f.context('alice')), token = new URL(link.url).searchParams.get('start');
  assert.equal(token.length, 43); assert.equal(f.nonces.size, 1); assert(f.nonces.has(digest(token)));
  assert(!JSON.stringify([...f.nonces.values()]).includes(token), 'the raw bearer link is not stored');
  await assert.rejects(f.adapter.handleWebhook({ secret: 'forged', update: f.update('/start ' + token) }), { code: 'invalid-webhook-secret' });
  assert.equal(f.nonces.size, 1, 'a forged header cannot consume the nonce');
  const group = f.update('/start ' + token); group.message.chat.type = 'group';
  assert.equal((await f.adapter.handleWebhook({ secret: SECRET, update: group })).status, 'ignored');
  assert.equal(f.nonces.size, 1);
  assert.equal((await f.adapter.handleWebhook({ secret: SECRET, update: f.update('/start ' + token) })).status, 'pending-confirmation');
  assert.equal(f.bindings.size, 0, 'Telegram /start alone cannot bind an account');
  await assert.rejects(f.adapter.confirmLink(f.context('bob'), 'pending-1', { accepted: true, version: CONSENT_VERSION }), { code: 'binding-not-confirmed' });
  await assert.rejects(f.adapter.confirmLink(f.context('alice'), 'pending-1', { accepted: false, version: CONSENT_VERSION }), { code: 'consent-required' });
  assert.equal((await f.adapter.confirmLink(f.context('alice'), 'pending-1', { accepted: true, version: CONSENT_VERSION })).connected, true);
  assert.equal((await f.adapter.handleWebhook({ secret: SECRET, update: f.update('/start ' + token) })).status, 'expired-link');
  assert.equal((await f.adapter.deliver('event-1')).status, 'sent');
  assert.equal((await f.adapter.deliver('event-1')).status, 'sent');
  assert.equal(f.sent.length, 1, 'idempotent duplicate event does not produce another message');
  assert.equal(f.sent[0].chatId, '12345'); assert(f.sent[0].text.includes('Лот № 10')); assert(!f.sent[0].text.includes('Паспорт')); assert(!f.sent[0].text.includes('evil.example'));
  for (const command of ['/bids', '/lots', '/subscriptions']) {
    const result = await f.adapter.handleWebhook({ secret: SECRET, update: f.update(command) }); assert.equal(result.status, 'account-link'); assert(result.reply.text.includes('https://auction.example/account/'));
  }
  assert.equal((await f.adapter.handleWebhook({ secret: SECRET, update: f.update('/pay 100') })).status, 'help');
  assert.equal(f.sent.length, 1, 'a bot command cannot execute a bid/payment or send an unreviewed event');
  await f.adapter.handleWebhook({ secret: SECRET, update: f.update('/stop') });
  f.setEvent({ id: 'event-2' }); assert.equal((await f.adapter.deliver('event-2')).status, 'not-connected');
  const replay = fixture(); await replay.connect(); const stop = replay.update('/stop'); assert.equal((await replay.adapter.handleWebhook({ secret: SECRET, update: stop })).status, 'stopped'); await replay.connect(); assert.equal((await replay.adapter.handleWebhook({ secret: SECRET, update: stop })).status, 'duplicate-update'); assert.equal(replay.bindings.get('alice').active, true, 'replaying an old stop cannot revoke a new binding');
  const delayed = fixture(); const delayedStop = delayed.update('/stop'); await delayed.connect(); assert.equal((await delayed.adapter.handleWebhook({ secret: SECRET, update: delayedStop })).status, 'stale-binding-command'); assert.equal(delayed.bindings.get('alice').active, true, 'even an unprocessed older stop in the same second cannot revoke a newly confirmed binding');

  const expired = fixture(); const oldLink = await expired.adapter.createLink(expired.context('alice')); expired.setNow(NOW + 600001);
  assert.equal((await expired.adapter.handleWebhook({ secret: SECRET, update: expired.update('/start ' + new URL(oldLink.url).searchParams.get('start')) })).status, 'expired-link');
  const dbFailure = fixture(); dbFailure.repository.storeLinkNonce = async () => { throw new Error('sensitive-database-dsn-and-token'); }; await assert.rejects(dbFailure.adapter.createLink(dbFailure.context('alice')), error => error.code === 'repository-unavailable' && !error.message.includes('sensitive'));
  const unknown = fixture(); await unknown.connect(); unknown.result({ status: 'unknown' });
  assert.equal((await unknown.adapter.deliver('event-1')).status, 'unknown'); assert.equal((await unknown.adapter.deliver('event-1')).status, 'unknown'); assert.equal(unknown.sent.length, 1, 'unknown provider outcomes never blindly retry');
  const concurrent = fixture(); await concurrent.connect(); const parallel = await Promise.all([concurrent.adapter.deliver('event-1'), concurrent.adapter.deliver('event-1')]); assert.deepEqual(parallel.map(row => row.status).sort(), ['busy', 'sent']); assert.equal(concurrent.sent.length, 1);
  const revoked = fixture(); await revoked.connect(); revoked.revoke(); assert.equal((await revoked.adapter.deliver('event-1')).status, 'cancelled'); assert.equal((await revoked.adapter.deliver('event-1')).status, 'cancelled'); assert.equal(revoked.sent.length, 0); assert.equal([...revoked.jobs.values()][0].status, 'cancelled');
  const malformed = fixture(); await malformed.connect(); malformed.bindings.get('alice').telegramUserId = '99999'; await assert.rejects(malformed.adapter.deliver('event-1'), { code: 'invalid-private-chat' }); assert.equal(malformed.sent.length, 0);
  const unsafeLink = fixture(); await unsafeLink.connect(); unsafeLink.repository.getAccountLink = async () => 'https://auction.example/account/bids#access_token=example'; await assert.rejects(unsafeLink.adapter.handleWebhook({ secret: SECRET, update: unsafeLink.update('/bids') }), { code: 'invalid-account-link' });
  unsafeLink.repository.getAccountLink = async () => 'https://auction.example/account/bids?code=example'; await assert.rejects(unsafeLink.adapter.handleWebhook({ secret: SECRET, update: unsafeLink.update('/bids') }), { code: 'invalid-account-link' });
  const preferences = fixture(); await preferences.connect();
  await preferences.adapter.setPreferences(preferences.context('alice'), cleanPreferences({ frequency: 'daily', events: ['outbid', 'matchingNew'], maxPriceKopecks: '10000' }));
  preferences.setEvent({ type: 'matchingNew' }); assert.equal((await preferences.adapter.deliver('event-1')).status, 'filtered');
  preferences.setEvent({ type: 'outbid', id: 'event-2', category: 'equipment', regionCode: '77' }); assert.equal((await preferences.adapter.deliver('event-2')).status, 'sent', 'discovery budgets cannot suppress an enabled personal outbid event');
  assert(preferences.calls.some(call => call[0] === 'claim' && call[1] === 86400000), 'the durable repository receives the daily atomic-frequency constraint');
  const quiet = validatePreferences(cleanPreferences({ quietHours: { enabled: true, timeZone: 'Europe/Moscow', startMinute: 1320, endMinute: 480 } }));
  assert.equal(quietNow(quiet, Date.parse('2026-11-14T20:00:00Z')), true); assert.equal(quietNow(quiet, NOW), false);
  const quietDelivery = fixture(); await quietDelivery.connect(); quietDelivery.bindings.get('alice').preferences = quiet; quietDelivery.setNow(Date.parse('2026-11-14T20:00:00Z')); assert.equal((await quietDelivery.adapter.deliver('event-1')).status, 'deferred'); assert.equal(quietDelivery.sent.length, 0);
  assert.throws(() => validatePreferences(cleanPreferences({ minPriceKopecks: '999999', maxPriceKopecks: '1' })), { code: 'invalid-budget' });
  assert.throws(() => validatePreferences(cleanPreferences({ frequency: 'every-second' })), { code: 'invalid-frequency' });
  assert.throws(() => validatePreferences(cleanPreferences({ quietHours: { enabled: true, timeZone: 'not/a-zone', startMinute: 1, endMinute: 2 } })), { code: 'invalid-time-zone' });
  assert.equal(secretMatches(SECRET, SECRET), true); assert.equal(secretMatches(SECRET + 'x', SECRET), false);

  const requests = [], transport = createTelegramTransport({ token: '123456:unit-test-token-not-a-real-secret', fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 88, chat: { id: 12345 } } }; } }; } });
  assert.deepEqual(await transport.sendMessage({ chatId: '12345', text: 'Проверка' }), { status: 'sent', messageId: 88 });
  assert(requests[0].url.startsWith('https://api.telegram.org/')); assert.equal(requests[0].options.redirect, 'error');
  const body = JSON.parse(requests[0].options.body); assert.equal(body.parse_mode, undefined); assert.equal(body.link_preview_options.is_disabled, true);
  const badResponse = createTelegramTransport({ token: '123456:unit-test-token-not-a-real-secret', fetcher: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 88, chat: { id: 99999 } } }) }) });
  assert.equal((await badResponse.sendMessage({ chatId: '12345', text: 'Проверка' })).status, 'unknown', 'a mismatched provider recipient never confirms delivery');
  const failure = createTelegramTransport({ token: '123456:unit-test-token-not-a-real-secret', fetcher: async () => { throw new Error('secret-containing provider detail'); } });
  assert.deepEqual(await failure.sendMessage({ chatId: '12345', text: 'Проверка' }), { status: 'unknown' });
  console.log('PASS: disabled-by-default Telegram boundary; owner-bound two-stage nonce linking, webhook/private chat guards, opt-in preferences, private event routing, command allowlist, unsubscribe, durable-delivery claims and unknown-outcome retry safety. Transport uses an isolated fake fetch; no Telegram request made.');
})().catch(error => { console.error(error); process.exitCode = 1; });
