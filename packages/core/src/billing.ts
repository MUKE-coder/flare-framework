/**
 * Billing decisions shared by the code `flare gen billing` writes into an app.
 *
 * Kept here, free of the Stripe SDK and the database, so the rules that decide
 * what a customer has paid for are unit-tested once instead of living only in
 * generated templates. The shapes below are the minimal subset of Stripe's
 * objects the rules read.
 */

/** Subscription states a Customer row can hold. */
export const SUBSCRIPTION_STATUSES = [
  "none",
  "incomplete",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "unpaid",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** States in which the customer still has a subscription that may bill or be resumed. */
const LIVE: ReadonlySet<SubscriptionStatus> = new Set(["incomplete", "trialing", "active", "past_due", "paused"]);

/** Whether a status still counts as "has a subscription" (so a second one must not be started). */
export const isLiveSubscription = (status: string | null | undefined): boolean =>
  LIVE.has((status ?? "none") as SubscriptionStatus);

/** Whether a status grants access to paid features. past_due keeps access while Stripe retries. */
export const grantsAccess = (status: string | null | undefined): boolean =>
  status === "active" || status === "trialing" || status === "past_due";

/** Map a Stripe subscription status onto the app's statuses. */
export function toSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  if (stripeStatus === "incomplete_expired") return "canceled";
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(stripeStatus) ? (stripeStatus as SubscriptionStatus) : "none";
}

/** The fields of a Stripe Subscription these rules read. */
export interface SubscriptionLike {
  id: string;
  status: string;
  created: number;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  ended_at?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null; price?: { id: string } | null }> } | null;
}

/**
 * When the current paid period ends, in ms. On API versions from 2025-03-31
 * (basil) onward the period lives on subscription items, not the subscription.
 */
export function currentPeriodEnd(subscription: SubscriptionLike): number | null {
  const ends = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  return ends.length ? Math.max(...ends) * 1000 : null;
}

/** The subscription's (first) price, which maps it to a Plan row. */
export const subscriptionPriceId = (subscription: SubscriptionLike): string | null =>
  subscription.items?.data?.[0]?.price?.id ?? null;

/** The customer-facing subscription state, derived from a freshly fetched Subscription. */
export interface SubscriptionState {
  stripeSubscriptionId: string;
  subscriptionStatus: SubscriptionStatus;
  /** Renewal date while active; the date access ends when cancelling or ended. */
  subscriptionEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  priceId: string | null;
}

export function subscriptionState(subscription: SubscriptionLike): SubscriptionState {
  const status = toSubscriptionStatus(subscription.status);
  const ended = subscription.ended_at ? subscription.ended_at * 1000 : null;
  const scheduled = subscription.cancel_at ? subscription.cancel_at * 1000 : null;
  const end = status === "canceled" ? (ended ?? currentPeriodEnd(subscription)) : (scheduled ?? currentPeriodEnd(subscription));
  return {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: status,
    subscriptionEndsAt: end ? new Date(end) : null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end) || scheduled !== null,
    priceId: subscriptionPriceId(subscription),
  };
}

/**
 * Whether a subscription's state may overwrite what a Customer row holds.
 *
 * Handlers always re-fetch the subscription from Stripe, so the state they write
 * is current and order no longer matters for a single subscription. What remains
 * is a customer with more than one: a late event about an old, ended subscription
 * must not replace a newer live one. So a different subscription only takes over
 * when it is live itself, or when the stored one no longer is.
 */
export function shouldApplySubscription(
  stored: { stripeSubscriptionId: string | null; subscriptionStatus: string | null },
  incoming: SubscriptionLike,
): boolean {
  if (!stored.stripeSubscriptionId || stored.stripeSubscriptionId === incoming.id) return true;
  return isLiveSubscription(toSubscriptionStatus(incoming.status)) || !isLiveSubscription(stored.subscriptionStatus);
}

/** A Checkout Session's payment is settled (card now, or a delayed method that has succeeded). */
export const checkoutPaid = (session: { payment_status: string }): boolean => session.payment_status !== "unpaid";

/** `8 random lowercase letters`, the suffix Stripe asks for on `integration_identifier`. */
export function randomLetters(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => String.fromCharCode(97 + (byte % 26))).join("");
}
