import { env } from "cloudflare:workers";
import { createMailer, renderTransactionalEmail, type TransactionalEmail } from "@flaredev/core";

/**
 * Transactional email via Resend.
 *
 * Without RESEND_API_KEY (e.g. local dev) emails are printed to the console
 * instead of sent. MAIL_FROM must use a domain verified in Resend. The fallback
 * sandbox sender only delivers to your own Resend account address.
 */
export const mailer = createMailer({
  apiKey: env.RESEND_API_KEY,
  from: env.MAIL_FROM || "shop <onboarding@resend.dev>",
});

/**
 * Render and send a transactional email. Resolves to `{ data, error }` and never throws for API errors.
 *
 *   const { error } = await sendTransactionalEmail({
 *     to: user.email,
 *     subject: "Your order has shipped",
 *     heading: "On its way",
 *     paragraphs: [`Order #${order.id} left our warehouse today.`],
 *     action: { label: "Track order", url: `https://example.com/orders/${order.id}` },
 *     idempotencyKey: `order-shipped/${order.id}`,
 *   });
 */
export async function sendTransactionalEmail({
  to,
  subject,
  idempotencyKey,
  ...content
}: Omit<TransactionalEmail, "appName"> & { to: string | string[]; subject: string; idempotencyKey?: string }) {
  const { html, text } = renderTransactionalEmail({ appName: "shop", ...content });
  return mailer.send({ to, subject, html, text, idempotencyKey });
}
