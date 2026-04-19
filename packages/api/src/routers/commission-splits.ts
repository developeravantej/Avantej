import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	listCommissionSplits,
	getCommissionsByAppointment,
	getMyCommissions,
	approveCommissionSplits,
	markCommissionSplitsPaid,
	voidCommissionSplit,
	listCommissionLedger,
} from "@avantej-core/services/commission-splits.service";
import { requirePermission } from "@avantej-core/services";
import { getControlPanelDb } from "../lib/context-helpers";

// ---------------------------------------------------------------------------
// Existing procedures (unchanged)
// ---------------------------------------------------------------------------

const list = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			memberId: z.string().uuid().optional(),
			appointmentId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return listCommissionSplits(context.tenantDb, {
			memberId: input.memberId,
			appointmentId: input.appointmentId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});
	});

const getByAppointment = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			appointmentId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		return getCommissionsByAppointment(context.tenantDb, input.appointmentId);
	});

const myCommissions = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					"Tenant database not available. Ensure organization context is set.",
			});
		}

		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

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
const listLedger = protectedProcedure
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
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"read",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

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

/**
 * approve: bulk approve pending splits.
 * Requires commission_management:approve.
 */
const approve = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"approve",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await approveCommissionSplits(context.tenantDb, input.ids, {
				userId: context.session.user.id,
				memberId: context.member.id,
				role: context.member.role,
			});
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to approve splits",
			});
		}
	});

/**
 * markPaid: bulk mark approved splits as paid.
 * Optionally links a payoutId.
 * Requires commission_management:process.
 */
const markPaid = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			ids: z.array(z.string().uuid()).min(1).max(100),
			payoutId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"process",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await markCommissionSplitsPaid(context.tenantDb, input.ids, {
				payoutId: input.payoutId,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to mark splits as paid",
			});
		}
	});

/**
 * void: void a single commission split from any status.
 * Requires commission_management:approve.
 */
const voidSplit = protectedProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			reason: z.string().min(1).max(500),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available.",
			});
		}
		if (!context.member) {
			throw new ORPCError("FORBIDDEN", {
				message: "User is not a member of this organization",
			});
		}

		try {
			await requirePermission(
				context.tenantDb,
				context.member,
				"commission_management",
				"approve",
			);
		} catch (error) {
			throw new ORPCError("FORBIDDEN", {
				message:
					error instanceof Error ? error.message : "Permission denied",
			});
		}

		try {
			return await voidCommissionSplit(
				context.tenantDb,
				input.id,
				input.reason,
				{
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			);
		} catch (error) {
			if (error instanceof ORPCError) throw error;
			throw new ORPCError("BAD_REQUEST", {
				message:
					error instanceof Error ? error.message : "Failed to void split",
			});
		}
	});

export const commissionSplitsRouter = {
	list,
	getByAppointment,
	getMyCommissions: myCommissions,
	listLedger,
	approve,
	markPaid,
	void: voidSplit,
};
