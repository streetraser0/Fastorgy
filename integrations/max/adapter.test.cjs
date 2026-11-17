'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { API_ORIGIN, createMaxAdapter, createMaxTransport, preferences, quietNow, matches, normalizeUpdate, authenticateWebhook } = require('./adapter.cjs');
const now = Date.UTC(2026, 10, 14, 12);
const prefs = () => ({ version: 1, events: ['outbid', 'newBidOwn', 'matchingNew', 'priceDrop', 'accountChanged'], categories: ['cars'], regionCodes: ['36'], minPriceKopecks: '10000', maxPriceKopecks: '20000', frequency: 'instant', quietHours: { enabled: false, timeZone: 'Europe/Moscow', startMinute: 1320, endMinute: 420 } });
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture(extra = {}) {
 const pending = new Map(), inbox = new Map(), claims = new Map(), calls = []; let active = null;
 const configuration = { state: 'ready', reviewReference: 'test-review-only', publicOrigin: 'https://example.com', botUrl: 'https://max.ru/test_registered_bot', webhookSecret: 'test_'.repeat(8), ...extra.configuration };
 const repository = {
  async savePendingLink(row) { pending.set(row.nonceHash, { ...row }); },
  async applyInboundUpdate(row) {
   if (inbox.has(row.eventKey)) return { durable: true, duplicate: true };
   if (row.kind === 'command' && active?.status === 'active') row = { ...row, bindingId: active.id, bindingVersion: active.version };
   inbox.set(row.eventKey, row);
   if (row.kind === 'bot_started' && row.nonceHash) { const link = pending.get(row.nonceHash); if (link && link.expiresAt > row.receivedAt && !link.claimed) Object.assign(link, { claimed: true, linkId: 'link-1', maxUserId: row.maxUserId, chatId: row.chatId }); }
   if (['bot_stopped', 'dialog_removed'].includes(row.kind) && active?.maxUserId === row.maxUserId && active.chatId === row.chatId && row.eventAt >= active.activatedAt) active = { ...active, status: 'stopped', version: active.version + 1 };
   return { durable: true };
  },
  async confirmPendingBinding(row) {
   const link = [...pending.values()].find(link => link.linkId === row.linkId && link.principalId === row.principalId && link.claimed && !link.confirmed && link.expiresAt > row.now);
   if (!link) throw Error('invalid pending'); link.confirmed = true;
   active = { provider: 'max', id: 'binding-1', principalId: link.principalId, status: 'active', optedIn: true, version: 1, maxUserId: link.maxUserId, chatId: link.chatId, activatedAt: row.now, preferences: prefs() }; return active;
  },
  async getVerifiedInboundUpdate({ eventKey }) { const row = inbox.get(eventKey); return row ? { ...row, verified: true } : null; },
  async getBindingForMaxIdentity() { return active; },
  async stopBinding() { active = { ...active, status: 'stopped', version: active.version + 1 }; },
  async getAccountView({ principalId, kind }) { calls.push(['view', principalId, kind]); return { principalId, count: 3, forbiddenExtra: 'not returned to chat' }; },
  async getAuthorizedEvent({ eventId, principalId }) { return { id: eventId, principalId: 'owner-1', kind: 'matchingNew', lot: { id: 19, category: 'cars', regionCode: '36', name: 'Автомобиль', city: 'Воронеж', priceKopecks: '15000', passport: 'NEVER_SEND' }, ...extra.event }; },
  async getBindingByPrincipal() { return active; },
  async claimDelivery(row) { calls.push(['claim', row]); if (claims.has(row.key)) return { status: claims.get(row.key) }; claims.set(row.key, 'busy'); return { status: 'claimed', leaseId: 'lease-1' }; },
  async deliveryStillAllowed() { return extra.stillAllowed !== false && active?.status === 'active'; },
  async cancelDelivery(row) { claims.set(row.key, 'cancelled'); },
  async deferDelivery(row) { claims.set(row.key, 'deferred'); },
  async markSent(row) { if (extra.markFailure) throw Error('DB down'); claims.set(row.key, 'sent'); },
  async markUnknown(row) { claims.set(row.key, 'unknown'); }
 };
 const adapter = createMaxAdapter({ configuration, repository, authorizeAccount: async (context, operation) => ({ allowed: context?.authenticated === true, principalId: context?.principalId, operation }), transport: { async send(message) { calls.push(['send', message]); if (extra.sendFailure) throw Error('provider may have sent'); return { status: 'sent', messageId: 'message-1' }; } }, randomBytes: () => Buffer.alloc(32, 7), clock: () => now });
 const context = { authenticated: true, principalId: 'owner-1' };
 const update = value => adapter.handleWebhook({ headers: { 'X-Max-Bot-Api-Secret': configuration.webhookSecret }, body: JSON.stringify(value) });
 let commandSequence = 0;
 async function command({ maxUserId, chatId, command }) { await update({ update_type: 'message_created', timestamp: now, message: { sender: { user_id: maxUserId, is_bot: false }, recipient: { chat_id: chatId, chat_type: 'dialog' }, body: { mid: 'command-' + (++commandSequence), text: command } } }); const row = [...inbox.values()].at(-1); return adapter.readCommand(row.eventKey); }
 async function link() { const result = await adapter.beginLink(context), nonce = new URL(result.url).searchParams.get('start'); await update({ update_type: 'bot_started', timestamp: now, chat_id: -9, user: { user_id: 17, is_bot: false }, payload: nonce }); await adapter.confirmLink(context, 'link-1'); }
 return { adapter, configuration, repository, context, calls, pending, inbox, claims, update, link, command, get active() { return active; }, set active(value) { active = value; } };
}
(async () => {
 await assert.rejects(createMaxAdapter().beginLink({}), { code: 'integration-disabled' });
 const disabled = fixture({ configuration: { state: 'disabled' } }); await assert.rejects(disabled.adapter.deliver('event-1', 'owner-1'), { code: 'integration-disabled' }); assert.equal(disabled.calls.length, 0);
 const f = fixture(); await assert.rejects(f.adapter.beginLink({ authenticated: false }), { code: 'forbidden' });
 const result = await f.adapter.beginLink(f.context), nonce = new URL(result.url).searchParams.get('start'); assert.equal(nonce.length, 43); assert(!JSON.stringify([...f.pending.values()]).includes(nonce)); assert.equal(f.pending.get(hash(nonce)).expiresAt, now + 600000);
 await assert.rejects(f.adapter.handleWebhook({ headers: { 'X-Max-Bot-Api-Secret': 'forged' }, body: '{' }), { code: 'webhook-unauthorized' }); assert.equal(f.inbox.size, 0);
 await f.update({ update_type: 'bot_started', timestamp: now, chat_id: -9, user: { user_id: 17, is_bot: false }, payload: nonce }); assert.equal(f.active, null, 'opening a stolen deep link never connects an account by itself');
 await assert.rejects(f.adapter.confirmLink({ authenticated: true, principalId: 'owner-2' }, 'link-1'));
 await f.adapter.confirmLink(f.context, 'link-1'); assert.equal(f.active.principalId, 'owner-1'); await assert.rejects(f.adapter.confirmLink(f.context, 'link-1'), undefined, 'link is single use');
 await assert.rejects(f.command({ maxUserId: 18, chatId: -9, command: '/lots' }), { code: 'binding-unavailable' });
 await assert.rejects(f.command({ maxUserId: 17, chatId: -8, command: '/lots' }), { code: 'binding-unavailable' });
 const view = await f.command({ maxUserId: 17, chatId: -9, command: '/bids' }); assert(view.text.includes('Мои ставки: 3')); assert(!JSON.stringify(view).includes('forbiddenExtra'));
 await assert.rejects(f.adapter.readCommand('forged-event-key'), { code: 'unauthorized-update' });
 const unsupported = await f.command({ maxUserId: 17, chatId: -9, command: '/bid' }); assert(unsupported.text.includes('/help') || unsupported.text.includes('/bids'), 'unrecognized financial commands only show help');
 assert.equal((await f.adapter.deliver('event-1', 'owner-1')).status, 'sent'); assert.equal((await f.adapter.deliver('event-1', 'owner-1')).status, 'sent'); assert.equal(f.calls.filter(row => row[0] === 'send').length, 1);
 const sent = f.calls.find(row => row[0] === 'send')[1]; assert.equal(sent.userId, '17'); assert.equal(sent.url, 'https://example.com/?lot=19'); assert(sent.text.includes('150,00 ₽')); assert(!JSON.stringify(sent).includes('NEVER_SEND')); assert(!sent.text.includes('Автомобиль')); assert(!sent.text.includes('Воронеж'));
 await assert.rejects(f.adapter.deliver('event-2', 'owner-2'), { code: 'unauthorized-event' });
 const claim = f.calls.find(row => row[0] === 'claim')[1]; assert.equal(claim.minimumIntervalMs, 500); assert.equal(claim.globalLimitPerSecond, 30);
 const oldStop = { provider: 'max', eventKey: 'old-stop-event', verified: true, kind: 'command', command: '/stop', maxUserId: '17', chatId: '-9', bindingId: f.active.id, bindingVersion: f.active.version - 1, eventAt: now - 1 }; f.inbox.set(oldStop.eventKey, oldStop); await assert.rejects(f.adapter.readCommand(oldStop.eventKey), { code: 'stale-update' }); assert.equal(f.active.status, 'active'); f.inbox.set('old-time-stop', { ...oldStop, eventKey: 'old-time-stop', bindingVersion: f.active.version }); await assert.rejects(f.adapter.readCommand('old-time-stop'), { code: 'stale-update' }); assert.equal(f.active.status, 'active');
 const before = f.calls.filter(row => row[0] === 'send').length; await f.command({ maxUserId: 17, chatId: -9, command: '/stop' }); await assert.rejects(f.adapter.deliver('event-3', 'owner-1'), { code: 'binding-unavailable' }); assert.equal(f.calls.filter(row => row[0] === 'send').length, before);
 const unknown = fixture({ sendFailure: true }); await unknown.link(); assert.equal((await unknown.adapter.deliver('event-1', 'owner-1')).status, 'unknown'); assert.equal((await unknown.adapter.deliver('event-1', 'owner-1')).status, 'unknown'); assert.equal(unknown.calls.filter(row => row[0] === 'send').length, 1);
 const failedMark = fixture({ markFailure: true }); await failedMark.link(); assert.equal((await failedMark.adapter.deliver('event-1', 'owner-1')).status, 'unknown'); assert.equal((await failedMark.adapter.deliver('event-1', 'owner-1')).status, 'unknown'); assert.equal(failedMark.calls.filter(row => row[0] === 'send').length, 1);
 const cancelled = fixture({ stillAllowed: false }); await cancelled.link(); assert.equal((await cancelled.adapter.deliver('event-1', 'owner-1')).status, 'cancelled'); assert.equal(cancelled.calls.filter(row => row[0] === 'send').length, 0); assert.deepEqual([...cancelled.claims.values()], ['cancelled']);
 const quietFixture = fixture(); await quietFixture.link(); quietFixture.active.preferences.quietHours = { enabled: true, timeZone: 'UTC', startMinute: 0, endMinute: 0 }; assert.equal((await quietFixture.adapter.deliver('event-1', 'owner-1')).status, 'deferred'); assert.deepEqual([...quietFixture.claims.values()], ['deferred']); assert.equal(quietFixture.calls.filter(row => row[0] === 'send').length, 0);
 const filtered = fixture({ event: { lot: { id: 19, category: 'property', regionCode: '36', priceKopecks: '15000' } } }); await filtered.link(); assert.equal((await filtered.adapter.deliver('event-1', 'owner-1')).status, 'filtered'); assert.equal(filtered.calls.filter(row => row[0] === 'claim').length, 0);
 const quiet = preferences(prefs()); quiet.quietHours.enabled = true; quiet.quietHours.startMinute = 0; quiet.quietHours.endMinute = 0; assert.equal(quietNow(quiet, now), true, 'equal endpoints mean all-day quiet');
 for (const bad of [{ ...prefs(), minPriceKopecks: '30000' }, { ...prefs(), maxPriceKopecks: '1e6' }, { ...prefs(), quietHours: { ...prefs().quietHours, timeZone: 'Unknown/Nowhere' } }, { ...prefs(), categories: ['<script>'] }]) assert.throws(() => preferences(bad));
 assert.equal(matches({ kind: 'outbid' }, preferences(prefs())), true, 'discovery category filters do not hide selected personal events');
 assert.throws(() => normalizeUpdate(JSON.stringify({ update_type: 'bot_started', timestamp: now, chat_id: 1, user: { user_id: 9007199254740992, is_bot: false } }), now), { code: 'unsafe-provider-id' });
 assert.throws(() => normalizeUpdate(JSON.stringify({ update_type: 'message_created', timestamp: now, message: { sender: { user_id: 17, is_bot: false }, recipient: { chat_id: -9, chat_type: 'chat' }, body: { mid: 'x', text: '/bids' } } }), now), { code: 'invalid-update' });
 const normalized = normalizeUpdate(JSON.stringify({ update_type: 'message_created', timestamp: now, message: { sender: { user_id: 17, is_bot: false }, recipient: { chat_id: -9, chat_type: 'dialog' }, body: { mid: 'x', text: 'паспорт НЕ СОХРАНЯТЬ' } } }), now); assert.equal(normalized.command, '/help'); assert(!JSON.stringify(normalized).includes('паспорт'));
 assert.throws(() => authenticateWebhook({ 'X-Telegram-Bot-Api-Secret-Token': f.configuration.webhookSecret }, f.configuration.webhookSecret), { code: 'webhook-unauthorized' });
 const requests = [], transport = createMaxTransport({ token: 'test-provider-token-never-live', fetcher: async (url, init) => { requests.push({ url, init }); return { status: 200, json: async () => ({ message: { recipient: { chat_type: 'dialog', user_id: 17 }, body: { mid: 'max-message-1' } } }) }; } });
 assert.deepEqual(await transport.send({ userId: '17', text: '<b>plain text</b>', url: 'https://example.com/?lot=19' }), { status: 'sent', messageId: 'max-message-1' });
 assert(requests[0].url.startsWith(API_ORIGIN + '/messages?user_id=17')); assert(!requests[0].url.includes('test-provider-token')); assert.equal(requests[0].init.headers.Authorization, 'test-provider-token-never-live'); assert.equal(requests[0].init.redirect, 'error'); assert.equal(JSON.parse(requests[0].init.body).format, undefined); assert.equal(requests[0].init.signal.aborted, false);
 const uncertain = createMaxTransport({ token: 'test-provider-token-never-live', fetcher: async () => { throw Error('timeout includes secret and must never escape'); } }); assert.deepEqual(await uncertain.send({ userId: '17', text: 'test', url: 'https://example.com' }), { status: 'unknown' });
 console.log('PASS: disabled MAX boundary, owner-confirmed nonce linking, authenticated private updates, safe account commands, filters/quiet hours, atomic delivery contract, no blind retry, provider host/header/TLS redirect guard. All transport calls are stubs.');
})().catch(error => { console.error(error); process.exitCode = 1; });
