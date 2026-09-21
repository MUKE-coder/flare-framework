// Drizzle relations for every resource (maintained by flare gen).
// generated:start hash=da59e9da0783
import { relations } from "drizzle-orm";
import { companies } from "./schema/companies";
import { contacts } from "./schema/contacts";
import { customers } from "./schema/customers";
import { deals } from "./schema/deals";
import { plans } from "./schema/plans";
import { purchases } from "./schema/purchases";

export const companiesRelations = relations(companies, ({ many }) => ({
  deals: many(deals, { relationName: "deals_company_id" }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  plan: one(plans, { fields: [customers.planId], references: [plans.id], relationName: "customers_plan_id" }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  company: one(companies, { fields: [deals.companyId], references: [companies.id], relationName: "deals_company_id" }),
  owner: one(contacts, { fields: [deals.ownerId], references: [contacts.id], relationName: "deals_owner_id" }),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  customer: one(customers, { fields: [purchases.customerId], references: [customers.id], relationName: "purchases_customer_id" }),
  plan: one(plans, { fields: [purchases.planId], references: [plans.id], relationName: "purchases_plan_id" }),
}));
// generated:end
