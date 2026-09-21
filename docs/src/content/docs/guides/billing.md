---
title: Billing (Stripe)
description: "Subscriptions, plan changes, cancellation and one-time purchases with Stripe."
---

`flare gen billing` adds Stripe billing to an app: subscription plans with
upgrades, downgrades and cancellation, plus one-time purchases. Payment pages
are Stripe-hosted (Checkout and the Customer Portal), so no card data ever
touches your app.

```sh
npx flare gen billing --provider stripe --mode subscriptions
```

`--mode subscriptions` is the only mode, and it includes one-time checkout.

## What it generates

| Resource | Holds |
| --- | --- |
| `Plan` | One row per Stripe Price. A monthly or yearly price is a subscription plan; a one-time price is something to buy once (`interval` empty). |
| `Customer` | Who pays: the Stripe customer and subscription ids, `subscriptionStatus`, `subscriptionEndsAt`, `cancelAtPeriodEnd` and the current `planId`. |
| `Purchase` | One row per one-time Checkout, keyed by its session. |

If the app already has a `Customer` resource, the billing fields are added to
its fields block and its own fields are kept. A hand-edited block is refused
unless you pass `--force`.

Policies make billing records admin-only for writes: `Customer` and
`Purchase` can be read by admin and staff; `Plan` by any signed-in user.
Subscription state therefore only changes through the signed webhook, never
through the REST API. You can edit the generated policy files.

It also generates:

- `lib/stripe.ts`: the Stripe client, customer linking, and the webhook sync
- `lib/billing.ts`: what the billing page reads
- `app/api/billing/checkout`, `app/api/billing/portal`, `app/api/webhooks/stripe`
- `components/billing/billing-button.tsx` and `billing-portal-button.tsx`
  (`<BillingPortalButton>`)
- `app/dashboard/billing/page.tsx`: subscribe, switch plan, manage/cancel, buy once
- a migration for the three tables

## Setup

1. **Keys.** Put a Stripe test key in `.dev.vars` as `STRIPE_SECRET_KEY`.
   Prefer a restricted key (`rk_test_…`) with write access to Customers,
   Checkout Sessions and the Customer portal, and read access to
   Subscriptions, Products and Prices. Never commit keys; in production run
   `wrangler secret put STRIPE_SECRET_KEY`.
2. **Tables.** `npx flare migrate` (and `--remote` for production).
3. **Catalog.** Create **one Product per plan** in Stripe, with a price for
   each billing variant (monthly, yearly, one-time). Give each Product the
   metadata `flare_app=<your app's package name>`. Optionally add `slug` (the
   plan's URL name) and `sort` (display order).
4. **Sync.** `npx flare billing:sync-plans` (add `--remote` for production).
   It imports only this app's tagged Products, so several apps can share one
   Stripe account. `--all` imports every active Product.
5. **Webhook.** Point a Stripe webhook endpoint at
   `https://<your app>/api/webhooks/stripe` with these events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`.
   Store its signing secret with `wrangler secret put STRIPE_WEBHOOK_SECRET`.
   Locally, `stripe listen --forward-to localhost:8787/api/webhooks/stripe`
   prints a secret for `.dev.vars`.

Webhooks are required, not optional. Renewals, failed payments and
cancellations all happen after checkout, and the webhook is the only way the
app learns about them.

## How it behaves

**Checkout** takes a plan slug, never a raw Stripe price, so a client can't
pay for an arbitrary price. The plan decides the mode: a recurring price
starts a subscription, a one-time price a payment. A customer who already has
a subscription is refused a second one (409) and changes plans instead.
Checkout shows whatever payment methods are enabled in your Stripe dashboard.

**Plan changes** open the Customer Portal's confirmation page for the chosen
plan. Stripe shows the prorated amount and changes the existing
subscription, so switching never charges twice. `billing:sync-plans`
maintains a portal configuration for this app that allows switching between
its synced plans and cancelling at the end of the period.

**The webhook** verifies Stripe's signature with the Web Crypto API (Workers
has no synchronous HMAC), so forged, tampered and stale events are refused.
Each event re-fetches the subscription or session from Stripe instead of
trusting the payload, so duplicate and out-of-order deliveries all end at
the same, current state. A late event about an old, ended subscription can't
replace a newer live one. These rules live in `@flaredev/core` (`billing.ts`)
and are unit-tested.

**Statuses.** `subscriptionStatus` is one of `none`, `incomplete`,
`trialing`, `active`, `past_due`, `paused`, `canceled` or `unpaid`. Use
`grantsAccess(status)` from `@flaredev/core` to decide whether paid features are
on (active, trialing, and past_due while Stripe retries).
`isLiveSubscription(status)` tells you whether the customer still has a
subscription to manage rather than buy again.

**Cancelling** in the portal cancels at the end of the period: the status
stays `active` and the billing page shows "ends on …". When the period ends,
Stripe sends `customer.subscription.deleted` and the status becomes
`canceled`.

**One-time purchases** create a `Purchase` marked `paid` once the payment has
settled. That's immediately for cards, or later for delayed payment methods
through `checkout.session.async_payment_succeeded`.

## Verified

`scripts/e2e-billing-stripe.mjs` runs the whole loop against a deployed app
and a Stripe test account: subscribe with the 4242 test card, upgrade in the
portal, cancel in the portal, the subscription ending, and a one-time
purchase. After each step it checks both the generated page and Stripe's own
records. `scripts/e2e-billing-offline.mjs` covers the policies, webhook
signatures and the page without a Stripe account.

:::note
If you charge customers in the US or EU, look at [Stripe
Tax](https://docs.stripe.com/billing/taxes/collect-taxes) before launch.
Flare doesn't enable `automatic_tax`: Stripe collects no tax until your
account has an active tax registration, even with it turned on.
:::
