/**
 * Plan F.4 — Tenant Feature Flags router unit tests (Agent Ff).
 *
 * Exercises the tier→feature derivation against `TIER_LIMITS` for each
 * valid tier + the "no subscription" fallback. Hits the live
 * control-panel DB to seed an org / subscription / platform-admin row,
 * then invokes the raw handler.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { platformAdminTenantsFeatureFlagsRouter } from "./platform-admin-tenants-feature-flags";
import { controlPanelDb } from "@/lib/db";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

const TEST_USER_ID = "test-admin-user-tenant-feature-flags";

function getHandler<T>(proc: unknown): (args: unknown) => Promise<T> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return ((proc as any)["~orpc"] as Record<string, unknown>).handler as (
		args: unknown,
	) => Promise<T>;
}

function fakeContext(userId = TEST_USER_ID) {
	return {
		session: { user: { id: userId, email: "admin@test.local" } },
		honoContext: {
			get: (k: string) =>
				k === "controlPanelDb" ? controlPanelDb : undefined,
		},
	};
}

async function ensureAdmin() {
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, TEST_USER_ID),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: TEST_USER_ID,
			email: `${TEST_USER_ID}@test.local`,
			name: "Feature Flags Admin",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof userTable.$inferInsert);
	}
	const existingPa = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, TEST_USER_ID),
	});
	if (!existingPa) {
		await controlPanelDb.insert(platformAdmins).values({
			userId: TEST_USER_ID,
			role: "support",
		} as typeof platformAdmins.$inferInsert);
	}
}

async function seedOrgWithTier(
	idSuffix: string,
	tier: Tier | null,
	status = "active",
): Promise<string> {
	const orgId = `00000000-0000-0000-0000-${idSuffix.padStart(12, "0")}`;
	// Clean prior
	await controlPanelDb.delete(organizations).where(eq(organizations.id, orgId));
	let subId: string | null = null;
	if (tier) {
		const stripeSubId = `sub_test_${idSuffix}_${Date.now()}`;
		const inserted = await controlPanelDb
			.insert(subscriptions)
			.values({
				stripeSubscriptionId: stripeSubId,
				stripeCustomerId: `cus_test_${idSuffix}`,
				stripePriceId: `price_test_${idSuffix}`,
				tier,
				organizationCountLimit: TIER_LIMITS[tier].organizations === Number.MAX_SAFE_INTEGER
					? 9999
					: TIER_LIMITS[tier].organizations,
				applicationFeeBps: TIER_LIMITS[tier].appFeeBps,
				currency: "usd",
				status,
			} as typeof subscriptions.$inferInsert)
			.returning({ id: subscriptions.id });
		subId = inserted[0]!.id;
	}
	await controlPanelDb.insert(organizations).values({
		id: orgId,
		name: `feature-flags-test-${idSuffix}`,
		slug: `feature-flags-test-${idSuffix}-${Date.now()}`,
		neonProjectId: `neon_test_${idSuffix}`,
		connectionString: `postgres://test:test@localhost/test_${idSuffix}`,
		paymentStatus: "active",
		subscriptionId: subId,
	} as typeof organizations.$inferInsert);
	return orgId;
}

beforeAll(async () => {
	await ensureAdmin();
});

describe("platformAdminTenantsFeatureFlagsRouter.get — tier defaults", () => {
	const cases: Array<{ tier: Tier; idSuffix: string }> = [
		{ tier: "basic", idSuffix: "ff01" },
		{ tier: "professional", idSuffix: "ff02" },
		{ tier: "enterprise", idSuffix: "ff03" },
	];

	for (const { tier, idSuffix } of cases) {
		it(`returns TIER_LIMITS[${tier}] features for a ${tier}-subscribed org`, async () => {
			const orgId = await seedOrgWithTier(idSuffix, tier);
			const handler = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
			const result = (await handler({
				context: fakeContext(),
				input: { organizationId: orgId },
			})) as {
				organizationId: string;
				tier: Tier;
				features: typeof TIER_LIMITS.basic.features;
				tierLimits: { appFeeBps: number };
				source: string;
			};
			expect(result.organizationId).toBe(orgId);
			expect(result.tier).toBe(tier);
			expect(result.features).toEqual(TIER_LIMITS[tier].features as any);
			expect(result.tierLimits.appFeeBps).toBe(TIER_LIMITS[tier].appFeeBps);
			expect(result.source).toBe("tier_default");
		});
	}

	it("falls back to basic when the organization has no subscription", async () => {
		const orgId = await seedOrgWithTier("ff04", null);
		const handler = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await handler({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as { tier: Tier; features: typeof TIER_LIMITS.basic.features };
		expect(result.tier).toBe("basic");
		expect(result.features).toEqual(TIER_LIMITS.basic.features as any);
	});

	it("falls back to basic when the subscription is cancelled", async () => {
		const orgId = await seedOrgWithTier("ff05", "professional", "canceled");
		const handler = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await handler({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as { tier: Tier };
		expect(result.tier).toBe("basic");
	});

	it("returns tier when the subscription is in trialing state", async () => {
		const orgId = await seedOrgWithTier("ff06", "enterprise", "trialing");
		const handler = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await handler({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as { tier: Tier };
		expect(result.tier).toBe("enterprise");
	});
});
