import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeMember } from "../../helpers/fixtures";

// deactivateMember is NOT in the index.ts exports — import directly from service file
import { deactivateMember } from "@avantej-core/services/member.service";

const MOCK_ACTOR = { userId: "u1", memberId: "m1", role: "admin" };

let mockDb: ReturnType<typeof createMockTenantDb>;

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── deactivateMember ────────────────────────────────────────────────────────
describe("deactivateMember", () => {
	test("sets status to 'inactive' (NOT 'suspended')", async () => {
		const member = makeMember({ status: "active" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const setChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([deactivated])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			tx.insert.mockReturnValueOnce({ values: mock(() => Promise.resolve()) });
			return cb(tx);
		});

		const result = await deactivateMember(mockDb, member.id, MOCK_ACTOR);

		expect(result.status).toBe("inactive");
		expect(result.status).not.toBe("suspended");
	});

	test("does NOT call control panel DB (tenant-only operation)", async () => {
		const member = makeMember({ status: "active" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const setChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([deactivated])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			tx.insert.mockReturnValueOnce({ values: mock(() => Promise.resolve()) });
			return cb(tx);
		});

		await deactivateMember(mockDb, member.id, MOCK_ACTOR);

		// Only tenantDb methods should be called — findFirst for existence check + transaction
		expect(mockDb.query.members.findFirst).toHaveBeenCalledTimes(1);
		expect(mockDb.transaction).toHaveBeenCalledTimes(1);
	});

	test("throws when member not found", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			deactivateMember(mockDb, "nonexistent-id", MOCK_ACTOR),
		).rejects.toThrow("Member not found: nonexistent-id");
	});

	test("can deactivate an already active member", async () => {
		const member = makeMember({ status: "active" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const setChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([deactivated])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			tx.insert.mockReturnValueOnce({ values: mock(() => Promise.resolve()) });
			return cb(tx);
		});

		const result = await deactivateMember(mockDb, member.id, MOCK_ACTOR);

		expect(result.status).toBe("inactive");
	});

	test("does not prevent deactivating a suspended member", async () => {
		// No business rule prevents deactivating a suspended member
		const member = makeMember({ status: "suspended" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		mockDb.transaction.mockImplementationOnce(async (cb: Function) => {
			const tx = createMockTenantDb();
			const setChain = {
				where: mock(() => ({
					returning: mock(() => Promise.resolve([deactivated])),
				})),
			};
			tx.update.mockReturnValueOnce({ set: mock(() => setChain) });
			tx.insert.mockReturnValueOnce({ values: mock(() => Promise.resolve()) });
			return cb(tx);
		});

		const result = await deactivateMember(mockDb, member.id, MOCK_ACTOR);

		expect(result.status).toBe("inactive");
	});
});
