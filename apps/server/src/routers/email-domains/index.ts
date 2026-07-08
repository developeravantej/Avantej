/**
 * Email Domain Router
 *
 * Tenant-self-service provisioning of Resend sending domains.
 *
 * Auth model: caller must be an authenticated user AND an `admin` member of
 * the target organization (via control-panel `organization_members`). All
 * Resend mutations are routed through @/lib/resend-domains; persistence is
 * handled by `@avantej-core/services/email-domain.service`.
 *
 * Split into procedure-group modules to stay under the router-file LOC budget;
 * the merged shape is identical to the previous single-file router.
 */

import { aliasProcedures } from "./aliases.procedures";
import { domainCrudProcedures } from "./domain-crud.procedures";
import { domainVerifyProcedures } from "./domain-verify.procedures";
import { notificationRouteProcedures } from "./notification-routes.procedures";

export { auditEmailDomainChange } from "./_shared";

export const emailDomainsRouter = {
	...domainCrudProcedures,
	...domainVerifyProcedures,
	...aliasProcedures,
	...notificationRouteProcedures,
};
