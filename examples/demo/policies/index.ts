// Registry of every resource policy (maintained by flare gen policy).
// generated:start hash=ecbf987ee4d7
import customerPolicy from "./customer.policy";
import dealPolicy from "./deal.policy";
import planPolicy from "./plan.policy";
import purchasePolicy from "./purchase.policy";

export const policies = {
  Customer: customerPolicy,
  Deal: dealPolicy,
  Plan: planPolicy,
  Purchase: purchasePolicy,
} as const;
// generated:end
