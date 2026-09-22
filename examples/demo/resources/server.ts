// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=1505f1089581
import { companies, contacts, customers, deals, plans, purchases, securityEvents, vendors } from "@/db/schema";
import { companyResource, contactResource, customerResource, dealResource, planResource, purchaseResource, securityEventResource, vendorResource } from "./index";

export const resourceTables = {
  Company: { resource: companyResource, table: companies },
  Contact: { resource: contactResource, table: contacts },
  Customer: { resource: customerResource, table: customers },
  Deal: { resource: dealResource, table: deals },
  Plan: { resource: planResource, table: plans },
  Purchase: { resource: purchaseResource, table: purchases },
  SecurityEvent: { resource: securityEventResource, table: securityEvents },
  Vendor: { resource: vendorResource, table: vendors },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
