import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch, guardBranchAccessible } from "../guards";
import {
	listExpenses,
	getExpenseById,
	createExpense,
	approveExpense,
	rejectExpense,
	markExpensePaid,
} from "@avantej-core/services/expenses.service";
import { requirePermission } from "@avantej-core/services";

const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			status: z.string().optional(),
			submittedBy: z.string().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			offset: z.number().int().min(0).optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "read");

		return listExpenses(context.tenantDb, {
			branchId: input.branchId,
			status: input.status,
			submittedBy: input.submittedBy,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			offset: input.offset,
		});
	});

const getById = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "read");

		const expense = await getExpenseById(context.tenantDb, input.id);
		if (!expense) {
			throw new ORPCError("NOT_FOUND", {
				message: `Expense not found: ${input.id}`,
			});
		}
		return expense;
	});

const create = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
			category: z.enum([
				"travel",
				"equipment",
				"supplies",
				"training",
				"other",
			]),
			description: z.string().min(1),
			amount: z.number().int().positive(),
			expenseDate: z.string().datetime(),
			receiptUrl: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		if (input.branchId) {
			guardBranchAccessible(input.branchId, context.accessibleNodeIds ?? []);
		}
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "create");

		return createExpense(context.tenantDb, {
			branchId: input.branchId,
			submittedBy: context.member.userId,
			amount: input.amount,
			category: input.category,
			description: input.description,
			expenseDate: new Date(input.expenseDate),
			receiptUrl: input.receiptUrl,
		});
	});

const approve = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "update");

		try {
			return await approveExpense(
				context.tenantDb,
				input.id,
				context.member.userId,
			);
		} catch (e) {
			throw new ORPCError("BAD_REQUEST", {
				message: e instanceof Error ? e.message : "Failed to approve expense",
			});
		}
	});

const reject = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			rejectionReason: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "update");

		try {
			return await rejectExpense(
				context.tenantDb,
				input.id,
				context.member.userId,
				input.rejectionReason,
			);
		} catch (e) {
			throw new ORPCError("BAD_REQUEST", {
				message: e instanceof Error ? e.message : "Failed to reject expense",
			});
		}
	});

const markPaid = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			id: z.string().uuid(),
			paymentReference: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		

		

		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(context.tenantDb, context.member, "expense_management", "update");

		try {
			return await markExpensePaid(
				context.tenantDb,
				input.id,
				context.member.userId,
				input.paymentReference,
			);
		} catch (e) {
			throw new ORPCError("BAD_REQUEST", {
				message:
					e instanceof Error ? e.message : "Failed to mark expense as paid",
			});
		}
	});

export const expensesRouter = { list, getById, create, approve, reject, markPaid };
