import { z } from "zod";
import { tenantProcedure } from "../../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../../guards";
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
			memberId: z.string().uuid().optional(),
			appointmentId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			limit: z.number().int().min(1).max(200).default(50).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "read");

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
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "read");

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
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "read");

		return getMyCommissions(context.tenantDb, context.member.id, {
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
		}),
	)
	.handler(async ({ input, context }) => {
		
		

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await requirePermissionOrpc(context.tenantDb, context.member, "commission_management", "read");

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
		});
	});

export const commissionSplitsReadProcedures = {
	list,
	getByAppointment,
	getMyCommissions: myCommissions,
	listLedger,
};
