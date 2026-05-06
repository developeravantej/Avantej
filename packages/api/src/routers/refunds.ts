/**
 * Refunds Router
 *
 * API endpoints for the unified refund ledger with four-step lifecycle:
 *   request → approve | reject → process
 *
 * All write endpoints require the calling member to have the corresponding
 * refund_management permission. Admins (role.priority >= 100) always pass.
 */

import { requirePermission } from "@avantej-core/services";
import {
	approveRefund,
	createPartialRefund,
	getRefundById,
	listRefunds,
	processRefund,
	rejectRefund,
	requestRefund,
} from "@avantej-core/services/refunds.service";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { getControlPanelDb } from "../lib/context-helpers";

export const refundsRouter = {
	/**
	 * List refunds with optional filters and RBAC scoping by branchId.
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: z
					.enum([
						"pending",
						"approved",
						"rejected",
						"processed",
						"cancelled",
						"all",
					])
					.optional(),
				salesOrderId: z.string().uuid().optional(),
				customerId: z.string().optional(),
				branchId: z.string().uuid().optional(),
				from: z
					.string()
					.regex(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
						"Expected ISO datetime",
					)
					.optional(),
				to: z
					.string()
					.regex(
						/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/,
						"Expected ISO datetime",
					)
					.optional(),
				limit: z.number().int().min(1).max(200).default(100),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"read",
			);

			const controlPanelDb = getControlPanelDb(context);
			const accessibleNodeIds = context.accessibleNodeIds ?? [];

			return listRefunds(context.tenantDb, controlPanelDb, {
				status: input.status,
				salesOrderId: input.salesOrderId,
				customerId: input.customerId,
				branchId: input.branchId,
				from: input.from ? new Date(input.from) : undefined,
				to: input.to ? new Date(input.to) : undefined,
				accessibleNodeIds,
				limit: input.limit,
				offset: input.offset,
			});
		}),

	/**
	 * Get a single refund by ID.
	 */
	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"read",
			);

			const refund = await getRefundById(context.tenantDb, input.id);
			if (!refund) {
				throw new ORPCError("NOT_FOUND", {
					message: `Refund ${input.id} not found`,
				});
			}
			return refund;
		}),

	/**
	 * Request a new refund (creates a pending row).
	 * At least one of salesOrderId, paymentId, packageInstanceId must be supplied.
	 */
	request: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				salesOrderId: z.string().uuid().optional(),
				paymentId: z.string().uuid().optional(),
				packageInstanceId: z.string().uuid().optional(),
				amountCents: z.number().int().positive(),
				taxAmountCents: z.number().int().min(0).optional(),
				reason: z.string().min(1).max(1000),
				notes: z.string().max(2000).optional(),
				customerId: z.string().optional(),
				customerName: z.string().optional(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"create",
			);

			try {
				return await requestRefund(context.tenantDb, {
					salesOrderId: input.salesOrderId,
					paymentId: input.paymentId,
					packageInstanceId: input.packageInstanceId,
					amountCents: input.amountCents,
					taxAmountCents: input.taxAmountCents,
					reason: input.reason,
					notes: input.notes,
					customerId: input.customerId,
					customerName: input.customerName,
					branchId: input.branchId,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Approve a pending refund.
	 */
	approve: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reviewNotes: z.string().max(2000).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"approve",
			);

			try {
				return await approveRefund(context.tenantDb, input.id, {
					reviewNotes: input.reviewNotes,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Reject a pending refund. reviewNotes is required.
	 * Uses the "approve" permission — both approve and reject are review actions.
	 */
	reject: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				reviewNotes: z.string().min(1).max(2000),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			// Reject is part of the review flow — same permission as approve
			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"approve",
			);

			try {
				return await rejectRefund(context.tenantDb, input.id, {
					reviewNotes: input.reviewNotes,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Create a partial refund against a package instance — refunds a specific
	 * number of session credits. Locks the package_instances row via SELECT FOR
	 * UPDATE; rolls back on any validation failure. Agent 2.8 — J5.
	 */
	createPartial: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				creditsRefunded: z.number().int().positive(),
				reason: z.string().min(1).max(1000),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"create",
			);

			try {
				return await createPartialRefund(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					creditsRefunded: input.creditsRefunded,
					reason: input.reason,
					branchId: input.branchId,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw err;
			}
		}),

	/**
	 * Mark an approved refund as processed.
	 * Writes back to payments.refundAmount and/or sales_orders.cancelledAmount in one tx.
	 *
	 * IMPORTANT: this does NOT trigger Stripe or any payment gateway.
	 * The operator must manually issue the reversal and record the reference here.
	 */
	process: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				refundMethod: z.enum([
					"cash",
					"card_reversal",
					"bank_transfer",
					"store_credit",
				]),
				refundReference: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available",
				});
			}
			if (!context.member) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Member context required",
				});
			}

			await requirePermission(
				context.tenantDb,
				context.member,
				"refund_management",
				"process",
			);

			try {
				return await processRefund(context.tenantDb, input.id, {
					refundMethod: input.refundMethod,
					refundReference: input.refundReference,
					actor: {
						userId: context.session.user.id,
						memberId: context.member.id,
						role: context.member.role,
					},
				});
			} catch (err) {
				const e = err as { code?: string; message?: string };
				if (e?.code === "BAD_REQUEST") {
					throw new ORPCError("BAD_REQUEST", { message: e.message });
				}
				if (e?.code === "NOT_FOUND") {
					throw new ORPCError("NOT_FOUND", { message: e.message });
				}
				throw err;
			}
		}),
};
