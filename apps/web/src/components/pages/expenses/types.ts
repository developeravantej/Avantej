// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExpenseCategory =
	| "travel"
	| "equipment"
	| "supplies"
	| "training"
	| "other";

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export interface ExpenseRow {
	id: string;
	category: ExpenseCategory;
	description: string;
	amount: number; // cents
	expenseDate: string;
	submittedBy: string;
	status: ExpenseStatus;
	branchId?: string | null;
	receiptUrl?: string | null;
	rejectionReason?: string | null;
	approvedBy?: string | null;
	paidBy?: string | null;
	createdAt: string;
}
