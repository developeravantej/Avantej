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

import { profileWriteProcedures } from "./profile-write.procedures";
import { profileLifecycleProcedures } from "./profile-lifecycle.procedures";
import { profileIdentityProcedures } from "./profile-identity.procedures";
import { claimDispatchProcedures } from "./claim-dispatch.procedures";
import { claimUnclaimedProcedures } from "./claim-unclaimed.procedures";
import { ghlProcedures } from "./ghl.procedures";

export const serverCustomerProfilesRouter = {
	...profileWriteProcedures,
	...profileLifecycleProcedures,
	...profileIdentityProcedures,
	...claimDispatchProcedures,
	...claimUnclaimedProcedures,
	...ghlProcedures,
};
