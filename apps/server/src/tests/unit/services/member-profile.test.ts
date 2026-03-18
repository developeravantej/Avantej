import { describe, test, expect, beforeEach, mock } from "bun:test";
import { createMockTenantDb } from "../../helpers/db-mock.factory";
import { makeMemberProfile } from "../../helpers/fixtures";

import {
	getMemberProfile,
	upsertMemberProfile,
} from "@avantej-core/services/member-profile.service";

let mockDb: ReturnType<typeof createMockTenantDb>;
const MEMBER_ID = "bbbbbbbb-0000-4000-8000-000000000001";

beforeEach(() => {
	mockDb = createMockTenantDb();
});

// ─── getMemberProfile ────────────────────────────────────────────────────────
describe("getMemberProfile", () => {
	test("returns profile when found", async () => {
		const profile = makeMemberProfile();
		mockDb.query.memberProfiles.findFirst.mockResolvedValueOnce(profile);

		const result = await getMemberProfile(mockDb, MEMBER_ID);

		expect(result).toEqual(profile);
		expect(mockDb.query.memberProfiles.findFirst).toHaveBeenCalledTimes(1);
	});

	test("returns null when no profile exists", async () => {
		mockDb.query.memberProfiles.findFirst.mockResolvedValueOnce(undefined);

		const result = await getMemberProfile(mockDb, MEMBER_ID);

		expect(result).toBeNull();
	});
});

// ─── upsertMemberProfile ────────────────────────────────────────────────────
describe("upsertMemberProfile", () => {
	test("inserts when no profile exists (upsert via onConflictDoUpdate)", async () => {
		const profile = makeMemberProfile();
		// upsert uses insert().values().onConflictDoUpdate().returning()
		const onConflictChain = {
			returning: mock(() => Promise.resolve([profile])),
		};
		const valuesChain = {
			onConflictDoUpdate: mock(() => onConflictChain),
		};
		const insertChain = { values: mock(() => valuesChain) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		const result = await upsertMemberProfile(mockDb, MEMBER_ID, {
			displayName: "John Trainer",
			bio: "Certified personal trainer",
		});

		expect(result).toEqual(profile);
		expect(mockDb.insert).toHaveBeenCalledTimes(1);
	});

	test("updates when profile already exists (no duplicate key error)", async () => {
		const updatedProfile = makeMemberProfile({
			displayName: "Updated Name",
		});
		const onConflictChain = {
			returning: mock(() => Promise.resolve([updatedProfile])),
		};
		const valuesChain = {
			onConflictDoUpdate: mock(() => onConflictChain),
		};
		const insertChain = { values: mock(() => valuesChain) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		const result = await upsertMemberProfile(mockDb, MEMBER_ID, {
			displayName: "Updated Name",
		});

		expect(result.displayName).toBe("Updated Name");
	});

	test("throws when returning no rows", async () => {
		const onConflictChain = {
			returning: mock(() => Promise.resolve([])),
		};
		const valuesChain = {
			onConflictDoUpdate: mock(() => onConflictChain),
		};
		const insertChain = { values: mock(() => valuesChain) };
		mockDb.insert.mockReturnValueOnce(insertChain);

		await expect(
			upsertMemberProfile(mockDb, MEMBER_ID, { displayName: "fail" }),
		).rejects.toThrow("Failed to upsert member profile");
	});
});
