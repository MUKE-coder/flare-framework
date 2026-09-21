import { describe, expect, it } from "vitest";
import {
  checkoutPaid,
  currentPeriodEnd,
  grantsAccess,
  isLiveSubscription,
  randomLetters,
  shouldApplySubscription,
  subscriptionState,
  toSubscriptionStatus,
  type SubscriptionLike,
} from "../src/billing.js";

const sub = (overrides: Partial<SubscriptionLike> = {}): SubscriptionLike => ({
  id: "sub_1",
  status: "active",
  created: 1_700_000_000,
  items: { data: [{ current_period_end: 1_800_000_000, price: { id: "price_pro" } }] },
  ...overrides,
});

describe("subscription status", () => {
  it("maps Stripe statuses, folding incomplete_expired into canceled", () => {
    expect(toSubscriptionStatus("active")).toBe("active");
    expect(toSubscriptionStatus("paused")).toBe("paused");
    expect(toSubscriptionStatus("incomplete")).toBe("incomplete");
    expect(toSubscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(toSubscriptionStatus("something_new")).toBe("none");
  });

  it("separates 'has a subscription' from 'has access'", () => {
    expect(isLiveSubscription("paused")).toBe(true);
    expect(grantsAccess("paused")).toBe(false);
    expect(isLiveSubscription("past_due")).toBe(true);
    expect(grantsAccess("past_due")).toBe(true);
    for (const status of ["canceled", "unpaid", "none", null]) {
      expect(isLiveSubscription(status)).toBe(false);
      expect(grantsAccess(status)).toBe(false);
    }
  });
});

describe("subscriptionState", () => {
  it("reads the period end from subscription items (API 2025-03-31 and later)", () => {
    expect(currentPeriodEnd(sub())).toBe(1_800_000_000_000);
    expect(currentPeriodEnd(sub({ items: { data: [] } }))).toBeNull();
    const state = subscriptionState(sub());
    expect(state).toEqual({
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
      subscriptionEndsAt: new Date(1_800_000_000_000),
      cancelAtPeriodEnd: false,
      priceId: "price_pro",
    });
  });

  it("reports when a cancelling subscription ends, and when an ended one did", () => {
    expect(subscriptionState(sub({ cancel_at_period_end: true })).cancelAtPeriodEnd).toBe(true);
    const scheduled = subscriptionState(sub({ cancel_at: 1_750_000_000 }));
    expect(scheduled.cancelAtPeriodEnd).toBe(true);
    expect(scheduled.subscriptionEndsAt).toEqual(new Date(1_750_000_000_000));
    const ended = subscriptionState(sub({ status: "canceled", ended_at: 1_720_000_000 }));
    expect(ended.subscriptionStatus).toBe("canceled");
    expect(ended.subscriptionEndsAt).toEqual(new Date(1_720_000_000_000));
  });
});

describe("shouldApplySubscription", () => {
  it("always applies updates for the stored subscription, in any order", () => {
    const stored = { stripeSubscriptionId: "sub_1", subscriptionStatus: "canceled" };
    expect(shouldApplySubscription(stored, sub({ status: "active" }))).toBe(true);
    expect(shouldApplySubscription({ stripeSubscriptionId: null, subscriptionStatus: null }, sub())).toBe(true);
  });

  it("does not let a late event about an old ended subscription replace a live one", () => {
    const stored = { stripeSubscriptionId: "sub_new", subscriptionStatus: "active" };
    expect(shouldApplySubscription(stored, sub({ id: "sub_old", status: "canceled" }))).toBe(false);
  });

  it("lets a new live subscription replace an ended one", () => {
    const stored = { stripeSubscriptionId: "sub_old", subscriptionStatus: "canceled" };
    expect(shouldApplySubscription(stored, sub({ id: "sub_new", status: "active" }))).toBe(true);
  });
});

describe("helpers", () => {
  it("treats only unpaid checkout sessions as not yet paid", () => {
    expect(checkoutPaid({ payment_status: "paid" })).toBe(true);
    expect(checkoutPaid({ payment_status: "no_payment_required" })).toBe(true);
    expect(checkoutPaid({ payment_status: "unpaid" })).toBe(false);
  });

  it("makes 8 random lowercase letters for integration_identifier", () => {
    expect(randomLetters()).toMatch(/^[a-z]{8}$/);
    expect(randomLetters()).not.toBe(randomLetters());
  });
});
