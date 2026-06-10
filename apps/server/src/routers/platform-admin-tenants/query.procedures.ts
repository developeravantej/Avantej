/**
 * Platform Admin — Tenants router (Plan E Phase E.1).
 *
 * Cross-tenant management surface. Read-only in E.1; lifecycle actions
 * arrive in E.3. Gated behind requirePlatformAdmin (same pattern as
 * platform-admin-payments.ts).
 *
 * Procedures:
 *   - listTenants({ search?, paymentStatus?, page, limit }) — paginated
 *       org list with owner email + sub tier + Connect rollup count.
 *   - getTenantDetail({ organizationId }) — full org meta, owner,
 *       per-country Connect accts, subscription, last-activity timestamps.
 */

import { z } from "zod";
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	or,
	sql,
} from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { adminProcedure } from "@/lib/admin-procedure";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel/platform-payment-ledger";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

export const queryProcedures = {
	listTenants: adminProcedure
		.input(
			z.object({
				search: z.string().trim().optional(),
				paymentStatus: z.string().optional(),
				countryCode: z.string().length(2).optional(),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const offset = (input.page - 1) * input.limit;

			const filters = [] as any[];
			if (input.search) {
				const pat = `%${input.search}%`;
				filters.push(
					or(
						ilike(organizations.name, pat),
						ilike(organizations.slug, pat),
						ilike(users.email, pat),
					),
				);
			}
			if (input.paymentStatus) {
				filters.push(eq(organizations.paymentStatus, input.paymentStatus));
			}
			if (input.countryCode) {
				filters.push(
					eq(organizations.countryCode, input.countryCode.toUpperCase()),
				);
			}
			const where = filters.length ? and(...filters) : undefined;

			const [totalRow] = await cpDb
				.select({ c: count() })
				.from(organizations)
				.leftJoin(users, eq(users.id, organizations.ownerUserId))
				.where(where);

			const rows = await cpDb
				.select({
					id: organizations.id,
					name: organizations.name,
					slug: organizations.slug,
					countryCode: organizations.countryCode,
					paymentStatus: organizations.paymentStatus,
					trialEndsAt: organizations.trialEndsAt,
					createdAt: organizations.createdAt,
					ownerEmail: users.email,
					ownerName: users.name,
					subTier: subscriptions.tier,
					subStatus: subscriptions.status,
				})
				.from(organizations)
				.leftJoin(users, eq(users.id, organizations.ownerUserId))
				.leftJoin(
					subscriptions,
					eq(subscriptions.id, organizations.subscriptionId),
				)
				.where(where)
				.orderBy(desc(organizations.createdAt))
				.limit(input.limit)
				.offset(offset);

			const orgIds = rows.map((r) => r.id);
			const acctRollup =
				orgIds.length > 0
					? await cpDb
							.select({
								organizationId: orgCountryStripeAccounts.organizationId,
								total: count(),
								chargesEnabledCount: sql<number>`SUM(CASE WHEN ${orgCountryStripeAccounts.chargesEnabled} THEN 1 ELSE 0 END)`,
							})
							.from(orgCountryStripeAccounts)
							// Plan F.2: use inArray instead of sql`= ANY(${arr}::uuid[])`.
							// @neondatabase/serverless binds JS arrays as `record`, which PG
							// refuses to cast to uuid[] ("cannot cast type record to uuid[]").
							.where(inArray(orgCountryStripeAccounts.organizationId, orgIds))
							.groupBy(orgCountryStripeAccounts.organizationId)
					: [];
			const rollupByOrg = new Map(
				acctRollup.map((r) => [
					r.organizationId,
					{
						total: Number(r.total),
						chargesEnabled: Number(r.chargesEnabledCount),
					},
				]),
			);

			return {
				total: Number(totalRow?.c ?? 0),
				page: input.page,
				limit: input.limit,
				tenants: rows.map((r) => ({
					...r,
					connectAccounts: rollupByOrg.get(r.id) ?? {
						total: 0,
						chargesEnabled: 0,
					},
				})),
			};
		}),

	getTenantDetail: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);

			const [org] = await cpDb
				.select({
					id: organizations.id,
					name: organizations.name,
					slug: organizations.slug,
					countryCode: organizations.countryCode,
					neonProjectId: organizations.neonProjectId,
					subscriptionId: organizations.subscriptionId,
					ownerUserId: organizations.ownerUserId,
					trialEndsAt: organizations.trialEndsAt,
					paymentStatus: organizations.paymentStatus,
					schemaVersion: organizations.schemaVersion,
					ghlSyncModel: organizations.ghlSyncModel,
					ghlProvisionedAt: organizations.ghlProvisionedAt,
					createdAt: organizations.createdAt,
					updatedAt: organizations.updatedAt,
				})
				.from(organizations)
				.where(eq(organizations.id, input.organizationId));

			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			const [owner] = org.ownerUserId
				? await cpDb
						.select({
							id: users.id,
							email: users.email,
							name: users.name,
							createdAt: users.createdAt,
						})
						.from(users)
						.where(eq(users.id, org.ownerUserId))
				: [];

			const [sub] = org.subscriptionId
				? await cpDb
						.select()
						.from(subscriptions)
						.where(eq(subscriptions.id, org.subscriptionId))
				: [];

			const connectAccounts = await cpDb
				.select()
				.from(orgCountryStripeAccounts)
				.where(eq(orgCountryStripeAccounts.organizationId, org.id))
				.orderBy(asc(orgCountryStripeAccounts.countryCode));

			const [lastPayment] = await cpDb
				.select({
					occurredAt: platformPaymentLedger.occurredAt,
					eventKind: platformPaymentLedger.eventKind,
					amount: platformPaymentLedger.amount,
					applicationFee: platformPaymentLedger.applicationFee,
					currency: platformPaymentLedger.currency,
				})
				.from(platformPaymentLedger)
				.where(eq(platformPaymentLedger.organizationId, org.id))
				.orderBy(desc(platformPaymentLedger.occurredAt))
				.limit(1);

			return {
				organization: org,
				owner: owner ?? null,
				subscription: sub ?? null,
				connectAccounts,
				lastPayment: lastPayment ?? null,
			};
		}),

	// E.2 — usage history for the drill-in Usage tab.
	getTenantUsageHistory: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				days: z.number().int().positive().max(180).default(30),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const rows = await cpDb
				.select()
				.from(tenantUsageSnapshots)
				.where(eq(tenantUsageSnapshots.organizationId, input.organizationId))
				.orderBy(desc(tenantUsageSnapshots.snapshotDate))
				.limit(input.days);
			return { snapshots: rows.reverse() };
		}),

	// E.4 — Activation funnel for one tenant.
	getTenantFunnel: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const { computeTenantFunnel } = await import(
				"@/services/tenant-funnel.service"
			);
			const { getTenantDb } = await import("@/lib/db");
			const tenantDb = await getTenantDb(input.organizationId);
			return computeTenantFunnel(input.organizationId, {
				controlPanelDb: cpDb,
				tenantDb,
			});
		}),

	runTenantUsageSnapshotsNow: adminProcedure.handler(async ({ context }) => {
		const cpDb = getControlPanelDb(context);
		const { runTenantUsageSnapshots } = await import(
			"@/services/tenant-usage-snapshot.service"
		);
		const { getTenantDb } = await import("@/lib/db");
		const report = await runTenantUsageSnapshots({
			controlPanelDb: cpDb,
			getTenantDb: (orgId: string) => getTenantDb(orgId),
		});
		return report;
	}),
};
