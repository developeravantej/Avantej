import { eq, and, desc, inArray, gte, lte } from "drizzle-orm";
import { expenses } from "@avantej-core/db/schema/tenant/expenses";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { resolveScopeNodeIds } from "./hierarchy-scope";

type TenantDb = NeonDatabase<typeof tenantSchema>;

export type CreateExpenseParams = {
	branchId?: string;
	submittedBy: string;
	amount: number;
	currency?: string;
	category: "travel" | "equipment" | "supplies" | "training" | "other";
	description: string;
	receiptUrl?: string;
	expenseDate: Date;
};

export async function listExpenses(
	tenantDb: TenantDb,
	params: {
		branchId?: string;
		status?: string;
		submittedBy?: string;
		from?: Date;
		to?: Date;
		accessibleNodeIds?: string[];
		limit?: number;
		offset?: number;
	} = {},
): Promise<(typeof expenses.$inferSelect)[]> {
	const conditions = [];

	// Subtree scope expansion: a non-leaf scope node (country/region/state)
	// expands to its branches' ids, intersected with the RBAC ceiling, so
	// picking a parent node returns its descendant branches' rows (not zero).
	// Guards via assertBranchAccessible (throws FORBIDDEN for out-of-scope ids).
	const scopeIds = await resolveScopeNodeIds(
		tenantDb,
		params.branchId,
		params.accessibleNodeIds ?? [],
	);
	if (scopeIds.length > 0) {
		conditions.push(inArray(expenses.branchId, scopeIds));
	}

	if (params.status) {
		conditions.push(eq(expenses.status, params.status));
	}

	if (params.submittedBy) {
		conditions.push(eq(expenses.submittedBy, params.submittedBy));
	}

	if (params.from) {
		conditions.push(gte(expenses.expenseDate, params.from));
	}

	if (params.to) {
		conditions.push(lte(expenses.expenseDate, params.to));
	}

	if (params.accessibleNodeIds && params.accessibleNodeIds.length > 0) {
		conditions.push(inArray(expenses.branchId, params.accessibleNodeIds));
	}

	const limit = params.limit ?? 50;
	const offset = params.offset ?? 0;

	return tenantDb
		.select()
		.from(expenses)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(expenses.createdAt))
		.limit(limit)
		.offset(offset);
}

export async function getExpenseById(
	tenantDb: TenantDb,
	id: string,
): Promise<typeof expenses.$inferSelect | undefined> {
	const [row] = await tenantDb
		.select()
		.from(expenses)
		.where(eq(expenses.id, id));
	return row;
}

export async function createExpense(
	tenantDb: TenantDb,
	params: CreateExpenseParams,
): Promise<typeof expenses.$inferSelect> {
	const [row] = await tenantDb
		.insert(expenses)
		.values({
			branchId: params.branchId ?? null,
			submittedBy: params.submittedBy,
			amount: params.amount,
			currency: params.currency ?? "MYR",
			category: params.category,
			description: params.description,
			receiptUrl: params.receiptUrl ?? null,
			expenseDate: params.expenseDate,
			status: "pending",
		})
		.returning();

	if (!row) {
		throw new Error("Failed to create expense");
	}
	return row;
}

export async function approveExpense(
	tenantDb: TenantDb,
	id: string,
	approvedBy: string,
): Promise<typeof expenses.$inferSelect> {
	const existing = await getExpenseById(tenantDb, id);
	if (!existing || existing.status !== "pending") {
		throw new Error("Expense must be pending to approve");
	}

	const [row] = await tenantDb
		.update(expenses)
		.set({
			status: "approved",
			approvedBy,
			approvedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(expenses.id, id))
		.returning();

	if (!row) {
		throw new Error("Failed to approve expense");
	}
	return row;
}

export async function rejectExpense(
	tenantDb: TenantDb,
	id: string,
	_rejectedBy: string,
	rejectionReason: string,
): Promise<typeof expenses.$inferSelect> {
	const existing = await getExpenseById(tenantDb, id);
	if (!existing || existing.status !== "pending") {
		throw new Error("Expense must be pending to reject");
	}

	const [row] = await tenantDb
		.update(expenses)
		.set({
			status: "rejected",
			rejectionReason,
			updatedAt: new Date(),
		})
		.where(eq(expenses.id, id))
		.returning();

	if (!row) {
		throw new Error("Failed to reject expense");
	}
	return row;
}

export async function markExpensePaid(
	tenantDb: TenantDb,
	id: string,
	paidBy: string,
	paymentReference?: string,
): Promise<typeof expenses.$inferSelect> {
	const existing = await getExpenseById(tenantDb, id);
	if (!existing || existing.status !== "approved") {
		throw new Error("Expense must be approved to mark as paid");
	}

	const [row] = await tenantDb
		.update(expenses)
		.set({
			status: "paid",
			paidAt: new Date(),
			paidBy,
			paymentReference: paymentReference ?? null,
			updatedAt: new Date(),
		})
		.where(eq(expenses.id, id))
		.returning();

	if (!row) {
		throw new Error("Failed to mark expense as paid");
	}
	return row;
}
