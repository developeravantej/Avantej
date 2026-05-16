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
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel/platform-payment-ledger";
import { tenantUsageSnapshots } from "@avantej-core/db/schema/control-panel/tenant-usage-snapshots";

function requirePlatformAdmin() {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const controlPanelDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!controlPanelDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await controlPanelDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

function cpDbFromContext(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

export const platformAdminTenantsRouter = {
	listTenants: adminProcedure
		.input(
			z.object({
				search: z.string().trim().optional(),
				paymentStatus: z.string().optional(),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
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
				.leftJoin(subscriptions, eq(subscriptions.id, organizations.subscriptionId))
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
							.where(
								sql`${orgCountryStripeAccounts.organizationId} = ANY(${orgIds}::uuid[])`,
							)
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
					connectAccounts: rollupByOrg.get(r.id) ?? { total: 0, chargesEnabled: 0 },
				})),
			};
		}),

	getTenantDetail: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);

			const [org] = await cpDb
				.select({
					id: organizations.id,
					name: organizations.name,
					slug: organizations.slug,
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
			const cpDb = cpDbFromContext(context);
			const rows = await cpDb
				.select()
				.from(tenantUsageSnapshots)
				.where(eq(tenantUsageSnapshots.organizationId, input.organizationId))
				.orderBy(desc(tenantUsageSnapshots.snapshotDate))
				.limit(input.days);
			return { snapshots: rows.reverse() };
		}),

	runTenantUsageSnapshotsNow: adminProcedure.handler(async ({ context }) => {
		const cpDb = cpDbFromContext(context);
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
