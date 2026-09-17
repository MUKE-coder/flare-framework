// Drizzle relations for every resource (maintained by flare gen).
// generated:start hash=492ea789cf44
import { relations } from "drizzle-orm";
import { companies } from "./schema/companies";
import { contacts } from "./schema/contacts";
import { deals } from "./schema/deals";

export const companiesRelations = relations(companies, ({ many }) => ({
  deals: many(deals, { relationName: "deals_company_id" }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  company: one(companies, { fields: [deals.companyId], references: [companies.id], relationName: "deals_company_id" }),
  owner: one(contacts, { fields: [deals.ownerId], references: [contacts.id], relationName: "deals_owner_id" }),
}));
// generated:end
