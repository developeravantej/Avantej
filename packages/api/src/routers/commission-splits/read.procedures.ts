import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardBranchAccessible,
} from "../../guards";
import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
	listCommissionLedger,
} from "@avantej-core/services/commission-splits.service";
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			// memberId filters by commission_splits.staffId = members.userId, a
			// Better-Auth id (NOT a UUID). listLedger.staffId already uses z.string().
			memberId: z.string().min(1).optional(),
			appointmentId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			limit: z.number().int().min(1).max(200).default(50).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"read",
		);

		return listCommissionSplits(context.tenantDb, {
			memberId: input.memberId,
			appointmentId: input.appointmentId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			limit: input.limit ?? 50,
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const getByAppointment = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"read",
		);

		return getCommissionsByAppointment(context.tenantDb, input.appointmentId, {
			accessibleNodeIds: context.accessibleNodeIds,
		});
	});

const myCommissions = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"read",
		);

		// F-COM-A fix (2026-05-27 audit-prove-a session): commission_splits.staffId
		// is members.userId (matches staff_assignments convention), not members.id.
		// Passing member.id here would always return an empty ledger for every
		// trainer.
		return getMyCommissions(context.tenantDb, context.member.userId, {
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	});

// ---------------------------------------------------------------------------
// New procedures — Phase 6
// ---------------------------------------------------------------------------

/**
 * listLedger: enriched ledger with totals for the Commissions page.
 * Replaces the basic `list` procedure for the new UI.
 * Requires commission_management:read.
 */
const listLedger = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			status: z
				.enum(["pending", "approved", "paid", "void", "all"])
				.default("all"),
			staffId: z.string().optional(),
			branchId: z.string().uuid().optional(),
			from: z.string().optional(),
			to: z.string().optional(),
			limit: z.number().min(1).max(200).default(100),
			offset: z.number().min(0).default(0),
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

		return listCommissionLedger(context.tenantDb, controlPanelDb, {
			status: input.status,
			staffId: input.staffId,
			branchId: input.branchId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			limit: input.limit,
			offset: input.offset,
			accessibleNodeIds: context.accessibleNodeIds ?? [],
			trackId: input.trackId,
			roleType: input.roleType,
		});
	});

export const commissionSplitsReadProcedures = {
	list,
	getByAppointment,
	getMyCommissions: myCommissions,
	listLedger,
};
