import { describe, it, expect } from "bun:test";
import {
	proposeSchedule,
	coverageForPreferredTimes,
} from "@avantej-core/services";

/**
 * Unit tests for the schedule-proposal service. The service reads the package
 * instance and service via tenantDb.query.*.findFirst; everything else
 * (preferred times, availability, recurring windows) is injected, so these tests
 * run with no database — a minimal fake tenantDb supplies the two findFirst calls.
 */

type FakePkg = {
	id: string;
	serviceId: string;
	clientId: string | null;
	assignedTrainerId: string | null;
	creditsTotal: number;
	creditsUsed: number;
	expiresAt: Date;
};

function makeTenantDb(pkg: FakePkg, durationSeconds = 3600) {
	return {
		query: {
			packageInstances: {
				findFirst: async () => pkg,
			},
			services: {
				findFirst: async () => ({
					id: pkg.serviceId,
					duration: durationSeconds,
				}),
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: minimal fake for unit test
	} as any;
}

const FAR_FUTURE = new Date("2099-12-31T00:00:00");

function makeDeps(opts: {
	preferred?: { dayOfWeek: string; time: string; priority: number }[];
	free?: {
		date: string;
		dayOfWeek: string;
		windows: { startTime: string; endTime: string }[];
	}[];
	recurring?: {
		dayOfWeek: string;
		startTime: string;
		endTime: string;
		kind?: string;
	}[];
}) {
	return {
		listPreferredTimes: async () =>
			(opts.preferred ?? []).map((p, i) => ({
				id: `pt-${i}`,
				packageInstanceId: "pkg-1",
				createdAt: new Date(),
				...p,
			})),
		// biome-ignore lint/suspicious/noExplicitAny: injected stub
		computeAvailableSlots: (async () => opts.free ?? []) as any,
		// biome-ignore lint/suspicious/noExplicitAny: injected stub
		listTrainerAvailability: (async () =>
			(opts.recurring ?? []).map((r, i) => ({
				id: `av-${i}`,
				trainerId: "trainer-1",
				isActive: true,
				kind: r.kind ?? "available",
				createdAt: new Date(),
				updatedAt: new Date(),
				...r,
			}))) as any,
	};
}

describe("proposeSchedule — credit bound", () => {
	it("emits exactly one slot per remaining credit", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 10,
			creditsUsed: 3,
			expiresAt: FAR_FUTURE,
		};
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1", fromDate: "2026-06-01" },
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
				recurring: [
					{ dayOfWeek: "monday", startTime: "08:00", endTime: "18:00" },
				],
				free: [
					{
						date: "2026-06-01",
						dayOfWeek: "monday",
						windows: [{ startTime: "08:00", endTime: "18:00" }],
					},
					{
						date: "2026-06-08",
						dayOfWeek: "monday",
						windows: [{ startTime: "08:00", endTime: "18:00" }],
					},
				],
			}),
		);
		expect(result.creditsRemaining).toBe(7);
		expect(result.proposed).toHaveLength(7);
		expect(result.duration).toBe(60); // 3600s → 60min
	});

	it("returns zero proposed slots when no credits remain", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 5,
			creditsUsed: 5,
			expiresAt: FAR_FUTURE,
		};
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1" },
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
			}),
		);
		expect(result.creditsRemaining).toBe(0);
		expect(result.proposed).toHaveLength(0);
	});
});

describe("proposeSchedule — projection & classification", () => {
	it("projects a Monday preference onto successive Mondays", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 2,
			creditsUsed: 0,
			expiresAt: FAR_FUTURE,
		};
		// 2026-06-01 is a Monday.
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1", fromDate: "2026-06-01" },
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
				recurring: [
					{ dayOfWeek: "monday", startTime: "08:00", endTime: "18:00" },
				],
				free: [
					{
						date: "2026-06-01",
						dayOfWeek: "monday",
						windows: [{ startTime: "08:00", endTime: "18:00" }],
					},
					{
						date: "2026-06-08",
						dayOfWeek: "monday",
						windows: [{ startTime: "08:00", endTime: "18:00" }],
					},
				],
			}),
		);
		expect(result.proposed.map((p) => p.date)).toEqual([
			"2026-06-01",
			"2026-06-08",
		]);
		expect(result.proposed.every((p) => p.time === "09:00")).toBe(true);
		expect(result.proposed.every((p) => p.status === "ok")).toBe(true);
	});

	it("flags outside_availability when the trainer has no window that day", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 1,
			creditsUsed: 0,
			expiresAt: FAR_FUTURE,
		};
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1", fromDate: "2026-06-01" },
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
				recurring: [
					{ dayOfWeek: "tuesday", startTime: "08:00", endTime: "18:00" },
				], // no Monday
				free: [],
			}),
		);
		expect(result.proposed[0]!.status).toBe("outside_availability");
	});

	it("flags conflict when the day has a recurring window but no free slot", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 1,
			creditsUsed: 0,
			expiresAt: FAR_FUTURE,
		};
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1", fromDate: "2026-06-01" },
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
				recurring: [
					{ dayOfWeek: "monday", startTime: "08:00", endTime: "18:00" },
				],
				free: [], // Monday fully booked → no free window returned
			}),
		);
		expect(result.proposed[0]!.status).toBe("conflict");
	});

	it("flags after_expiry when the projected date is past expiry", async () => {
		const pkg: FakePkg = {
			id: "pkg-1",
			serviceId: "svc-1",
			clientId: "client-1",
			assignedTrainerId: "trainer-1",
			creditsTotal: 1,
			creditsUsed: 0,
			expiresAt: new Date("2026-06-02T00:00:00"), // expires before the next Monday
		};
		const result = await proposeSchedule(
			makeTenantDb(pkg),
			{ packageInstanceId: "pkg-1", fromDate: "2026-06-03" }, // Wednesday → next Monday is 2026-06-08
			makeDeps({
				preferred: [{ dayOfWeek: "monday", time: "09:00", priority: 1 }],
				recurring: [
					{ dayOfWeek: "monday", startTime: "08:00", endTime: "18:00" },
				],
				free: [],
			}),
		);
		expect(result.proposed[0]!.status).toBe("after_expiry");
	});
});

describe("coverageForPreferredTimes", () => {
	it("counts how many preferred times fall in the trainer's available windows", async () => {
		const result = await coverageForPreferredTimes(
			// biome-ignore lint/suspicious/noExplicitAny: deps fully injected, tenantDb unused
			{} as any,
			"trainer-1",
			"pkg-1",
			{
				listPreferredTimes: async () =>
					[
						{
							id: "a",
							packageInstanceId: "pkg-1",
							createdAt: new Date(),
							dayOfWeek: "monday",
							time: "09:00",
							priority: 1,
						},
						{
							id: "b",
							packageInstanceId: "pkg-1",
							createdAt: new Date(),
							dayOfWeek: "monday",
							time: "20:00",
							priority: 2,
						},
						{
							id: "c",
							packageInstanceId: "pkg-1",
							createdAt: new Date(),
							dayOfWeek: "sunday",
							time: "10:00",
							priority: 3,
						},
						// biome-ignore lint/suspicious/noExplicitAny: stub rows
					] as any,
				listTrainerAvailability: (async () => [
					{
						dayOfWeek: "monday",
						startTime: "08:00",
						endTime: "18:00",
						kind: "available",
					},
					// biome-ignore lint/suspicious/noExplicitAny: stub rows
				]) as any,
			},
		);
		expect(result.totalCount).toBe(3);
		expect(result.coveredCount).toBe(1); // only Monday 09:00 fits 08:00–18:00
		expect(result.coverage.find((c) => c.time === "09:00")!.covered).toBe(true);
		expect(result.coverage.find((c) => c.time === "20:00")!.covered).toBe(
			false,
		);
		expect(result.coverage.find((c) => c.dayOfWeek === "sunday")!.covered).toBe(
			false,
		);
	});
});
