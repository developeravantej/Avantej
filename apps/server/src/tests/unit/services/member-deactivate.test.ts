import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeMember } from "../../helpers/fixtures";

// deactivateMember is NOT in the index.ts exports — import directly from service file
import { deactivateMember } from "@avantej-core/services/member.service";

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

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateMember(mockDb, member.id);

		expect(result.status).toBe("inactive");
		expect(result.status).not.toBe("suspended");
		expect(mockDb.update).toHaveBeenCalledTimes(1);
	});

	test("does NOT call control panel DB (tenant-only operation)", async () => {
		const member = makeMember({ status: "active" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		await deactivateMember(mockDb, member.id);

		// Only tenantDb methods should be called
		expect(mockDb.query.members.findFirst).toHaveBeenCalledTimes(1);
		expect(mockDb.update).toHaveBeenCalledTimes(1);
		// The function only takes tenantDb — no controlPanelDb parameter
	});

	test("throws when member not found", async () => {
		mockDb.query.members.findFirst.mockResolvedValueOnce(undefined);

		await expect(
			deactivateMember(mockDb, "nonexistent-id"),
		).rejects.toThrow("Member not found: nonexistent-id");
	});

	test("can deactivate an already active member", async () => {
		const member = makeMember({ status: "active" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateMember(mockDb, member.id);

		expect(result.status).toBe("inactive");
	});

	test("does not prevent deactivating a suspended member", async () => {
		// No business rule prevents deactivating a suspended member
		const member = makeMember({ status: "suspended" });
		const deactivated = { ...member, status: "inactive" };

		mockDb.query.members.findFirst.mockResolvedValueOnce(member);

		const setChain = {
			where: mock(() => ({
				returning: mock(() => Promise.resolve([deactivated])),
			})),
		};
		mockDb.update.mockReturnValueOnce({ set: mock(() => setChain) });

		const result = await deactivateMember(mockDb, member.id);

		expect(result.status).toBe("inactive");
	});
});
