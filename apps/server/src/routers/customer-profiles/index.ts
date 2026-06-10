/**
 * Server-side overrides for the customer-profiles router.
 *
 * Wraps the shared upsert / upsertForCustomer procedures with an
 * outbound GHL sync trigger after the DB write commits. Adds a new
 * server-only softDelete procedure that fires GHL DELETE on the
 * Contact while marking customer_profiles.is_deleted=true.
 *
 * Mounted via `apps/server/src/index.ts` which spreads server keys
 * over `baseRouter.customerProfiles` (last spread wins).
 */

import { profileProcedures } from "./profile.procedures";
import { claimProcedures } from "./claim.procedures";
import { ghlProcedures } from "./ghl.procedures";

export const serverCustomerProfilesRouter = {
	...profileProcedures,
	...claimProcedures,
	...ghlProcedures,
};
