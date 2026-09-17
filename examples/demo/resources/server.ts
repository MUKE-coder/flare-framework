// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=8c27155fc46a
import { companies, contacts, deals } from "@/db/schema";
import { companyResource, contactResource, dealResource } from "./index";

export const resourceTables = {
  Company: { resource: companyResource, table: companies },
  Contact: { resource: contactResource, table: contacts },
  Deal: { resource: dealResource, table: deals },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
