import { describe, expect, it, mock } from "bun:test";
import {
	addTrainerAvailabilityException,
	deleteTrainerAvailabilityException,
	listTrainerAvailabilityExceptions,
} from "./trainer-availability.service";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyTenantDb = any;

describe("addTrainerAvailabilityException", () => {
	it("inserts a row and returns it", async () => {
		const returningMock = mock(() =>
			Promise.resolve([
				{
					id: "exc-1",
					trainerId: "t-1",
					date: "2026-06-15",
					kind: "timeoff",
					reason: "Vacation",
					createdAt: new Date(),
					createdBy: "u-1",
				},
			]),
		);
		const valuesMock = mock(() => ({ returning: returningMock }));
		const insertMock = mock(() => ({ values: valuesMock }));

		const tenantDb: AnyTenantDb = { insert: insertMock };

		const result = await addTrainerAvailabilityException(tenantDb, {
			trainerId: "t-1",
			date: "2026-06-15",
			kind: "timeoff",
			reason: "Vacation",
			createdBy: "u-1",
		});

		expect(insertMock).toHaveBeenCalledTimes(1);
		expect(valuesMock).toHaveBeenCalledWith({
			trainerId: "t-1",
			date: "2026-06-15",
			kind: "timeoff",
			reason: "Vacation",
			createdBy: "u-1",
		});
		expect(result.id).toBe("exc-1");
		expect(result.kind).toBe("timeoff");
	});

	it("throws when insert returns no rows (DB error)", async () => {
		const tenantDb: AnyTenantDb = {
			insert: () => ({
				values: () => ({ returning: () => Promise.resolve([]) }),
			}),
		};

		await expect(
			addTrainerAvailabilityException(tenantDb, {
				trainerId: "t-1",
				date: "2026-06-15",
				kind: "blocked",
			}),
		).rejects.toThrow("Failed to create trainer availability exception");
	});
});

describe("listTrainerAvailabilityExceptions", () => {
	it("sorts results by date ascending", async () => {
		const rows = [
			{ id: "a", trainerId: "t-1", date: "2026-08-01", kind: "timeoff" },
			{ id: "b", trainerId: "t-1", date: "2026-06-01", kind: "timeoff" },
			{ id: "c", trainerId: "t-1", date: "2026-07-01", kind: "blocked" },
		];

		const whereMock = mock(() => Promise.resolve(rows));
		const fromMock = mock(() => ({ where: whereMock }));
		const selectMock = mock(() => ({ from: fromMock }));

		const tenantDb: AnyTenantDb = { select: selectMock };

		const result = await listTrainerAvailabilityExceptions(tenantDb, "t-1");

		expect(result.map((r) => r.date)).toEqual([
			"2026-06-01",
			"2026-07-01",
			"2026-08-01",
		]);
	});

	it("applies date range filter when provided", async () => {
		const whereMock = mock(() => Promise.resolve([]));
		const tenantDb: AnyTenantDb = {
			select: () => ({ from: () => ({ where: whereMock }) }),
		};

		await listTrainerAvailabilityExceptions(tenantDb, "t-1", {
			from: "2026-06-01",
			to: "2026-06-30",
		});

		// `where` is called with an `and(...)` of conditions — assertion at this
		// level just verifies the path runs without error. Drizzle's SQL builder
		// types prevent richer assertions without integration tests.
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});

describe("deleteTrainerAvailabilityException", () => {
	it("calls delete().where(eq(id))", async () => {
		const whereMock = mock(() => Promise.resolve(undefined));
		const deleteMock = mock(() => ({ where: whereMock }));

		const tenantDb: AnyTenantDb = { delete: deleteMock };

		await deleteTrainerAvailabilityException(tenantDb, "exc-1");

		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});
