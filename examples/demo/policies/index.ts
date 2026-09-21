// Registry of every resource policy (maintained by flare gen policy).
// generated:start hash=cd6fc37b3995
import customerPolicy from "./customer.policy";
import dealPolicy from "./deal.policy";
import planPolicy from "./plan.policy";
import purchasePolicy from "./purchase.policy";
import securityEventPolicy from "./security-event.policy";

export const policies = {
  Customer: customerPolicy,
  Deal: dealPolicy,
  Plan: planPolicy,
  Purchase: purchasePolicy,
  SecurityEvent: securityEventPolicy,
} as const;
// generated:end
