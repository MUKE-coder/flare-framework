// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=2decf729c9b6
import { companies, contacts, customers, deals, plans, purchases } from "@/db/schema";
import { companyResource, contactResource, customerResource, dealResource, planResource, purchaseResource } from "./index";

export const resourceTables = {
  Company: { resource: companyResource, table: companies },
  Contact: { resource: contactResource, table: contacts },
  Customer: { resource: customerResource, table: customers },
  Deal: { resource: dealResource, table: deals },
  Plan: { resource: planResource, table: plans },
  Purchase: { resource: purchaseResource, table: purchases },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
