export const FLARE_VERSION = "0.11.0";

export { hashPassword, verifyPassword, PBKDF2_ITERATIONS } from "./password.js";
export { importSigningKey, signToken, verifyToken } from "./signing.js";
export {
  createMailer,
  renderTransactionalEmail,
  type Mailer,
  type MailerOptions,
  type MailMessage,
  type MailResult,
  type TransactionalEmail,
} from "./mail.js";
export {
  createStorage,
  createObjectKey,
  matchesContentType,
  type Storage,
  type StorageBucket,
  // A driver in lib/storage/ returns one of these from `get`, so it has to be nameable
  // from outside: writing a bucket is the supported way to add a provider.
  type StorageObjectBody,
  type StorageOptions,
  type UploadUrlOptions,
  type ReadUrlOptions,
} from "./storage.js";
export { sniffMatches, SNIFF_BYTES } from "./sniff.js";
// Rate limiting per resource and action.
export {
  fixedWindow,
  parseRate,
  rateFor,
  rateLimitKey,
  ratesIn,
  RateSyntaxError,
  type Rate,
  type RateLimitConfig,
  type RateLimitDecision,
  type RateLimitedAction,
  type RateLimitStore,
} from "./rate-limit.js";
// One error envelope for the whole API. In the main entry rather than the server one
// because the copied engine reads it, and the engine never imports @flaredev/core/server.
export {
  ISSUE_CODES,
  PROBLEM_CODES,
  problemResponse,
  wantsJson,
  type IssueCode,
  type ProblemBody,
  type ProblemCode,
  type ProblemIssue,
} from "./problem.js";
export {
  SUBSCRIPTION_STATUSES,
  checkoutPaid,
  currentPeriodEnd,
  grantsAccess,
  isLiveSubscription,
  randomLetters,
  shouldApplySubscription,
  subscriptionPriceId,
  subscriptionState,
  toSubscriptionStatus,
  type SubscriptionLike,
  type SubscriptionState,
  type SubscriptionStatus,
} from "./billing.js";
export * from "./resource/index.js";
export {
  defineSeed,
  credentialUserRows,
  type Seed,
  type SeedContext,
  type InsertMany,
  type SeedUser,
  type SeedUserInput,
  type CredentialUserRows,
} from "./seed.js";
export { createFake, fake, type Fake } from "./fake.js";
