import { describe, expect, it, mock } from "bun:test";
import {
	computeNextRunAt,
	createScheduledReport,
	deleteScheduledReport,
	listDueScheduledReports,
	listScheduledReports,
	markScheduledReportFailed,
	markScheduledReportSent,
	toggleScheduledReportActive,
} from "./scheduled-reports.service";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyTenantDb = any;

describe("computeNextRunAt", () => {
	it("daily → +1 day", () => {
		const from = new Date("2026-06-15T10:00:00Z");
		const next = computeNextRunAt(from, "daily");
		expect(next.toISOString()).toBe("2026-06-16T10:00:00.000Z");
	});

	it("weekly → +7 days", () => {
		const from = new Date("2026-06-15T10:00:00Z");
		const next = computeNextRunAt(from, "weekly");
		expect(next.toISOString()).toBe("2026-06-22T10:00:00.000Z");
	});

	it("monthly → +1 calendar month", () => {
		const from = new Date("2026-06-15T10:00:00Z");
		const next = computeNextRunAt(from, "monthly");
		expect(next.toISOString()).toBe("2026-07-15T10:00:00.000Z");
	});

	it("monthly handles end-of-month rollover (Jan 31 → Mar 3)", () => {
		// setMonth advances by 1, but Feb has fewer days, so the date overflows
		// into March — documented quirk; we keep it because it's symmetric and
		// users don't typically pick day-31 scheduling for monthly reports.
		const from = new Date("2026-01-31T00:00:00Z");
		const next = computeNextRunAt(from, "monthly");
		expect(next.getUTCMonth()).toBe(2); // March (0-indexed)
	});
});

describe("createScheduledReport", () => {
	it("creates a row with default startAt = now and format = pdf", async () => {
		const returningMock = mock(() =>
			Promise.resolve([
				{
					id: "sr-1",
					recipients: "a@b.com",
					reportName: "Test",
					windowKey: "7D",
					format: "pdf",
					frequency: "weekly",
					isActive: true,
					nextRunAt: new Date(),
					lastSentAt: null,
					lastError: null,
					createdAt: new Date(),
					createdBy: null,
				},
			]),
		);
		const valuesMock = mock(() => ({ returning: returningMock }));
		const tenantDb: AnyTenantDb = {
			insert: () => ({ values: valuesMock }),
		};

		const result = await createScheduledReport(tenantDb, {
			recipients: "a@b.com",
			reportName: "Test",
			windowKey: "7D",
			frequency: "weekly",
		});

		expect(valuesMock).toHaveBeenCalledTimes(1);
		const insertArgs = valuesMock.mock.calls[0][0];
		expect(insertArgs.format).toBe("pdf");
		expect(insertArgs.isActive).toBe(true);
		expect(insertArgs.nextRunAt).toBeInstanceOf(Date);
		expect(result.id).toBe("sr-1");
	});

	it("throws when insert returns no rows", async () => {
		const tenantDb: AnyTenantDb = {
			insert: () => ({
				values: () => ({ returning: () => Promise.resolve([]) }),
			}),
		};
		await expect(
			createScheduledReport(tenantDb, {
				recipients: "a@b.com",
				reportName: "X",
				windowKey: "30D",
				frequency: "daily",
			}),
		).rejects.toThrow("Failed to create scheduled report");
	});
});

describe("listScheduledReports", () => {
	it("returns rows sorted by createdAt ascending", async () => {
		const rows = [
			{ id: "b", createdAt: new Date("2026-06-02T00:00:00Z") },
			{ id: "a", createdAt: new Date("2026-06-01T00:00:00Z") },
			{ id: "c", createdAt: new Date("2026-06-03T00:00:00Z") },
		];
		const tenantDb: AnyTenantDb = {
			select: () => ({ from: () => Promise.resolve(rows) }),
		};

		const result = await listScheduledReports(tenantDb);
		expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
	});
});

describe("deleteScheduledReport", () => {
	it("calls delete().where()", async () => {
		const whereMock = mock(() => Promise.resolve(undefined));
		const tenantDb: AnyTenantDb = {
			delete: () => ({ where: whereMock }),
		};
		await deleteScheduledReport(tenantDb, "sr-1");
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});

describe("toggleScheduledReportActive", () => {
	it("updates isActive and returns the new row", async () => {
		const returningMock = mock(() =>
			Promise.resolve([{ id: "sr-1", isActive: false }]),
		);
		const whereMock = mock(() => ({ returning: returningMock }));
		const setMock = mock(() => ({ where: whereMock }));
		const tenantDb: AnyTenantDb = {
			update: () => ({ set: setMock }),
		};

		const result = await toggleScheduledReportActive(tenantDb, "sr-1", false);

		expect(setMock).toHaveBeenCalledWith({ isActive: false });
		expect(result.isActive).toBe(false);
	});

	it("throws when row not found", async () => {
		const tenantDb: AnyTenantDb = {
			update: () => ({
				set: () => ({
					where: () => ({ returning: () => Promise.resolve([]) }),
				}),
			}),
		};
		await expect(
			toggleScheduledReportActive(tenantDb, "missing", true),
		).rejects.toThrow("Scheduled report not found");
	});
});

describe("listDueScheduledReports", () => {
	it("queries active rows where nextRunAt <= now", async () => {
		const due = [{ id: "sr-1" }];
		const whereMock = mock(() => Promise.resolve(due));
		const fromMock = mock(() => ({ where: whereMock }));
		const tenantDb: AnyTenantDb = { select: () => ({ from: fromMock }) };

		const now = new Date("2026-06-15T10:00:00Z");
		const result = await listDueScheduledReports(tenantDb, now);

		expect(result).toEqual(due);
		expect(whereMock).toHaveBeenCalledTimes(1);
	});
});

describe("markScheduledReportSent", () => {
	it("advances nextRunAt by frequency and clears lastError", async () => {
		const updateWhereMock = mock(() => Promise.resolve(undefined));
		const updateSetMock = mock(() => ({ where: updateWhereMock }));
		const tenantDb: AnyTenantDb = {
			select: () => ({
				from: () => ({
					where: () =>
						Promise.resolve([
							{
								id: "sr-1",
								frequency: "weekly",
							},
						]),
				}),
			}),
			update: () => ({ set: updateSetMock }),
		};

		const sentAt = new Date("2026-06-15T10:00:00Z");
		await markScheduledReportSent(tenantDb, "sr-1", sentAt);

		expect(updateSetMock).toHaveBeenCalledTimes(1);
		const setArgs = updateSetMock.mock.calls[0][0];
		expect(setArgs.lastSentAt).toEqual(sentAt);
		expect(setArgs.lastError).toBeNull();
		expect(setArgs.nextRunAt).toBeInstanceOf(Date);
		// weekly → +7 days
		expect((setArgs.nextRunAt as Date).toISOString()).toBe(
			"2026-06-22T10:00:00.000Z",
		);
	});

	it("no-ops when row not found", async () => {
		const updateMock = mock(() => ({ set: () => ({ where: () => null }) }));
		const tenantDb: AnyTenantDb = {
			select: () => ({
				from: () => ({ where: () => Promise.resolve([]) }),
			}),
			update: updateMock,
		};

		await markScheduledReportSent(tenantDb, "missing");

		expect(updateMock).not.toHaveBeenCalled();
	});
});

describe("markScheduledReportFailed", () => {
	it("bumps nextRunAt forward by 1 hour and stores error message", async () => {
		const updateWhereMock = mock(() => Promise.resolve(undefined));
		const updateSetMock = mock(() => ({ where: updateWhereMock }));
		const tenantDb: AnyTenantDb = {
			select: () => ({
				from: () => ({
					where: () =>
						Promise.resolve([{ id: "sr-1", frequency: "daily" }]),
				}),
			}),
			update: () => ({ set: updateSetMock }),
		};

		const before = Date.now();
		await markScheduledReportFailed(tenantDb, "sr-1", "Resend rate limit");
		const after = Date.now();

		expect(updateSetMock).toHaveBeenCalledTimes(1);
		const setArgs = updateSetMock.mock.calls[0][0];
		expect(setArgs.lastError).toBe("Resend rate limit");

		// nextRunAt should be ~1 hour from "now" at call time
		const ts = (setArgs.nextRunAt as Date).getTime();
		expect(ts).toBeGreaterThanOrEqual(before + 60 * 60 * 1000 - 100);
		expect(ts).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 100);
	});

	it("truncates long error messages to 500 chars", async () => {
		const updateSetMock = mock(() => ({ where: () => Promise.resolve() }));
		const tenantDb: AnyTenantDb = {
			select: () => ({
				from: () => ({
					where: () =>
						Promise.resolve([{ id: "sr-1", frequency: "daily" }]),
				}),
			}),
			update: () => ({ set: updateSetMock }),
		};

		const longMsg = "x".repeat(1000);
		await markScheduledReportFailed(tenantDb, "sr-1", longMsg);

		const setArgs = updateSetMock.mock.calls[0][0];
		expect((setArgs.lastError as string).length).toBe(500);
	});
});
