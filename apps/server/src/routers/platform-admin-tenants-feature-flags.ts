/**
 * Platform Admin — Tenant Feature Flags router (Plan F.4, Agent Ff).
 *
 * Read-only feature-flag view for the platform-admin tenant drill-in.
 * v1: derives the feature set + tier limits purely from
 * `TIER_LIMITS[tier]` in `@avantej-core/types`. No per-tenant overrides
 * (would require a new `tenant_feature_overrides` table, deferred to
 * F.4.5+). `source` is therefore always `"tier_default"` in v1 — the
 * union shape is locked in now so a follow-up can switch certain rows
 * to `"override"` without a contract change.
 *
 * Tier resolution:
 *   1. Look up `organizations.subscriptionId` → `subscriptions.tier`
 *      when the row exists AND status is one of the "live" tiers
 *      (active / trialing / past_due — treat them as "the tenant still
 *      gets their tier"s features).
 *   2. Otherwise fall back to `basic` — cheapest tier, conservative
 *      feature set. Documented here because callers will see this when
 *      a tenant is on trial without a sub row, expired, cancelled, or
 *      mid-provisioning.
 *
 * Procs (platform-admin; any role can read):
 *   - get({ organizationId })
 *
 * No mutations. No audit.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { getTierLimits, type Tier } from "@avantej-core/types";

function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<"super_admin" | "support" | "billing">,
) {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await cpDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			if (
				allowRoles &&
				!allowRoles.includes(
					adminRecord.role as "super_admin" | "support" | "billing",
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Your platform admin role does not permit this action",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

const VALID_TIERS: ReadonlyArray<Tier> = ["basic", "professional", "enterprise"];
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function coerceTier(value: string | null | undefined): Tier {
	if (value && (VALID_TIERS as ReadonlyArray<string>).includes(value)) {
		return value as Tier;
	}
	return "basic";
}

export type TenantFeatureFlagsView = {
	organizationId: string;
	tier: Tier;
	features: {
		ghl: boolean;
		googleCalendar: boolean;
		commissionSplits: boolean;
		memberships: boolean;
		apiAccess: boolean;
	};
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
	source: "tier_default" | "override";
};

export const platformAdminTenantsFeatureFlagsRouter = {
	get: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }): Promise<TenantFeatureFlagsView> => {
			const cpDb = cpDbFrom(context);

			const org = await cpDb.query.organizations.findFirst({
				where: eq(organizations.id, input.organizationId),
				columns: { id: true, subscriptionId: true },
			});
			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Organization not found" });
			}

			let tier: Tier = "basic";
			if (org.subscriptionId) {
				const sub = await cpDb.query.subscriptions.findFirst({
					where: eq(subscriptions.id, org.subscriptionId),
					columns: { id: true, tier: true, status: true },
				});
				// Honor the sub's tier when the sub is alive. Cancelled / expired
				// subs fall back to basic — they no longer get paid features.
				if (sub && LIVE_STATUSES.has(sub.status)) {
					tier = coerceTier(sub.tier);
				}
			}

			const limits = getTierLimits(tier);

			return {
				organizationId: org.id,
				tier,
				features: {
					ghl: limits.features.ghl,
					googleCalendar: limits.features.googleCalendar,
					commissionSplits: limits.features.commissionSplits,
					memberships: limits.features.memberships,
					apiAccess: limits.features.apiAccess,
				},
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
				source: "tier_default",
			};
		}),
};
