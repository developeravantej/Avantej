/**
 * Plan F.4 + F.6 — Tenant Feature Flags router unit tests
 * (Agent Ff base + Agent Fo override extensions).
 *
 * Exercises the tier→feature derivation against `TIER_LIMITS` for each
 * valid tier + the "no subscription" fallback, plus per-tenant override
 * merge logic (F.6). Hits the live control-panel DB to seed
 * org / subscription / platform-admin / override rows, then invokes the
 * raw handlers.
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { platformAdminTenantsFeatureFlagsRouter } from "./platform-admin-tenants-feature-flags";
import { controlPanelDb } from "@/lib/db";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { tenantFeatureOverrides } from "@avantej-core/db/schema/control-panel/tenant-feature-overrides";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";

const TEST_USER_ID = "test-admin-user-tenant-feature-flags";
const TEST_SUPER_USER_ID = "test-super-admin-tenant-feature-flags";

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
			get: (k: string) => (k === "controlPanelDb" ? controlPanelDb : undefined),
		},
	};
}

async function ensureAdminUser(
	userId: string,
	role: "super_admin" | "support" | "billing",
	displayName: string,
) {
	const existingUser = await controlPanelDb.query.user.findFirst({
		where: eq(userTable.id, userId),
	});
	if (!existingUser) {
		await controlPanelDb.insert(userTable).values({
			id: userId,
			email: `${userId}@test.local`,
			name: displayName,
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as typeof userTable.$inferInsert);
	}
	const existingPa = await controlPanelDb.query.platformAdmins.findFirst({
		where: eq(platformAdmins.userId, userId),
	});
	if (!existingPa) {
		await controlPanelDb.insert(platformAdmins).values({
			userId,
			role,
		} as typeof platformAdmins.$inferInsert);
	} else if (existingPa.role !== role) {
		await controlPanelDb
			.update(platformAdmins)
			.set({ role })
			.where(eq(platformAdmins.userId, userId));
	}
}

async function ensureAdmin() {
	await ensureAdminUser(TEST_USER_ID, "support", "Feature Flags Admin");
	await ensureAdminUser(
		TEST_SUPER_USER_ID,
		"super_admin",
		"Feature Flags Super Admin",
	);
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
				organizationCountLimit:
					TIER_LIMITS[tier].organizations === Number.MAX_SAFE_INTEGER
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

// ── F.6 (Agent Fo) — Per-tenant override merge + RBAC ──────────────────
describe("platformAdminTenantsFeatureFlagsRouter — overrides (F.6 Agent Fo)", () => {
	it("get() with no overrides → source=tier_default, overrides={}", async () => {
		const orgId = await seedOrgWithTier("ff10", "basic");
		const handler = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await handler({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as {
			source: string;
			overrides: Record<string, unknown>;
			features: { commissionSplits: boolean };
		};
		expect(result.source).toBe("tier_default");
		expect(result.overrides).toEqual({});
		// basic-tier default commissionSplits is false
		expect(result.features.commissionSplits).toBe(false);
	});

	it("setOverride (super_admin) flips a feature; get() reflects merged value + source=mixed", async () => {
		const orgId = await seedOrgWithTier("ff11", "basic");
		const setHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.setOverride,
		);
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: {
				organizationId: orgId,
				featureKey: "commissionSplits",
				enabled: true,
				notes: "concession for ticket-1",
			},
		});

		const getHandlerFn = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await getHandlerFn({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as {
			source: string;
			features: { commissionSplits: boolean };
			overrides: Record<string, { enabled: boolean; notes: string | null }>;
		};
		expect(result.source).toBe("mixed");
		expect(result.features.commissionSplits).toBe(true);
		expect(result.overrides.commissionSplits?.enabled).toBe(true);
		expect(result.overrides.commissionSplits?.notes).toBe(
			"concession for ticket-1",
		);

		// Audit row written
		const auditRows = await controlPanelDb
			.select({ actionType: adminSessionActions.actionType })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, orgId),
					eq(adminSessionActions.actionType, "tenant_feature_override_set"),
				),
			);
		expect(auditRows.length).toBeGreaterThan(0);
	});

	// NOTE: super_admin RBAC enforcement is implemented in the procedure
	// middleware (`requirePlatformAdmin(["super_admin"])`), which the
	// `getHandler` helper deliberately bypasses. RBAC is covered end-to-end
	// in the Playwright spec (Fo-feature-overrides.spec.ts scenario 2).

	it("clearOverride reverts to tier default", async () => {
		const orgId = await seedOrgWithTier("ff13", "basic");
		const setHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.setOverride,
		);
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: {
				organizationId: orgId,
				featureKey: "commissionSplits",
				enabled: true,
			},
		});

		const clearHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.clearOverride,
		);
		const clearResult = (await clearHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: { organizationId: orgId, featureKey: "commissionSplits" },
		})) as { ok: true };
		expect(clearResult.ok).toBe(true);

		const getHandlerFn = getHandler(platformAdminTenantsFeatureFlagsRouter.get);
		const result = (await getHandlerFn({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as { source: string; features: { commissionSplits: boolean } };
		expect(result.source).toBe("tier_default");
		expect(result.features.commissionSplits).toBe(false);
	});

	it("clearOverride is idempotent when no override exists", async () => {
		const orgId = await seedOrgWithTier("ff14", "basic");
		const clearHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.clearOverride,
		);
		const result = (await clearHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: { organizationId: orgId, featureKey: "apiAccess" },
		})) as { ok: true };
		expect(result.ok).toBe(true);

		// Audit still written
		const auditRows = await controlPanelDb
			.select({ actionType: adminSessionActions.actionType })
			.from(adminSessionActions)
			.where(
				and(
					eq(adminSessionActions.targetOrganizationId, orgId),
					eq(adminSessionActions.actionType, "tenant_feature_override_clear"),
				),
			);
		expect(auditRows.length).toBe(1);
	});

	it("setOverride upserts (one row per org+feature)", async () => {
		const orgId = await seedOrgWithTier("ff15", "basic");
		const setHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.setOverride,
		);
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: {
				organizationId: orgId,
				featureKey: "apiAccess",
				enabled: true,
				notes: "v1",
			},
		});
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: {
				organizationId: orgId,
				featureKey: "apiAccess",
				enabled: false,
				notes: "v2",
			},
		});

		const rows = await controlPanelDb
			.select({
				enabled: tenantFeatureOverrides.enabled,
				notes: tenantFeatureOverrides.notes,
			})
			.from(tenantFeatureOverrides)
			.where(
				and(
					eq(tenantFeatureOverrides.organizationId, orgId),
					eq(tenantFeatureOverrides.featureKey, "apiAccess"),
				),
			);
		expect(rows.length).toBe(1);
		expect(rows[0]!.enabled).toBe(false);
		expect(rows[0]!.notes).toBe("v2");
	});

	it("listOverrides returns active overrides for an org", async () => {
		const orgId = await seedOrgWithTier("ff16", "basic");
		const setHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.setOverride,
		);
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: { organizationId: orgId, featureKey: "ghl", enabled: true },
		});
		await setHandler({
			context: fakeContext(TEST_SUPER_USER_ID),
			input: {
				organizationId: orgId,
				featureKey: "memberships",
				enabled: true,
			},
		});

		const listHandler = getHandler(
			platformAdminTenantsFeatureFlagsRouter.listOverrides,
		);
		const result = (await listHandler({
			context: fakeContext(),
			input: { organizationId: orgId },
		})) as {
			overrides: Array<{ featureKey: string; enabled: boolean }>;
		};
		const keys = result.overrides.map((o) => o.featureKey).sort();
		expect(keys).toEqual(["ghl", "memberships"]);
	});

	// Touch sql import to avoid unused warning under stricter lint configs.
	it("sql import is wired (no-op assertion)", () => {
		expect(typeof sql).toBe("function");
	});
});
