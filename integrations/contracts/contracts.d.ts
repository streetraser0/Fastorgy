/** Server-side contracts, not implementations of authentication, bank APIs or a ledger. */
export type Money = Readonly<{ currency: 'RUB'; kopecks: string }>;
export type Command = Readonly<{ version: 1; idempotencyKey: string; lotId: number; expectedLotRevision: number }>;
export type BidCommand = Command & Readonly<{ amount: Money }>;
export type ReferencedCommand = Command & Readonly<{ operationId: string }>;
export type BankOperation = 'createHold' | 'releaseHold' | 'settle' | 'readBalance' | 'readStatus' | 'verifyEvent';

export type BankConfiguration = Readonly<{
  state: 'disabled' | 'ready';
  reviewReference?: string;
  provider?: 'tbank';
  productReference?: string;
  maxHoldMinutes?: number;
}>;

/** Produced by trusted server policy from a confirmed session and canonical database state. Never request-body data. */
export type BankGrant = Readonly<{
  allowed: boolean;
  operation: BankOperation;
  principalId: string;
  lotId: number;
  lotRevision: number;
  sellerPrincipalId?: string;
  startsAt?: string;
  protectedEndsAt?: string;
  settlementDeadline?: string;
  availableAfterOtherHolds?: Money;
  operationId?: string;
  releaseAllowed?: boolean;
  settlementAllowed?: boolean;
  reservedAmount?: Money;
}>;

export type ConfirmedBankResult = Readonly<{
  confirmed: true;
  operationId: string;
  principalId: string;
  lotId: number;
  lotRevision: number;
  idempotencyKey: string;
  amount?: Money;
  availableAfterOtherHolds?: Money;
  validUntil?: string;
  status?: 'pending' | 'confirmed' | 'released' | 'settled' | 'failed' | 'unknown';
}>;

/** The executor must implement persistent idempotency, atomic ledger transitions and bank reconciliation. */
export function createBankAdapter(options?: {
  configuration?: BankConfiguration;
  authorize?: (context: unknown, operation: BankOperation, command: Command) => Promise<BankGrant>;
  execute?: (job: Readonly<{ operation: BankOperation; principalId: string; command: Command; coverageUntil?: string }>) => Promise<ConfirmedBankResult>;
  clock?: () => number;
}): Readonly<Record<BankOperation, (command: Command | BidCommand | ReferencedCommand, context: unknown) => Promise<object>>>;

export type AssistantIntent =
  | Readonly<{ action: 'navigate'; route: 'home' | 'catalog' | 'feed' | 'favorites' | 'cabinet' | 'my_lots' | 'my_bids' | 'my_purchases' | 'map' | 'help' }>
  | Readonly<{ action: 'search'; query: string }>
  | Readonly<{ action: 'status'; kind: 'current_price' | 'deadline' | 'my_bids'; lotId?: number }>
  | Readonly<{ action: 'preferences'; key: 'outbid' | 'newBidOwn' | 'endingSoon' | 'auctionEnded' | 'matchingNew' | 'priceDrop' | 'spoken' | 'quiet'; enabled: boolean }>
  | Readonly<{ action: 'prepare_bid'; lotId: number; expectedLotRevision: number; amount: Money }>;
export type ValidatedAssistantIntent = AssistantIntent | Readonly<{ action: 'prepare_bid'; lotId: number; expectedLotRevision: number; amount: Money; requiresHumanConfirmation: true }>;
export function createAssistantAdapter(options?: {
  configuration?: Readonly<{ state: 'disabled' | 'ready'; reviewReference?: string }>;
  interpret?: (input: Readonly<{ message: string; language: 'ru' }>) => Promise<AssistantIntent>;
}): Readonly<{ interpret(message: string): Promise<ValidatedAssistantIntent> }>;

export type StorageLocation = Readonly<{
  kind: 'own_network_yard' | 'seller_external' | 'third_party';
  yardId?: string;
  address?: string;
  locationRef?: string;
}>;
export type ListingIdentity = Readonly<{
  subjectId: string;
  subjectFingerprint: string;
  sourceType: 'bank' | 'private' | 'partner';
  ownerId: string;
  sellerId: string;
  publisherId: string;
  sellerTenantId: string;
  custodianId: string | null;
  mandateId?: string;
  storage: StorageLocation;
}>;
export type ListingGrant = Readonly<{
  principalId: string;
  tenantId: string;
  roles: readonly ('bank_manager' | 'private_seller' | 'partner_manager' | 'yard_manager')[];
  listingAuthority: Pick<ListingIdentity, 'subjectId' | 'subjectFingerprint' | 'sourceType' | 'ownerId' | 'sellerId' | 'sellerTenantId'>;
  assignedYards?: readonly Readonly<{ id: string; custodianId: string }>[];
  verifiedMandates?: readonly Readonly<{ id: string; publisherId: string; sellerId: string; tenantId: string; canPublish: true; validUntil: string }>[];
}>;
export type LegalAcceptance = Readonly<{ version: string; acceptedAt: string }>;
export type AuthRequest = Readonly<{ phone: string; regionCode: string; agreementAcceptance: LegalAcceptance; personalDataConsent: LegalAcceptance & { purpose: 'phone-auth' } }>;
export type AuthVerify = Readonly<{ challengeId: string; code: string; agreementAcceptance: LegalAcceptance; personalDataConsent: LegalAcceptance & { purpose: 'phone-auth' } }>;
export type RecoveryManifest = Readonly<{
  version: 1;
  snapshotId: string;
  createdAt: string;
  sourceCommit: string;
  audience: 'private' | 'custom';
  authGateway: 'required';
  dns: 'operator-controlled';
  environmentNames: readonly string[];
  artifacts: readonly Readonly<{ kind: 'source' | 'database' | 'media'; path: string; sha256: string; snapshotId: string }>[];
}>;
export function validateListingIdentity(value: ListingIdentity, trustedGrant: ListingGrant): ListingIdentity;
export function assertListingIdentityUnchanged(proposed: ListingIdentity, existing: ListingIdentity, serverState?: { acceptedBidCount?: number; finalized?: boolean }): true;
export function money(value: Money, allowZero?: boolean): Money;
export function validateBidCommand(value: BidCommand): BidCommand;
export function validateAssistantIntent(value: AssistantIntent): ValidatedAssistantIntent;
export function validateRecoveryManifest(value: RecoveryManifest): RecoveryManifest;
export class ContractError extends Error { readonly code: string; }
