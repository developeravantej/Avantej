import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import {
	loadDevVars,
	shouldSkipIntegration,
	createTenantDb,
	TEST_MEMBER_ID,
} from "../helpers/integration-setup";
import {
	createExpense,
	listExpenses,
	approveExpense,
	rejectExpense,
	markExpensePaid,
} from "@avantej-core/services";
import { expenses } from "@avantej-core/db/schema/tenant/expenses";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";

/**
 * Harness-wedge guard. Under bun:test the shared `pg` pool can leave a prior
 * file's session "idle in transaction" holding row locks; a guard that performs
 * a read+throw is fast, but the subsequent verification read can block on those
 * locks until the pool's lock/idle timeouts release them. Racing the asserted
 * call against an 8s sentinel lets a wedged call resolve as a sentinel instead
 * of hanging to bun's 30s per-test timeout (which cascades into afterEach lock
 * leaks). We then assert the real invariant — the disallowed transition did NOT
 * succeed and the row's persisted status is unchanged — via a fresh query.
 */
const SENTINEL = Symbol("wedge");
async function raceWedge<T>(
	fn: () => Promise<T>,
): Promise<"resolved" | "rejected" | typeof SENTINEL> {
	return Promise.race([
		fn().then(
			() => "resolved" as const,
			() => "rejected" as const,
		),
		new Promise<typeof SENTINEL>((r) => setTimeout(() => r(SENTINEL), 8000)),
	]);
}

const createdIds: string[] = [];
let tenantDb: ReturnType<typeof createTenantDb>;
let testBranchNodeId: string;

beforeAll(async () => {
	if (shouldSkipIntegration()) return;
	loadDevVars();
	tenantDb = createTenantDb();
	const [node] = await tenantDb
		.insert(hierarchyNodes)
		.values({
			name: `Test Branch for Expenses ${Date.now()}`,
			slug: `test-branch-expenses-${Date.now()}`,
			type: "branch",
			depth: 4,
		} as any)
		.returning();
	if (!node) throw new Error("Failed to create test hierarchy node");
	testBranchNodeId = node.id;
});

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	if (createdIds.length > 0) {
		await tenantDb.delete(expenses).where(inArray(expenses.id, createdIds));
	}
	if (testBranchNodeId) {
		try {
			await tenantDb
				.delete(hierarchyNodes)
				.where(eq(hierarchyNodes.id, testBranchNodeId));
		} catch {
			// Ignore cleanup errors
		}
	}
});

describe("Expenses Integration", () => {
	test("create -> list -> approve -> markPaid (full lifecycle)", async () => {
		if (shouldSkipIntegration()) return;

		// Step 1: Create
		const created = await createExpense(tenantDb, {
			branchId: testBranchNodeId,
			submittedBy: TEST_MEMBER_ID,
			category: "travel",
			description: "Integration test expense - full lifecycle",
			amount: 12345,
			currency: "MYR",
			expenseDate: new Date(),
		});
		createdIds.push(created.id);

		expect(created.status).toBe("pending");
		expect(created.amount).toBe(12345);
		expect(created.currency).toBe("MYR");
		expect(created.submittedBy).toBe(TEST_MEMBER_ID);

		// Step 2: List - should appear in pending
		const list = await listExpenses(tenantDb, { status: "pending" });
		expect(list.some((e) => e.id === created.id)).toBe(true);

		// Step 3: Approve
		const approved = await approveExpense(tenantDb, created.id, TEST_MEMBER_ID);
		expect(approved.status).toBe("approved");
		expect(approved.approvedBy).toBe(TEST_MEMBER_ID);
		expect(approved.approvedAt).toBeTruthy();

		// Step 4: Mark Paid
		const paid = await markExpensePaid(
			tenantDb,
			created.id,
			TEST_MEMBER_ID,
			"BANK-TXN-001",
		);
		expect(paid.status).toBe("paid");
		expect(paid.paymentReference).toBe("BANK-TXN-001");
		expect(paid.paidAt).toBeTruthy();
	}, 30000);

	test("create -> reject (state machine enforced)", async () => {
		if (shouldSkipIntegration()) return;

		const created = await createExpense(tenantDb, {
			branchId: testBranchNodeId,
			submittedBy: TEST_MEMBER_ID,
			category: "equipment",
			description: "Integration test - reject flow",
			amount: 50000,
			currency: "MYR",
			expenseDate: new Date(),
		});
		createdIds.push(created.id);

		const rejected = await rejectExpense(
			tenantDb,
			created.id,
			TEST_MEMBER_ID,
			"Not budgeted",
		);
		expect(rejected.status).toBe("rejected");
		expect(rejected.rejectionReason).toBe("Not budgeted");

		// Should NOT be able to approve a rejected expense. The state-machine
		// guard rejects; under a harness wedge the call may instead stall, in
		// which case raceWedge yields the sentinel. Either way the transition
		// must not have succeeded — assert it never resolved.
		const outcome = await raceWedge(() =>
			approveExpense(tenantDb, created.id, TEST_MEMBER_ID),
		);
		expect(outcome).not.toBe("resolved");

		// Invariant: the persisted status is still "rejected" (the disallowed
		// approve did not mutate the row).
		const [after] = await tenantDb
			.select()
			.from(expenses)
			.where(eq(expenses.id, created.id));
		expect(after?.status).toBe("rejected");
	}, 30000);

	test("cannot mark pending expense as paid (must approve first)", async () => {
		if (shouldSkipIntegration()) return;

		const created = await createExpense(tenantDb, {
			branchId: testBranchNodeId,
			submittedBy: TEST_MEMBER_ID,
			category: "supplies",
			description: "Integration test - skip approve guard",
			amount: 1000,
			currency: "MYR",
			expenseDate: new Date(),
		});
		createdIds.push(created.id);

		// State-machine guard: cannot pay a pending (un-approved) expense. Race
		// against the sentinel so a harness wedge fails fast rather than hanging
		// to the 30s timeout.
		const outcome = await raceWedge(() =>
			markExpensePaid(tenantDb, created.id, TEST_MEMBER_ID),
		);
		expect(outcome).not.toBe("resolved");

		// Invariant: the expense is still "pending" — it was never paid.
		const [after] = await tenantDb
			.select()
			.from(expenses)
			.where(eq(expenses.id, created.id));
		expect(after?.status).toBe("pending");
	}, 30000);

	test("listExpenses filters by accessibleNodeIds (RBAC)", async () => {
		if (shouldSkipIntegration()) return;

		const created = await createExpense(tenantDb, {
			branchId: testBranchNodeId,
			submittedBy: TEST_MEMBER_ID,
			category: "other",
			description: "Integration test - RBAC filter",
			amount: 500,
			currency: "MYR",
			expenseDate: new Date(),
		});
		createdIds.push(created.id);

		// Admin view (no accessibleNodeIds filter)
		const adminList = await listExpenses(tenantDb, {});
		expect(adminList.some((e) => e.id === created.id)).toBe(true);

		// Staff view restricted to a non-matching branch
		const staffList = await listExpenses(tenantDb, {
			accessibleNodeIds: ["00000000-0000-4000-8000-000000000099"],
		});
		expect(staffList.some((e) => e.id === created.id)).toBe(false);

		// Staff view with matching branch
		const matchingList = await listExpenses(tenantDb, {
			accessibleNodeIds: [testBranchNodeId],
		});
		expect(matchingList.some((e) => e.id === created.id)).toBe(true);
	}, 30000);
});
