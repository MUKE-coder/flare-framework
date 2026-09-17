// Registry of every resource descriptor (maintained by flare gen).
// generated:start
import companyResource from "./company.resource";
import contactResource from "./contact.resource";
import dealResource from "./deal.resource";

export { companyResource, contactResource, dealResource };
export const resources = [companyResource, contactResource, dealResource] as const;
// generated:end
