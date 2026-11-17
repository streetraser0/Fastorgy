const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../integrations/contracts/contracts.cjs');

const rub = kopecks => ({ currency: 'RUB', kopecks });
const NOW = Date.parse('2026-11-14T12:00:00.000Z');
const command = { version: 1, idempotencyKey: 'bid-command-00000001', lotId: 42, expectedLotRevision: 7, amount: rub('10000') };
const configuration = { state: 'ready', reviewReference: 'review:fixture', provider: 'tbank', productReference: 'UNCONNECTED_TEST_PRODUCT', maxHoldMinutes: 43200 + 1440 };
const grant = { allowed: true, operation: 'createHold', principalId: 'buyer:alice', lotId: 42, lotRevision: 7, sellerPrincipalId: 'seller:bank', startsAt: '2026-11-14T11:00:00.000Z', protectedEndsAt: '2026-12-14T12:00:00.000Z', settlementDeadline: '2026-12-15T12:00:00.000Z', availableAfterOtherHolds: rub('20000') };

async function rejected(promise, code) {
  await assert.rejects(promise, error => error instanceof C.ContractError && (!code || error.code === code));
}

(async () => {
  for (const value of ['-1', '+1', '01', '1.5', '1e2', '9007199254740992', '9'.repeat(50000)]) assert.throws(() => C.money(rub(value)), C.ContractError);
  assert.throws(() => C.money({ currency: 'USD', kopecks: '100' }), C.ContractError);
  assert.throws(() => C.money(rub('0')), C.ContractError);
  assert.deepEqual(C.money(rub('0'), true), rub('0'));
  assert(Object.isFrozen(C.validateBidCommand(command).amount));
  assert.throws(() => C.validateBidCommand({ ...command, ownerId: 'forged' }), C.ContractError);

  let calls = 0;
  await rejected(C.createBankAdapter({ execute() { calls++; } }).createHold(command, {}), 'integration-disabled');
  await rejected(C.createAssistantAdapter({ interpret() { calls++; } }).interpret('открой кабинет'), 'integration-disabled');
  assert.equal(calls, 0, 'disabled integrations never call provider or authorization callbacks');

  const result = job => ({ confirmed: true, operationId: 'bank:hold-1', principalId: job.principalId, lotId: job.command.lotId, lotRevision: job.command.expectedLotRevision, idempotencyKey: job.command.idempotencyKey, amount: job.command.amount, validUntil: job.coverageUntil, secretProviderResponse: 'MUST_NOT_ESCAPE' });
  const make = (changes = {}, config = configuration, execute = async job => { calls++; return result(job); }) => C.createBankAdapter({ configuration: config, clock: () => NOW, authorize: async () => ({ ...grant, ...changes }), execute });
  const saved = await make().createHold(command, {});
  assert.equal(saved.amount.kopecks, '10000');
  assert.equal(saved.validUntil, grant.settlementDeadline);
  assert.equal(saved.secretProviderResponse, undefined);
  const before = calls;
  for (const changes of [{ principalId: 'seller:bank' }, { lotRevision: 8 }, { allowed: false }, { sellerPrincipalId: undefined }, { availableAfterOtherHolds: rub('9999') }, { settlementDeadline: '2026-12-14T11:59:59.999Z' }]) await rejected(make(changes).createHold(command, {}));
  await rejected(make({}, { ...configuration, maxHoldMinutes: 7 * 1440 }).createHold(command, {}), 'coverage-not-supported');
  assert.equal(calls, before, 'own lot, stale revision, unconfirmed funds and insufficient coverage fail before bank work');
  await rejected(make({}, configuration, async () => { throw Error('SECRET_PROVIDER_TOKEN'); }).createHold(command, {}), 'outcome-unknown-reconcile-before-retry');
  for (const patch of [{ principalId: 'buyer:bob' }, { lotRevision: 6 }, { idempotencyKey: 'other-command-00001' }, { amount: rub('1') }, { confirmed: false }]) await rejected(make({}, configuration, async job => ({ ...result(job), ...patch })).createHold(command, {}), 'unconfirmed-provider-result');

  const referenced = { version: 1, idempotencyKey: 'settlement-command-01', lotId: 42, expectedLotRevision: 7, operationId: 'bank:hold-1' };
  let executions = 0;
  const financial = flags => C.createBankAdapter({ configuration, authorize: async (_context, operation) => ({ ...grant, operation, operationId: referenced.operationId, ...flags }), execute: async job => { executions++; return { ...result(job), operationId: referenced.operationId, amount: rub('10000'), status: 'settled' }; } });
  await rejected(financial({}).releaseHold(referenced, {}), 'forbidden');
  await rejected(financial({}).settle(referenced, {}), 'forbidden');
  await rejected(financial({ releaseAllowed: true, operationId: 'another:hold' }).releaseHold(referenced, {}), 'operation-not-authorized');
  assert.equal(executions, 0, 'neither release nor settlement can bypass the trusted coordinator state');
  assert.equal((await financial({ settlementAllowed: true, reservedAmount: rub('10000') }).settle(referenced, {})).amount.kopecks, '10000');
  await rejected(financial({ settlementAllowed: true, reservedAmount: rub('20000') }).settle(referenced, {}), 'unconfirmed-provider-result');

  const intent = C.validateAssistantIntent({ action: 'prepare_bid', lotId: 42, expectedLotRevision: 7, amount: rub('10000') });
  assert.equal(intent.requiresHumanConfirmation, true);
  for (const value of [{ action: 'pay', amount: rub('1') }, { action: 'commit_bid' }, { action: 'navigate', route: 'https://other.example' }, { action: 'search', query: 'дом', javascript: 'danger' }]) assert.throws(() => C.validateAssistantIntent(value), C.ContractError);
  const assistant = C.createAssistantAdapter({ configuration: { state: 'ready', reviewReference: 'fixture' }, interpret: async () => ({ action: 'navigate', route: 'cabinet' }) });
  assert.deepEqual(await assistant.interpret('открой кабинет'), { action: 'navigate', route: 'cabinet' });

  const identity = { subjectId: 'asset:42', subjectFingerprint: 'c'.repeat(64), sourceType: 'bank', ownerId: 'bank:owner', sellerId: 'bank:seller', publisherId: 'user:manager', sellerTenantId: 'tenant:bank', custodianId: 'yard:operator', mandateId: 'mandate:1', storage: { kind: 'own_network_yard', yardId: 'yard:13' } };
  const mandate = { id: 'mandate:1', publisherId: identity.publisherId, sellerId: identity.sellerId, tenantId: identity.sellerTenantId, canPublish: true, validUntil: '2099-01-01T00:00:00.000Z' };
  const authority = { principalId: identity.publisherId, tenantId: identity.sellerTenantId, roles: ['bank_manager'], assignedYards: [{ id: 'yard:13', custodianId: identity.custodianId }], verifiedMandates: [mandate], listingAuthority: { subjectId: identity.subjectId, subjectFingerprint: identity.subjectFingerprint, sourceType: identity.sourceType, ownerId: identity.ownerId, sellerId: identity.sellerId, sellerTenantId: identity.sellerTenantId } };
  assert.equal(C.validateListingIdentity(identity, authority).storage.yardId, 'yard:13');
  for (const kind of ['seller_external', 'third_party']) assert.equal(C.validateListingIdentity({ ...identity, custodianId: null, storage: { kind, locationRef: 'private:location' } }, authority).storage.kind, kind, 'custody in our network is voluntary and exact address need not be public');
  for (const proposed of [{ ...identity, subjectFingerprint: 'd'.repeat(64) }, { ...identity, sourceType: 'government' }, { ...identity, ownerId: 'other:owner' }, { ...identity, sellerTenantId: 'tenant:other' }, { ...identity, custodianId: 'other:custodian' }]) assert.throws(() => C.validateListingIdentity(proposed, authority), C.ContractError);
  assert.throws(() => C.validateListingIdentity(identity, { ...authority, roles: ['private_seller'] }), C.ContractError);
  assert.throws(() => C.validateListingIdentity(identity, { ...authority, verifiedMandates: [] }), C.ContractError);
  assert.throws(() => C.assertListingIdentityUnchanged({ ...identity, ownerId: 'other:owner' }, identity, { acceptedBidCount: 1 }), C.ContractError);
  assert.throws(() => C.assertListingIdentityUnchanged({ ...identity, storage: { kind: 'seller_external', address: 'changed' } }, identity, { finalized: true }), C.ContractError);

  const manifest = { version: 1, snapshotId: 'snapshot:1', createdAt: '2026-11-14T12:00:00.000Z', sourceCommit: 'a'.repeat(40), audience: 'custom', authGateway: 'required', dns: 'operator-controlled', environmentNames: ['BANK_API_KEY'], artifacts: ['source', 'database', 'media'].map((kind, index) => ({ kind, path: kind + '/archive-' + index, sha256: 'b'.repeat(64), snapshotId: 'snapshot:1' })) };
  assert.equal(C.validateRecoveryManifest(manifest).artifacts.length, 3);
  for (const patch of [{ audience: 'public' }, { authGateway: 'none' }, { environmentNames: ['BANK_API_KEY=secret'] }, { artifacts: manifest.artifacts.slice(1) }, { artifacts: manifest.artifacts.map((item, index) => index ? item : { ...item, path: '../secret' }) }, { artifacts: manifest.artifacts.map((item, index) => index ? item : { ...item, snapshotId: 'other' }) }]) assert.throws(() => C.validateRecoveryManifest({ ...manifest, ...patch }), C.ContractError);
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../integrations/contracts/schemas.json')));
  assert.equal(schema.$id, 'urn:fas-torgi:integration-contracts:v1');
  assert.equal(schema.$defs.authRequest.additionalProperties, false);
  assert.equal(schema.$defs.listingIdentity.properties.sourceType.enum.includes('government'), false);
  console.log('PASS: disabled integrations make no callbacks; exact RUB amounts, trusted revision/full coverage/result bindings, safe AI intents, tenant/mandate/custody identity and private consistent recovery manifests are validated. No live provider or ledger is claimed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
