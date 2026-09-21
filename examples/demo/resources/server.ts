// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=8f158e2f8a97
import { companies, contacts, customers, deals, plans, purchases, securityEvents } from "@/db/schema";
import { companyResource, contactResource, customerResource, dealResource, planResource, purchaseResource, securityEventResource } from "./index";

export const resourceTables = {
  Company: { resource: companyResource, table: companies },
  Contact: { resource: contactResource, table: contacts },
  Customer: { resource: customerResource, table: customers },
  Deal: { resource: dealResource, table: deals },
  Plan: { resource: planResource, table: plans },
  Purchase: { resource: purchaseResource, table: purchases },
  SecurityEvent: { resource: securityEventResource, table: securityEvents },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
