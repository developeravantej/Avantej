import { describe, test, expect, mock } from "bun:test";
import { assertExists } from "@avantej-core/services/lib/fk-guard";

// Minimal mock table shape — assertExists only needs `table.id`
const mockTable = { id: "id" } as any;

function makeMockDb(rows: unknown[]) {
	const chain: Record<string, unknown> = {};
	for (const m of ["from", "where", "limit"]) {
		chain[m] = mock(() => chain);
	}
	chain.then = (resolve: (v: unknown) => unknown) =>
		Promise.resolve(rows).then(resolve);
	return {
		select: mock(() => chain),
	} as any;
}

describe("assertExists", () => {
	test("throws ORPCError NOT_FOUND when tenantDb returns empty array", async () => {
		const db = makeMockDb([]);

		await expect(
			assertExists(db, mockTable, "test-id-123", "MyEntity"),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
		});
	});

	test("throws ORPCError NOT_FOUND with the entityId in the message", async () => {
		const db = makeMockDb([]);

		await expect(
			assertExists(db, mockTable, "test-id-123", "MyEntity"),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: expect.stringContaining("test-id-123"),
		});
	});

	test("does not throw when tenantDb returns one matching row", async () => {
		const db = makeMockDb([{ id: "test-id-123" }]);

		await expect(
			assertExists(db, mockTable, "test-id-123", "MyEntity"),
		).resolves.toBeUndefined();
	});

	test("does not throw when tenantDb returns multiple rows", async () => {
		const db = makeMockDb([{ id: "a" }, { id: "b" }]);

		await expect(
			assertExists(db, mockTable, "any-id", "MyEntity"),
		).resolves.toBeUndefined();
	});
});
