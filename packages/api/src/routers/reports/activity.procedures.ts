/**
 * WS2 reports — ACTIVITY procedures (refunds & cancellations, redemptions).
 * Thin handlers: RBAC via guardReportAccess, queries live in
 * @avantej-core/services/reports/activity.report; cross-DB display-name
 * enrichment happens HERE (users live in the control-panel DB — the
 * invoices/trainers batch-lookup pattern).
 */
import { user as cpUsers } from "@avantej-core/db/schema/auth";
import {
	exportRedemptionsCsv as exportRedemptionsCsvQuery,
	exportRefundsCancellationsCsv as exportRefundsCancellationsCsvQuery,
	listRedemptions as listRedemptionsQuery,
	listRefundsCancellations as listRefundsCancellationsQuery,
	type RedemptionRow,
	type RefundCancellationRow,
} from "@avantej-core/services/reports/activity.report";
import { inArray } from "drizzle-orm";

import { tenantProcedure } from "../../index";
import { getControlPanelDb } from "../../lib/context-helpers";
import {
	guardReportAccess,
	reportBaseInput,
	reportDates,
	reportListInput,
} from "./_shared";

type ControlPanelDb = ReturnType<typeof getControlPanelDb>;

/** Batch control-panel users lookup: id → display name (name → email → "Unknown"). */
async function fetchUserNames(
	cpDb: ControlPanelDb,
	userIds: string[],
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();
	const rows = await cpDb
		.select({ id: cpUsers.id, name: cpUsers.name, email: cpUsers.email })
		.from(cpUsers)
		.where(inArray(cpUsers.id, userIds));
	return new Map(rows.map((u) => [u.id, u.name || u.email || "Unknown"]));
}

// ---------------------------------------------------------------------------
// Refunds & Cancellations
// ---------------------------------------------------------------------------

const listRefundsCancellations = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		const result = await listRefundsCancellationsQuery(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});

		const ids = [
			...new Set(
				result.rows
					.map((r) => r.cancelledByUserId)
					.filter((id): id is string => !!id),
			),
		];
		const names = await fetchUserNames(getControlPanelDb(context), ids);

		const rows: RefundCancellationRow[] = result.rows.map((r) => ({
			...r,
			cancelledByName: r.cancelledByUserId
				? (names.get(r.cancelledByUserId) ?? null)
				: null,
		}));

		return { rows, total: result.total };
	});

const exportRefundsCancellationsCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		const cpDb = getControlPanelDb(context);

		return exportRefundsCancellationsCsvQuery(
			context.tenantDb,
			{
				...reportDates(input),
				taxBasis: input.taxBasis,
				branchId: input.branchId,
				accessibleNodeIds,
			},
			(ids) => fetchUserNames(cpDb, ids),
		);
	});

// ---------------------------------------------------------------------------
// Customer Redemptions (credit points)
// ---------------------------------------------------------------------------

const listRedemptions = tenantProcedure
	.input(reportListInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input);

		const result = await listRedemptionsQuery(context.tenantDb, {
			...reportDates(input),
			taxBasis: input.taxBasis,
			branchId: input.branchId,
			accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});

		const ids = [...new Set(result.rows.map((r) => r.customerUserId))];
		const names = await fetchUserNames(getControlPanelDb(context), ids);

		const rows: RedemptionRow[] = result.rows.map((r) => ({
			...r,
			customerName: names.get(r.customerUserId) ?? null,
		}));

		return { rows, total: result.total };
	});

const exportRedemptionsCsv = tenantProcedure
	.input(reportBaseInput)
	.handler(async ({ input, context }) => {
		const accessibleNodeIds = await guardReportAccess(context, input, "export");
		const cpDb = getControlPanelDb(context);

		return exportRedemptionsCsvQuery(
			context.tenantDb,
			{
				...reportDates(input),
				taxBasis: input.taxBasis,
				branchId: input.branchId,
				accessibleNodeIds,
			},
			(ids) => fetchUserNames(cpDb, ids),
		);
	});

export const reportsActivityProcedures = {
	listRefundsCancellations,
	exportRefundsCancellationsCsv,
	listRedemptions,
	exportRedemptionsCsv,
};
