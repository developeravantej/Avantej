/**
 * Platform Admin — Tenant Feature Flags router (Plan F.4 + F.6).
 *
 * Read EFFECTIVE feature flags for a tenant + (F.6 Agent Fo) per-tenant
 * override CRUD.
 *
 * Tier resolution (unchanged from F.4):
 *   1. Look up `organizations.subscriptionId` → `subscriptions.tier`
 *      when the row exists AND status ∈ {active, trialing, past_due}.
 *   2. Otherwise fall back to `basic`.
 *
 * Effective features (F.6):
 *   features[k] = override[k]?.enabled ?? TIER_LIMITS[tier].features[k]
 *
 *   `source` is `"mixed"` when ≥1 override row exists for the org,
 *   `"tier_default"` otherwise. The `"override"` value from F.4's
 *   type union has been replaced by `"mixed"` — no other caller read
 *   `source === "override"` (it was never returned).
 *
 * Procs:
 *   - get({ organizationId })                       — any platform-admin
 *   - listOverrides({ organizationId })             — any platform-admin
 *   - setOverride({ organizationId, featureKey, enabled, notes? })
 *                                                   — super_admin only
 *   - clearOverride({ organizationId, featureKey }) — super_admin only,
 *                                                     idempotent
 *
 * Audit:
 *   - setOverride   → admin_session_actions(action_type="tenant_feature_override_set")
 *   - clearOverride → admin_session_actions(action_type="tenant_feature_override_clear")
 *   targetOrganizationId is always set so audit is queryable by tenant.
 */

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { requirePlatformAdmin, adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { tenantFeatureOverrides } from "@avantej-core/db/schema/control-panel/tenant-feature-overrides";
import { user as userTable } from "@avantej-core/db/schema/auth";
import {
	getTierLimits,
	resolveEffectiveTier,
	type Tier,
} from "@avantej-core/types";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { recordAdminAction } from "@/services/admin-audit.service";

const superAdminProcedure = adminProcedure.use(
	requirePlatformAdmin(["super_admin"]),
);

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id)
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	return id;
}

const FEATURE_KEYS = [
	"ghl",
	"googleCalendar",
	"commissionSplits",
	"memberships",
	"apiAccess",
] as const;
type FeatureKey = (typeof FEATURE_KEYS)[number];
const featureKeyEnum = z.enum(FEATURE_KEYS);

export type OverrideMetadata = {
	enabled: boolean;
	setByUserId: string;
	setByEmail: string | null;
	notes: string | null;
	createdAt: string | null;
	updatedAt: string | null;
};

export type TenantFeatureFlagsView = {
	organizationId: string;
	tier: Tier;
	features: Record<FeatureKey, boolean>;
	tierLimits: {
		organizations: number;
		locations: number;
		members: number;
		customers: number;
		monthlyTxns: number;
		appFeeBps: number;
		analyticsLevel: "basic" | "advanced";
		auditLogDays: number;
	};
	overrides: Partial<Record<FeatureKey, OverrideMetadata>>;
	source: "tier_default" | "mixed";
};

async function resolveTier(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	orgSubscriptionId: string | null,
): Promise<Tier> {
	if (!orgSubscriptionId) return "basic";
	const sub = await cpDb.query.subscriptions.findFirst({
		where: eq(subscriptions.id, orgSubscriptionId),
		columns: { id: true, tier: true, status: true },
	});
	return resolveEffectiveTier(sub ?? null).tier ?? "basic";
}

async function fetchOverrides(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
): Promise<
	Array<{
		featureKey: string;
		enabled: boolean;
		setByUserId: string;
		setByEmail: string | null;
		notes: string | null;
		createdAt: Date | null;
		updatedAt: Date | null;
	}>
> {
	const rows = await cpDb
		.select({
			featureKey: tenantFeatureOverrides.featureKey,
			enabled: tenantFeatureOverrides.enabled,
			setByUserId: tenantFeatureOverrides.setByUserId,
			setByEmail: userTable.email,
			notes: tenantFeatureOverrides.notes,
			createdAt: tenantFeatureOverrides.createdAt,
			updatedAt: tenantFeatureOverrides.updatedAt,
		})
		.from(tenantFeatureOverrides)
		.leftJoin(userTable, eq(userTable.id, tenantFeatureOverrides.setByUserId))
		.where(eq(tenantFeatureOverrides.organizationId, organizationId))
		.orderBy(desc(tenantFeatureOverrides.updatedAt));
	return rows;
}

export const platformAdminTenantsFeatureFlagsRouter = {
	get: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }): Promise<TenantFeatureFlagsView> => {
			const cpDb = getControlPanelDb(context);

			const org = await cpDb.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
				columns: { id: true, subscriptionId: true },
			});
			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
			}

			const tier = await resolveTier(cpDb, org.subscriptionId);
			const limits = getTierLimits(tier);
			const overrideRows = await fetchOverrides(cpDb, org.id);

			// Build effective feature map: override wins over tier default.
			const features: Record<FeatureKey, boolean> = {
				ghl: limits.features.ghl,
				googleCalendar: limits.features.googleCalendar,
				commissionSplits: limits.features.commissionSplits,
				memberships: limits.features.memberships,
				apiAccess: limits.features.apiAccess,
			};
			const overrides: Partial<Record<FeatureKey, OverrideMetadata>> = {};
			for (const row of overrideRows) {
				if (!(FEATURE_KEYS as ReadonlyArray<string>).includes(row.featureKey)) {
					continue; // ignore unknown keys defensively
				}
				const k = row.featureKey as FeatureKey;
				features[k] = row.enabled;
				overrides[k] = {
					enabled: row.enabled,
					setByUserId: row.setByUserId,
					setByEmail: row.setByEmail,
					notes: row.notes,
					createdAt: row.createdAt ? row.createdAt.toISOString() : null,
					updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
				};
			}

			return {
				organizationId: org.id,
				tier,
				features,
				tierLimits: {
					organizations: limits.organizations,
					locations: limits.locations,
					members: limits.members,
					customers: limits.customers,
					monthlyTxns: limits.monthlyTxns,
					appFeeBps: limits.appFeeBps,
					analyticsLevel: limits.analyticsLevel,
					auditLogDays: limits.auditLogDays,
				},
				overrides,
				source: overrideRows.length > 0 ? "mixed" : "tier_default",
			};
		}),

	listOverrides: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const rows = await fetchOverrides(cpDb, input.organizationId);
			return {
				overrides: rows.map((r) => ({
					featureKey: r.featureKey,
					enabled: r.enabled,
					setByUserId: r.setByUserId,
					setByEmail: r.setByEmail,
					notes: r.notes,
					createdAt: r.createdAt ? r.createdAt.toISOString() : null,
					updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
				})),
			};
		}),

	setOverride: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				featureKey: featureKeyEnum,
				enabled: z.boolean(),
				notes: z.string().max(1000).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const org = await cpDb.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
				columns: { id: true },
			});
			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
			}

			const existing = await cpDb
				.select({ id: tenantFeatureOverrides.id })
				.from(tenantFeatureOverrides)
				.where(
					and(
						eq(tenantFeatureOverrides.organizationId, input.organizationId),
						eq(tenantFeatureOverrides.featureKey, input.featureKey),
					),
				)
				.limit(1);

			if (existing.length > 0) {
				await cpDb
					.update(tenantFeatureOverrides)
					.set({
						enabled: input.enabled,
						notes: input.notes ?? null,
						setByUserId: adminUserId,
						updatedAt: new Date(),
					})
					.where(eq(tenantFeatureOverrides.id, existing[0]!.id));
			} else {
				await cpDb.insert(tenantFeatureOverrides).values({
					organizationId: input.organizationId,
					featureKey: input.featureKey,
					enabled: input.enabled,
					notes: input.notes ?? null,
					setByUserId: adminUserId,
				});
			}

			await recordAdminAction(cpDb, {
				adminUserId,
				actionType: "tenant_feature_override_set",
				targetOrganizationId: input.organizationId,
				metadata: {
					featureKey: input.featureKey,
					enabled: input.enabled,
					notes: input.notes ?? null,
				},
			});

			return {
				ok: true as const,
				featureKey: input.featureKey,
				enabled: input.enabled,
			};
		}),

	clearOverride: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				featureKey: featureKeyEnum,
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			// Idempotent: no error if row missing.
			await cpDb
				.delete(tenantFeatureOverrides)
				.where(
					and(
						eq(tenantFeatureOverrides.organizationId, input.organizationId),
						eq(tenantFeatureOverrides.featureKey, input.featureKey),
					),
				);

			await recordAdminAction(cpDb, {
				adminUserId,
				actionType: "tenant_feature_override_clear",
				targetOrganizationId: input.organizationId,
				metadata: { featureKey: input.featureKey },
			});

			return { ok: true as const };
		}),
};
