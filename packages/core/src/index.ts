export const FLARE_VERSION = "0.1.0";

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
  type StorageOptions,
  type UploadUrlOptions,
  type ReadUrlOptions,
} from "./storage.js";
export { sniffMatches, SNIFF_BYTES } from "./sniff.js";
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
export { defineSeed, type Seed, type SeedContext } from "./seed.js";
