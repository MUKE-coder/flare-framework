// Server-only: resource name → descriptor and table (maintained by flare gen).
// generated:start hash=eb1bbe1fefe8
import { prisma } from "@/lib/db";
import { categoryResource, orderResource, productResource } from "./index";

export const resourceTables = {
  Category: { resource: categoryResource, delegate: prisma.category },
  Order: { resource: orderResource, delegate: prisma.order },
  Product: { resource: productResource, delegate: prisma.product },
} as const;

export type ResourceName = keyof typeof resourceTables;
// generated:end
