import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import {
	liabilitySummary,
	liabilityByStaff,
	exportLiabilityCsv,
} from "@avantej-core/services/commission-splits.service";
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

/**
 * liabilitySummary: aggregate commission liability for a date range.
 * Filters on earnedAt. Optionally scoped by hierarchy node and/or service category.
 * Requires commission_management:read OR commission_payout:read.
 */
const liabilitySummaryProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime(),
			to: z.string().datetime(),
			hierarchyNodeId: z.string().uuid().optional(),
			categoryId: z.string().uuid().optional(),
			/** Phase 4: SQL-side filter by commission track ID. */
			trackId: z.string().uuid().optional(),
			/**
			 * Phase 4: SQL-side filter by roleType.
			 * Use "delivery_legacy" to match legacy rows where roleType IS NULL (GAPS #22).
			 */
			roleType: z
				.enum(["trainer", "sales", "marketing", "referrer", "delivery_legacy"])
				.optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		// OR permission check: commission_management:read OR commission_payout:read
		let hasPermission = false;
		try {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
			hasPermission = true;
		} catch {
			// Try the alternative permission
		}
		if (!hasPermission) {
			try {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"commission_payout",
					"read",
				);
				hasPermission = true;
			} catch {
				// Both failed
			}
		}
		if (!hasPermission) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"commission_management:read or commission_payout:read required",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		try {
			return await liabilitySummary(context.tenantDb, controlPanelDb, {
				from: input.from,
				to: input.to,
				hierarchyNodeId: input.hierarchyNodeId,
				categoryId: input.categoryId,
				trackId: input.trackId,
				roleType: input.roleType,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					err instanceof Error
						? err.message
						: "Failed to compute liability summary",
			});
		}
	});

// ---------------------------------------------------------------------------
// Phase 1b procedures (§1.9–1.11)
// ---------------------------------------------------------------------------

/**
 * liabilityByStaff (§1.9): single GROUP BY query — one row per staff with
 * pending/approved/paid totals. LIMIT 500. Scoped by accessibleNodeIds.
 * Requires commission_management:read.
 *
 * Returns `{ rows, totalCount, hasMore }` (F-COM-07) so callers can detect when
 * the staff list was truncated at the 500-row cap instead of silently dropping
 * rows. `hasMore === true` signals the org exceeds the cap and a narrower
 * branch/date filter (or future cursor pagination) is needed.
 */
const liabilityByStaffProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			/** Phase 4: SQL-side filter by commission track ID. */
			trackId: z.string().uuid().optional(),
			/** Phase 4: SQL-side filter by roleType (use "delivery_legacy" for NULL rows). */
			roleType: z
				.enum(["trainer", "sales", "marketing", "referrer", "delivery_legacy"])
				.optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"read",
		);

		const controlPanelDb = getControlPanelDb(context);

		try {
			return await liabilityByStaff(context.tenantDb, controlPanelDb, {
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds: context.accessibleNodeIds ?? [],
				trackId: input.trackId,
				roleType: input.roleType,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					err instanceof Error
						? err.message
						: "Failed to compute liability by staff",
			});
		}
	});

/**
 * exportLiabilityCsv: generate a commission-liability CSV from liabilitySummary data.
 *
 * Phase 4 addition: columns include Role and Track ID alongside the existing
 * amount buckets. NULL roleType renders as "Delivery (legacy)".
 *
 * Returns { csv: string, rowCount: number }. The caller is responsible for
 * wrapping the CSV string in a Response with Content-Type: text/csv.
 *
 * Requires commission_management:read OR commission_payout:read.
 */
const exportLiabilityCsvProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime(),
			to: z.string().datetime(),
			hierarchyNodeId: z.string().uuid().optional(),
			categoryId: z.string().uuid().optional(),
			trackId: z.string().uuid().optional(),
			roleType: z
				.enum(["trainer", "sales", "marketing", "referrer", "delivery_legacy"])
				.optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		// OR permission check: commission_management:read OR commission_payout:read
		let hasPermission = false;
		try {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
			hasPermission = true;
		} catch {
			// Try the alternative
		}
		if (!hasPermission) {
			try {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"commission_payout",
					"read",
				);
				hasPermission = true;
			} catch {
				// Both failed
			}
		}
		if (!hasPermission) {
			throw new ORPCError("FORBIDDEN", {
				message:
					"commission_management:read or commission_payout:read required",
			});
		}

		const controlPanelDb = getControlPanelDb(context);

		try {
			return await exportLiabilityCsv(context.tenantDb, controlPanelDb, {
				from: input.from,
				to: input.to,
				hierarchyNodeId: input.hierarchyNodeId,
				categoryId: input.categoryId,
				trackId: input.trackId,
				roleType: input.roleType,
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					err instanceof Error ? err.message : "Failed to export liability CSV",
			});
		}
	});

export const commissionSplitsAnalyticsProcedures = {
	liabilitySummary: liabilitySummaryProcedure,
	liabilityByStaff: liabilityByStaffProcedure,
	exportLiabilityCsv: exportLiabilityCsvProcedure,
};
