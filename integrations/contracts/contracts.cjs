/* Server-only integration boundaries. No provider connection or financial ledger is implemented here. */
'use strict';

const MAX_KOPECKS = 9007199254740991n;
const ROUTES = new Set(['home', 'catalog', 'feed', 'favorites', 'cabinet', 'my_lots', 'my_bids', 'my_purchases', 'map', 'help']);
const BANK_OPERATIONS = new Set(['createHold', 'releaseHold', 'settle', 'readBalance', 'readStatus', 'verifyEvent']);

class ContractError extends Error {
  constructor(code) {
    super('Integration request rejected: ' + code);
    this.name = 'ContractError';
    this.code = code;
  }
}

function reject(code = 'invalid-contract') { throw new ContractError(code); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, required, optional = []) {
  if (!object(value) || required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) reject();
}
function id(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/.test(value)) reject('invalid-id');
  return value;
}
function integer(value, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) reject('invalid-integer');
  return value;
}
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) reject('invalid-time');
  return value;
}
function money(value, allowZero = false) {
  exact(value, ['currency', 'kopecks']);
  if (value.currency !== 'RUB' || typeof value.kopecks !== 'string' || !/^(?:0|[1-9]\d{0,15})$/.test(value.kopecks)) reject('invalid-money');
  const amount = BigInt(value.kopecks);
  if (amount > MAX_KOPECKS || (!allowZero && amount === 0n)) reject('invalid-money');
  return Object.freeze({ currency: 'RUB', kopecks: value.kopecks });
}
function envelope(value, extra = [], optional = []) {
  exact(value, ['version', 'idempotencyKey', 'lotId', 'expectedLotRevision', ...extra], optional);
  if (value.version !== 1 || typeof value.idempotencyKey !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(value.idempotencyKey)) reject('invalid-command');
  integer(value.lotId, 1);
  integer(value.expectedLotRevision);
  return value;
}

function validateBidCommand(value) {
  envelope(value, ['amount']);
  return Object.freeze({ ...value, amount: money(value.amount) });
}

function validateAssistantIntent(value) {
  if (!object(value)) reject('invalid-intent');
  if (value.action === 'navigate') {
    exact(value, ['action', 'route']);
    if (!ROUTES.has(value.route)) reject('invalid-intent');
  } else if (value.action === 'search') {
    exact(value, ['action', 'query']);
    if (typeof value.query !== 'string' || !value.query.trim() || value.query.length > 1000) reject('invalid-intent');
  } else if (value.action === 'status') {
    exact(value, ['action', 'kind'], ['lotId']);
    if (!['current_price', 'deadline', 'my_bids'].includes(value.kind)) reject('invalid-intent');
    if (value.lotId !== undefined) integer(value.lotId, 1);
  } else if (value.action === 'preferences') {
    exact(value, ['action', 'key', 'enabled']);
    if (!['outbid', 'newBidOwn', 'endingSoon', 'auctionEnded', 'matchingNew', 'priceDrop', 'spoken', 'quiet'].includes(value.key) || typeof value.enabled !== 'boolean') reject('invalid-intent');
  } else if (value.action === 'prepare_bid') {
    exact(value, ['action', 'lotId', 'expectedLotRevision', 'amount']);
    integer(value.lotId, 1); integer(value.expectedLotRevision);
    return Object.freeze({ ...value, amount: money(value.amount), requiresHumanConfirmation: true });
  } else reject('invalid-intent');
  return Object.freeze({ ...value });
}

function requireReady(configuration, callback) {
  if (configuration?.state !== 'ready' || typeof configuration.reviewReference !== 'string' || !configuration.reviewReference.trim() || typeof callback !== 'function') reject('integration-disabled');
}

function createAssistantAdapter({ configuration = { state: 'disabled' }, interpret } = {}) {
  const settings = Object.freeze({ ...configuration });
  return Object.freeze({
    async interpret(message) {
      requireReady(settings, interpret);
      if (typeof message !== 'string' || !message.trim() || message.length > 1000) reject('invalid-message');
      let result;
      try { result = await interpret({ message, language: 'ru' }); }
      catch { reject('assistant-unavailable'); }
      return validateAssistantIntent(result);
    }
  });
}

function createBankAdapter({ configuration = { state: 'disabled' }, authorize, execute, clock = Date.now } = {}) {
  const settings = Object.freeze({ ...configuration });
  async function invoke(operation, command, context) {
    if (!BANK_OPERATIONS.has(operation)) reject('invalid-operation');
    requireReady(settings, execute);
    if (typeof authorize !== 'function' || settings.provider !== 'tbank' || typeof settings.productReference !== 'string' || !settings.productReference.trim() || settings.productReference.length > 200) reject('integration-disabled');
    const original = operation === 'createHold' ? validateBidCommand(command) : envelope(command, operation === 'readBalance' ? [] : ['operationId']);
    if (operation !== 'createHold' && operation !== 'readBalance') id(command.operationId);
    const request = Object.freeze({ ...original });
    let grant;
    try { grant = await authorize(context, operation, request); }
    catch { reject('authorization-unavailable'); }
    if (!object(grant) || grant.operation !== operation || grant.allowed !== true) reject('forbidden');
    const principalId = id(grant.principalId);
    if (grant.lotId !== request.lotId || grant.lotRevision !== request.expectedLotRevision) reject('stale-lot');
    if (request.operationId && grant.operationId !== request.operationId) reject('operation-not-authorized');
    if (operation === 'releaseHold' && grant.releaseAllowed !== true || operation === 'settle' && grant.settlementAllowed !== true) reject('forbidden');
    let coverageUntil;
    if (operation === 'createHold') {
      id(grant.sellerPrincipalId);
      if (grant.sellerPrincipalId === principalId) reject('own-lot');
      const now = integer(clock(), 1), starts = Date.parse(utc(grant.startsAt));
      const protectedEnd = Date.parse(utc(grant.protectedEndsAt));
      const settlementEnd = Date.parse(utc(grant.settlementDeadline));
      if (starts > now || protectedEnd <= now || settlementEnd < protectedEnd) reject('auction-unavailable');
      const available = money(grant.availableAfterOtherHolds, true);
      if (BigInt(available.kopecks) < BigInt(request.amount.kopecks)) reject('insufficient-confirmed-funds');
      integer(settings.maxHoldMinutes, 1);
      if (settings.maxHoldMinutes > 60 * 24 * 365) reject('invalid-coverage-configuration');
      if (settlementEnd - now > settings.maxHoldMinutes * 60000) reject('coverage-not-supported');
      coverageUntil = new Date(settlementEnd).toISOString();
    }
    let result;
    try {
      result = await execute(Object.freeze({ operation, principalId, command: request, ...(coverageUntil ? { coverageUntil } : {}) }));
    } catch { reject('outcome-unknown-reconcile-before-retry'); }
    if (!object(result) || result.confirmed !== true || result.principalId !== principalId || result.lotId !== request.lotId || result.lotRevision !== request.expectedLotRevision || result.idempotencyKey !== request.idempotencyKey) reject('unconfirmed-provider-result');
    id(result.operationId);
    if (request.operationId && result.operationId !== request.operationId) reject('unconfirmed-provider-result');
    if (operation === 'createHold') {
      const confirmed = money(result.amount);
      if (confirmed.kopecks !== request.amount.kopecks || Date.parse(utc(result.validUntil)) < Date.parse(coverageUntil)) reject('unconfirmed-provider-result');
      return Object.freeze({ confirmed: true, operationId: result.operationId, principalId, lotId: request.lotId, amount: confirmed, validUntil: result.validUntil });
    }
    if (operation === 'readBalance') return Object.freeze({ confirmed: true, operationId: result.operationId, principalId, lotId: request.lotId, availableAfterOtherHolds: money(result.availableAfterOtherHolds, true) });
    if (operation === 'settle') {
      const settled = money(result.amount), reserved = money(grant.reservedAmount);
      if (settled.kopecks !== reserved.kopecks) reject('unconfirmed-provider-result');
      return Object.freeze({ confirmed: true, operationId: result.operationId, principalId, lotId: request.lotId, amount: settled });
    }
    if (operation === 'readStatus') {
      if (!['pending', 'confirmed', 'released', 'settled', 'failed', 'unknown'].includes(result.status)) reject('unconfirmed-provider-result');
      return Object.freeze({ confirmed: true, operationId: result.operationId, principalId, lotId: request.lotId, status: result.status });
    }
    // Do not forward arbitrary provider payloads or sensitive fields.
    return Object.freeze({ confirmed: true, operationId: result.operationId, principalId, lotId: request.lotId });
  }
  return Object.freeze(Object.fromEntries([...BANK_OPERATIONS].map(operation => [operation, (command, context) => invoke(operation, command, context)])));
}

function validateListingIdentity(value, grant) {
  exact(value, ['subjectId', 'subjectFingerprint', 'sourceType', 'ownerId', 'sellerId', 'publisherId', 'sellerTenantId', 'custodianId', 'storage'], ['mandateId']);
  if (!['bank', 'private', 'partner'].includes(value.sourceType)) reject('government-and-unsupported-sources-disabled');
  for (const field of ['subjectId', 'ownerId', 'sellerId', 'publisherId', 'sellerTenantId']) id(value[field]);
  if (typeof value.subjectFingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.subjectFingerprint)) reject('invalid-subject-fingerprint');
  if (value.custodianId !== null) id(value.custodianId);
  if (!object(grant) || grant.principalId !== value.publisherId || !Array.isArray(grant.roles)) reject('forbidden');
  const authorityFields = ['subjectId', 'subjectFingerprint', 'sourceType', 'ownerId', 'sellerId', 'sellerTenantId'];
  if (!object(grant.listingAuthority) || authorityFields.some(key => grant.listingAuthority[key] !== value[key])) reject('listing-not-authorized');
  const role = { bank: 'bank_manager', private: 'private_seller', partner: 'partner_manager' }[value.sourceType];
  if (!grant.roles.includes(role) && !grant.roles.includes('yard_manager')) reject('forbidden');
  if (value.sellerTenantId !== grant.tenantId && !grant.roles.includes('yard_manager')) reject('tenant-mismatch');
  exact(value.storage, ['kind'], ['yardId', 'address', 'locationRef']);
  if (value.storage.address !== undefined && (typeof value.storage.address !== 'string' || !value.storage.address.trim() || value.storage.address.length > 1000)) reject('invalid-storage');
  if (value.storage.kind === 'own_network_yard') {
    id(value.storage.yardId);
    const yard = Array.isArray(grant.assignedYards) && grant.assignedYards.find(row => row.id === value.storage.yardId && row.custodianId === value.custodianId);
    if (!yard) reject('yard-not-assigned');
    if (value.custodianId === null) reject('custodian-required');
  } else if (['seller_external', 'third_party'].includes(value.storage.kind)) {
    if (value.storage.yardId !== undefined || !value.storage.address && !value.storage.locationRef) reject('invalid-storage');
  } else reject('invalid-storage');
  if (value.storage.locationRef !== undefined) id(value.storage.locationRef);
  if (value.publisherId !== value.sellerId || value.sellerTenantId !== grant.tenantId) {
    id(value.mandateId);
    const mandate = Array.isArray(grant.verifiedMandates) && grant.verifiedMandates.find(row => row.id === value.mandateId && row.publisherId === value.publisherId && row.sellerId === value.sellerId && row.tenantId === value.sellerTenantId && row.canPublish === true && Number.isFinite(Date.parse(row.validUntil)) && Date.parse(row.validUntil) > Date.now());
    if (!mandate) reject('verified-mandate-required');
  }
  return Object.freeze({ ...value, storage: Object.freeze({ ...value.storage }) });
}

function assertListingIdentityUnchanged(proposed, existing, { acceptedBidCount = 0, finalized = false } = {}) {
  integer(acceptedBidCount);
  if (typeof finalized !== 'boolean') reject('invalid-result-state');
  if (acceptedBidCount === 0 && !finalized) return true;
  const fields = ['subjectId', 'subjectFingerprint', 'sourceType', 'ownerId', 'sellerId', 'publisherId', 'sellerTenantId', 'custodianId', 'mandateId'];
  if (!object(proposed) || !object(existing) || fields.some(key => (proposed[key] ?? null) !== (existing[key] ?? null))) reject('subject-locked');
  for (const key of ['kind', 'yardId', 'address', 'locationRef']) if ((proposed.storage?.[key] ?? null) !== (existing.storage?.[key] ?? null)) reject('subject-locked');
  return true;
}

function safePath(value) {
  if (typeof value !== 'string' || !value || value.length > 300 || value.startsWith('/') || /[\\\x00-\x1f?#:%]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) reject('invalid-artifact-path');
  return value;
}
function validateRecoveryManifest(value) {
  exact(value, ['version', 'snapshotId', 'createdAt', 'sourceCommit', 'audience', 'authGateway', 'dns', 'environmentNames', 'artifacts']);
  if (value.version !== 1 || !['private', 'custom'].includes(value.audience)) reject('unsafe-recovery-manifest');
  id(value.snapshotId); utc(value.createdAt);
  if (typeof value.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceCommit) || value.authGateway !== 'required' || value.dns !== 'operator-controlled') reject('unsafe-recovery-manifest');
  if (!Array.isArray(value.environmentNames) || value.environmentNames.length > 100 || new Set(value.environmentNames).size !== value.environmentNames.length || value.environmentNames.some(name => typeof name !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(name))) reject('invalid-environment-names');
  if (!Array.isArray(value.artifacts) || value.artifacts.length < 3 || value.artifacts.length > 10000) reject('invalid-artifacts');
  const paths = new Set(), kinds = new Set();
  const artifacts = value.artifacts.map(artifact => {
    exact(artifact, ['kind', 'path', 'sha256', 'snapshotId']);
    if (!['source', 'database', 'media'].includes(artifact.kind) || artifact.snapshotId !== value.snapshotId || typeof artifact.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(artifact.sha256)) reject('invalid-artifacts');
    safePath(artifact.path);
    if (paths.has(artifact.path)) reject('duplicate-artifact');
    paths.add(artifact.path); kinds.add(artifact.kind);
    return Object.freeze({ ...artifact });
  });
  if (kinds.size !== 3) reject('incomplete-snapshot');
  return Object.freeze({ ...value, artifacts: Object.freeze(artifacts), environmentNames: Object.freeze([...value.environmentNames]) });
}

module.exports = Object.freeze({ ContractError, money, validateBidCommand, validateAssistantIntent, createAssistantAdapter, createBankAdapter, validateListingIdentity, assertListingIdentityUnchanged, validateRecoveryManifest });
