import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
	createMockTenantDb,
	selectChainResolving,
} from "../../helpers/db-mock.factory";
import { makeExpense } from "../../helpers/fixtures";

import {
	listExpenses,
	getExpenseById,
	createExpense,
	approveExpense,
	rejectExpense,
	markExpensePaid,
} from "@avantej-core/services/expenses.service";

let mockDb: any;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";
const BRANCH_NODE_ID = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── listExpenses ────────────────────────────────────────────────────────────
describe("listExpenses", () => {
	test("returns expenses from select chain", async () => {
		const fakeExpenses = [makeExpense(), makeExpense()];
		mockDb.select.mockReturnValueOnce(selectChainResolving(fakeExpenses));

		const result = await listExpenses(mockDb, {});

		expect(result).toEqual(fakeExpenses as any);
		expect(mockDb.select).toHaveBeenCalledTimes(1);
	});

	test("returns empty array when no expenses exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await listExpenses(mockDb, {});

		expect(result).toEqual([]);
	});
});

// ─── getExpenseById ──────────────────────────────────────────────────────────
describe("getExpenseById", () => {
	test("returns expense when found", async () => {
		const expense = makeExpense();
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		const result = await getExpenseById(mockDb, expense.id);

		expect(result).toEqual(expense as any);
	});

	test("returns undefined when expense does not exist", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		const result = await getExpenseById(mockDb, "nonexistent-id");

		expect(result).toBeUndefined();
	});
});

// ─── createExpense ───────────────────────────────────────────────────────────
describe("createExpense", () => {
	test("creates expense with pending status", async () => {
		const expense = makeExpense({ status: "pending" });
		const insertValues = {
			returning: mock(() => Promise.resolve([expense])),
		};
		const insertChain = { values: mock(() => insertValues) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		const result = await createExpense(mockDb, {
			branchId: BRANCH_NODE_ID,
			submittedBy: MEMBER_ID,
			category: "travel",
			description: "Business travel",
			amount: 15000,
			currency: "MYR",
			expenseDate: new Date("2026-02-01"),
		});

		expect(result.status).toBe("pending");
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	test("throws when insert returns no rows", async () => {
		const insertValues = {
			returning: mock(() => Promise.resolve([])),
		};
		const insertChain = { values: mock(() => insertValues) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		await expect(
			createExpense(mockDb, {
				submittedBy: MEMBER_ID,
				category: "travel",
				description: "fail",
				amount: 100,
				expenseDate: new Date(),
			}),
		).rejects.toThrow("Failed to create expense");
	});
});

// ─── approveExpense — state machine ──────────────────────────────────────────
describe("approveExpense — state machine", () => {
	test("approves a pending expense successfully", async () => {
		const expense = makeExpense({ status: "pending" });
		const approvedExpense = {
			...expense,
			status: "approved",
			approvedBy: MEMBER_ID,
		};

		// getExpenseById (internal) uses select().from().where()
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		// update().set().where().returning()
		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([approvedExpense])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await approveExpense(mockDb, expense.id, MEMBER_ID);

		expect(result.status).toBe("approved");
		expect(result.approvedBy).toBe(MEMBER_ID);
	});

	test("throws when trying to approve non-pending expense", async () => {
		const expense = makeExpense({ status: "approved" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		await expect(approveExpense(mockDb, expense.id, MEMBER_ID)).rejects.toThrow(
			"Expense must be pending to approve",
		);
	});

	test("throws when trying to approve a rejected expense", async () => {
		const expense = makeExpense({ status: "rejected" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		await expect(approveExpense(mockDb, expense.id, MEMBER_ID)).rejects.toThrow(
			"Expense must be pending to approve",
		);
	});

	test("throws when expense not found", async () => {
		mockDb.select.mockReturnValueOnce(selectChainResolving([]));

		await expect(
			approveExpense(mockDb, "nonexistent", MEMBER_ID),
		).rejects.toThrow("Expense must be pending to approve");
	});
});

// ─── rejectExpense — state machine ───────────────────────────────────────────
describe("rejectExpense — state machine", () => {
	test("rejects a pending expense with a reason", async () => {
		const expense = makeExpense({ status: "pending" });
		const rejectedExpense = {
			...expense,
			status: "rejected",
			rejectionReason: "Insufficient documentation",
		};

		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([rejectedExpense])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await rejectExpense(
			mockDb,
			expense.id,
			MEMBER_ID,
			"Insufficient documentation",
		);

		expect(result.status).toBe("rejected");
		expect(result.rejectionReason).toBe("Insufficient documentation");
	});

	test("throws when trying to reject an approved expense", async () => {
		const expense = makeExpense({ status: "approved" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		await expect(
			rejectExpense(mockDb, expense.id, MEMBER_ID, "Wrong"),
		).rejects.toThrow("Expense must be pending to reject");
	});
});

// ─── markExpensePaid — state machine ─────────────────────────────────────────
describe("markExpensePaid — state machine", () => {
	test("marks an approved expense as paid", async () => {
		const expense = makeExpense({ status: "approved" });
		const paidExpense = {
			...expense,
			status: "paid",
			paymentReference: "TXN-001",
		};

		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([paidExpense])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await markExpensePaid(
			mockDb,
			expense.id,
			MEMBER_ID,
			"TXN-001",
		);

		expect(result.status).toBe("paid");
		expect(result.paymentReference).toBe("TXN-001");
	});

	test("throws when trying to mark a pending expense as paid", async () => {
		const expense = makeExpense({ status: "pending" });
		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		await expect(
			markExpensePaid(mockDb, expense.id, MEMBER_ID),
		).rejects.toThrow("Expense must be approved to mark as paid");
	});

	test("allows marking paid without a payment reference", async () => {
		const expense = makeExpense({ status: "approved" });
		const paidExpense = {
			...expense,
			status: "paid",
			paymentReference: null,
		};

		mockDb.select.mockReturnValueOnce(selectChainResolving([expense]));

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([paidExpense])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await markExpensePaid(mockDb, expense.id, MEMBER_ID);

		expect(result.status).toBe("paid");
		expect(result.paymentReference).toBeNull();
	});
});
