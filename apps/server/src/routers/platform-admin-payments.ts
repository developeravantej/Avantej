/**
 * Platform Admin — Payments router (Plan C Phase C.4).
 *
 * Read-only audit surface + manual-action procedures for the Avantej
 * ops team. All procs gated behind requirePlatformAdmin() per the same
 * pattern used in admin.ts.
 *
 * Procedures (consumed by /dashboard/platform-admin/payments UI):
 *   - overview()                  — KPI cards: fees collected, drift count,
 *                                   open disputes, stuck onboardings
 *   - listDrift({ severity?, resolved?, limit })
 *                                 — paginated drift_log
 *   - markDriftResolved({ driftId })
 *                                 — manual remediation flag
 *   - listDisputes({ status?, limit })
 *   - markDisputeHandled({ disputeId })
 *   - listStuckOnboardings()
 *   - listPerTenantSummary()      — per-org roll-up (charges_enabled,
 *                                   fees collected, open disputes, drift)
 *   - runReconciliationNow()      — manual cron trigger
 *   - runWebhookBackfillNow()     — manual cron trigger
 */

import { z } from "zod";
import { and, count, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	platformAdminProcedure as adminProcedure,
	superAdminProcedure,
} from "@avantej-core/api";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel/platform-payment-ledger";
import { platformDisputeQueue } from "@avantej-core/db/schema/control-panel/platform-dispute-queue";
import {
	paymentDriftLog,
	reconciliationRuns,
} from "@avantej-core/db/schema/control-panel/reconciliation";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { getStripeClient } from "@/lib/stripe";

function cpDbFromContext(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Control panel DB unavailable" });
	return db;
}

export const platformAdminPaymentsRouter = {
	overview: adminProcedure.handler(async ({ context }) => {
		const cpDb = cpDbFromContext(context);

		const now = new Date();
		const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

		// Application fees collected this month (sum of platform_payment_ledger).
		const [feesRow] = await cpDb
			.select({
				total: sql<number>`COALESCE(SUM(${platformPaymentLedger.applicationFee}), 0)`.as("total"),
			})
			.from(platformPaymentLedger)
			.where(
				and(
					eq(platformPaymentLedger.eventKind, "application_fee_collected"),
					gte(platformPaymentLedger.occurredAt, monthStart),
				),
			);

		// SaaS revenue this month.
		const [saasRow] = await cpDb
			.select({
				total: sql<number>`COALESCE(SUM(${platformPaymentLedger.amount}), 0)`.as("total"),
			})
			.from(platformPaymentLedger)
			.where(
				and(
					eq(platformPaymentLedger.eventKind, "saas_invoice_paid"),
					gte(platformPaymentLedger.occurredAt, monthStart),
				),
			);

		// Unresolved drift counts by severity.
		const driftBySeverity = await cpDb
			.select({
				severity: paymentDriftLog.severity,
				count: count(),
			})
			.from(paymentDriftLog)
			.where(isNull(paymentDriftLog.resolvedAt))
			.groupBy(paymentDriftLog.severity);

		const criticalDrift = driftBySeverity.find((r) => r.severity === "critical")?.count ?? 0;
		const warnDrift = driftBySeverity.find((r) => r.severity === "warn")?.count ?? 0;
		const infoDrift = driftBySeverity.find((r) => r.severity === "info")?.count ?? 0;

		// Open disputes.
		const [disputesRow] = await cpDb
			.select({ count: count() })
			.from(platformDisputeQueue)
			.where(isNull(platformDisputeQueue.handledAt));

		// Stuck onboardings.
		const [stuckRow] = await cpDb
			.select({ count: count() })
			.from(orgCountryStripeAccounts)
			.where(
				and(
					eq(orgCountryStripeAccounts.chargesEnabled, false),
					isNotNull(orgCountryStripeAccounts.stripeAccountId),
					sql`${orgCountryStripeAccounts.connectAccountUpdatedAt} < ${sevenDaysAgo}`,
				),
			);

		// Last reconciliation run.
		const [lastRun] = await cpDb
			.select()
			.from(reconciliationRuns)
			.orderBy(desc(reconciliationRuns.runStartedAt))
			.limit(1);

		return {
			applicationFeesThisMonth: Number(feesRow?.total ?? 0),
			saasRevenueThisMonth: Number(saasRow?.total ?? 0),
			drift: {
				critical: Number(criticalDrift),
				warn: Number(warnDrift),
				info: Number(infoDrift),
			},
			openDisputes: Number(disputesRow?.count ?? 0),
			stuckOnboardings: Number(stuckRow?.count ?? 0),
			lastReconciliation: lastRun
				? {
						id: lastRun.id,
						startedAt: lastRun.runStartedAt,
						completedAt: lastRun.runCompletedAt,
						status: lastRun.status,
						driftCount: lastRun.driftCount,
						error: lastRun.error,
					}
				: null,
		};
	}),

	listDrift: adminProcedure
		.input(
			z.object({
				severity: z.enum(["info", "warn", "critical"]).optional(),
				resolved: z.boolean().optional(),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const filters = [];
			if (input.severity) filters.push(eq(paymentDriftLog.severity, input.severity));
			if (input.resolved === true) filters.push(isNotNull(paymentDriftLog.resolvedAt));
			if (input.resolved === false) filters.push(isNull(paymentDriftLog.resolvedAt));
			const where = filters.length ? and(...filters) : undefined;

			const rows = await cpDb
				.select()
				.from(paymentDriftLog)
				.where(where)
				.orderBy(desc(paymentDriftLog.detectedAt))
				.limit(input.limit);
			return { drift: rows };
		}),

	markDriftResolved: adminProcedure
		.input(z.object({ driftId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const session = (context as { session?: { user?: { id?: string } } }).session;
			const adminUserId = session?.user?.id ?? "system";
			const updated = await cpDb
				.update(paymentDriftLog)
				.set({ resolvedAt: new Date(), resolvedBy: adminUserId })
				.where(eq(paymentDriftLog.id, input.driftId))
				.returning({ id: paymentDriftLog.id });
			if (updated.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Drift row not found" });
			}
			return { resolved: true };
		}),

	listDisputes: adminProcedure
		.input(
			z.object({
				status: z.string().optional(),
				limit: z.number().int().positive().max(100).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const filters = input.status
				? [eq(platformDisputeQueue.status, input.status)]
				: [];
			const rows = await cpDb
				.select()
				.from(platformDisputeQueue)
				.where(filters.length ? and(...filters) : undefined)
				.orderBy(desc(platformDisputeQueue.createdAt))
				.limit(input.limit);
			return { disputes: rows };
		}),

	markDisputeHandled: adminProcedure
		.input(z.object({ disputeId: z.string() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFromContext(context);
			const session = (context as { session?: { user?: { id?: string } } }).session;
			const adminUserId = session?.user?.id ?? "system";
			const updated = await cpDb
				.update(platformDisputeQueue)
				.set({ handledAt: new Date(), handledBy: adminUserId, updatedAt: new Date() })
				.where(eq(platformDisputeQueue.disputeId, input.disputeId))
				.returning({ id: platformDisputeQueue.id });
			if (updated.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Dispute not found" });
			}
			return { handled: true };
		}),

	listStuckOnboardings: adminProcedure.handler(async ({ context }) => {
		const cpDb = cpDbFromContext(context);
		const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
		const rows = await cpDb
			.select({
				organizationId: orgCountryStripeAccounts.organizationId,
				countryCode: orgCountryStripeAccounts.countryCode,
				stripeAccountId: orgCountryStripeAccounts.stripeAccountId,
				status: orgCountryStripeAccounts.stripeConnectStatus,
				detailsSubmitted: orgCountryStripeAccounts.detailsSubmitted,
				connectAccountUpdatedAt: orgCountryStripeAccounts.connectAccountUpdatedAt,
				orgName: organizations.name,
				orgSlug: organizations.slug,
			})
			.from(orgCountryStripeAccounts)
			.innerJoin(
				organizations,
				eq(organizations.id, orgCountryStripeAccounts.organizationId),
			)
			.where(
				and(
					eq(orgCountryStripeAccounts.chargesEnabled, false),
					isNotNull(orgCountryStripeAccounts.stripeAccountId),
					sql`${orgCountryStripeAccounts.connectAccountUpdatedAt} < ${sevenDaysAgo}`,
				),
			);
		return { stuck: rows };
	}),

	runReconciliationNow: superAdminProcedure
		.handler(async ({ context }) => {
			const cpDb = cpDbFromContext(context);
			const { runReconciliation } = await import("@/services/reconciler.service");
			const report = await runReconciliation({
				controlPanelDb: cpDb,
				stripe: getStripeClient(),
			});
			return report;
		}),

	runWebhookBackfillNow: superAdminProcedure
		.handler(async ({ context }) => {
			const cpDb = cpDbFromContext(context);
			const { runWebhookBackfill } = await import("@/services/webhook-backfill.service");
			const report = await runWebhookBackfill({
				controlPanelDb: cpDb,
				stripe: getStripeClient(),
			});
			return report;
		}),
};
