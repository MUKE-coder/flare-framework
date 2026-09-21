// Registry of every resource descriptor (maintained by flare gen).
// generated:start hash=db1b557c3538
import companyResource from "./company.resource";
import contactResource from "./contact.resource";
import customerResource from "./customer.resource";
import dealResource from "./deal.resource";
import planResource from "./plan.resource";
import purchaseResource from "./purchase.resource";
import securityEventResource from "./security-event.resource";

export { companyResource, contactResource, customerResource, dealResource, planResource, purchaseResource, securityEventResource };
export const resources = [companyResource, contactResource, customerResource, dealResource, planResource, purchaseResource, securityEventResource] as const;
// generated:end
