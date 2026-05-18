/**
 * Customer-side Stripe wiring (Plan B Phase 3d — card-on-file).
 *
 * Each tenant client (customer_profiles row) gets a Stripe Customer on the
 * tenant's Connect account. Saved PaymentMethods + off-session charges
 * reference that Customer id.
 *
 * Resolution:
 *   - If customer_profile.stripe_customer_id is set AND the snapshot matches
 *     the current connected acct, reuse.
 *   - Else create on the tenant's connected acct (via stripeAccount header),
 *     persist the id + acct snapshot.
 *
 * Phase 4 readiness: per-country branch acct migration will need one Customer
 * per acct. The acct-id snapshot field lets us detect a switch + re-provision.
 */

import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";

type TenantDb = NeonDatabase<typeof tenantSchema>;

type StripeCustomersLike = {
	customers: {
		create: (
			params: { email?: string; name?: string; metadata?: Record<string, string> },
			options?: { stripeAccount?: string },
		) => Promise<{ id: string }>;
		retrieve: (
			id: string,
			options?: { stripeAccount?: string },
		) => Promise<{ id: string; deleted?: boolean }>;
	};
};

/**
 * Resolve or create the tenant-Stripe-Customer for a customer_profile.
 *
 * @throws ORPCError(NOT_FOUND) if the profile doesn't exist.
 */
export async function getOrCreateStripeCustomer(args: {
	tenantDb: TenantDb;
	stripe: StripeCustomersLike;
	customerProfileId: string;
	connectAccountId: string;
	email?: string;
	name?: string;
	organizationId: string;
}): Promise<{ customerId: string }> {
	const { tenantDb, stripe, customerProfileId, connectAccountId } = args;

	const [profile] = await tenantDb
		.select()
		.from(customerProfiles)
		.where(eq(customerProfiles.id, customerProfileId))
		.limit(1);
	if (!profile) {
		throw new ORPCError("NOT_FOUND", { message: "Customer profile not found" });
	}

	// Reuse if the snapshot matches the current acct (Phase 4: this comparison
	// catches a branch-acct migration and forces re-provisioning).
	if (
		profile.stripeCustomerId &&
		profile.stripeConnectAccountIdSnapshot === connectAccountId
	) {
		return { customerId: profile.stripeCustomerId };
	}

	const created = await stripe.customers.create(
		{
			email: args.email,
			name: args.name,
			metadata: {
				customerProfileId,
				organizationId: args.organizationId,
			},
		},
		{ stripeAccount: connectAccountId },
	);

	await tenantDb
		.update(customerProfiles)
		.set({
			stripeCustomerId: created.id,
			stripeConnectAccountIdSnapshot: connectAccountId,
			updatedAt: new Date(),
		})
		.where(eq(customerProfiles.id, customerProfileId));

	return { customerId: created.id };
}
