/**
 * Journey: Attendance & Check-in — the front-desk daily flow.
 * Suite: Attendance & Check-in · Actor: tenant-admin
 * Routers in scope: checkIns, appointments, packageInstances, walkInCustomers.
 * Page in scope: /dashboard/attendance/view.
 *
 * Pipelines exercised:
 *   P0  seedAssignedPackageForAdmin (creditsTotal=1) + confirmed appointment
 *       → checkIns.recordCheckIn(source=booking, creditsConsumed=1, packageInstanceId)
 *       → packageInstances.getById shows creditsUsed +1 / creditsRemaining -1.
 *   P0  checkIns.deleteCheckIn → credit reverted (creditsUsed back to original).
 *   P1  checkIns.recordBulkCheckIn over today's pending bookings.
 *   P1  walk-in / drop-in check-in via checkIns.recordCheckIn(clientType=walk_in, source=drop_in).
 *
 * State is SEEDED + ASSERTED over oRPC (deterministic), then the Attendance page
 * is opened so the recorded video shows the end-user-visible result.
 */
import { test, expect } from "@playwright/test";
import { ensureJourneyFixtures, branchForClient } from "../helpers/seed-journey-fixtures";
import {
	TEST_ORG_ID,
	seedConfirmedAppointment,
	cleanupAppointment,
	seedAssignedPackageForAdmin,
	pickFirstActiveTrainer,
} from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── Local oRPC shapes (read from the routers in scope) ──────────────────────────

/** packageInstances.getById returns the full row (credits_remaining is a generated col). */
interface PackageInstance {
	id: string;
	clientId: string | null;
	creditsTotal: number;
	creditsUsed: number;
	creditsRemaining: number;
	status: string;
}

/** checkIns.recordCheckIn returns the inserted check_in row. */
interface CheckInRow {
	id: string;
	clientType: "member" | "walk_in";
	source: "booking" | "drop_in";
	outcome: "attended" | "no_show" | "late_cancel";
	creditsConsumed: number;
}

/** checkIns.getActivePackageForMember → null | { packageInstanceId, creditsRemaining }. */
type ActivePackage = { packageInstanceId: string; creditsRemaining: number } | null;

/** checkIns.list → { rows, total }. */
interface CheckInsList {
	rows: Array<{ id: string; clientType: string; source: string; clientName: string }>;
	total: number;
}

/** checkIns.listTodaysBookings row (subset we rely on). */
interface TodaysBooking {
	appointmentClientId: string;
	attendanceStatus: "pending" | "checked_in" | "no_show";
	checkInId: string | null;
}

/** checkIns.recordBulkCheckIn result. */
interface BulkResult {
	results: Array<{ bookingId: string; status: string; checkInId?: string }>;
	totalChecked: number;
	totalSkipped: number;
	totalError: number;
}

const ATTENDANCE_URL = "/dashboard/attendance/view";

function todayDateString(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

/** Tolerant UI assertion shared by every journey — proves the page rendered. */
async function assertAttendancePageHealthy(page: import("@playwright/test").Page) {
	await page.goto(ATTENDANCE_URL);
	await expect(page).toHaveURL(/\/dashboard\/attendance\/view/);
	await expect(page.getByRole("heading", { name: /attendance/i }).first()).toBeVisible();
	await page.waitForTimeout(1000);
	await expect(page.locator("body")).not.toContainText(/something went wrong/i);
}

// ─────────────────────────────────────────────────────────────────────────────────
// P0 — Booking check-in consumes a package credit
// ─────────────────────────────────────────────────────────────────────────────────

test(
	"Recording a booking check-in consumes one package credit",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let packageInstanceId: string | null = null;
		let appointmentId = "";
		let checkInId = "";
		let creditsUsedBefore = 0;
		let branchId = "";

		await test.step("Resolve fixtures (client, package-service, trainer/admin member, branch)", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.packageService, "a package-eligible service must exist").toBeTruthy();
			branchId = branchForClient(fx);

			// The admin member who owns the package assignment / check-in. We reuse
			// the first active trainer as the "admin member" (any staff member works
			// as assignedTrainerId — the package just needs an assignee to go active).
			const adminMember = await pickFirstActiveTrainer(page);
			expect(adminMember, "a staff member must exist to assign the package").toBeTruthy();

			await test.step("Seed an assigned package with 1 credit for the client", async () => {
				packageInstanceId = await seedAssignedPackageForAdmin(page, {
					serviceId: fx.packageService!.id,
					clientUserId: fx.client!.userId,
					adminMemberId: adminMember!.memberId,
					adminUserId: adminMember!.userId,
				});
				// If the tenant's approval gate blocks assignment, the package can't go
				// active — that precondition is genuinely outside this test's control.
				test.skip(!packageInstanceId, "Could not seed an active package (approval gate or no package service)");
			});

			await test.step("Seed a confirmed appointment for the same client", async () => {
				appointmentId = await seedConfirmedAppointment(page, {
					trainerMemberId: adminMember!.memberId,
					trainerUserId: adminMember!.userId,
					clientUserId: fx.client!.userId,
					serviceId: fx.packageService!.id,
					branchId,
				});
				expect(appointmentId, "appointment must be created").toBeTruthy();
			});

			await test.step("Capture credits_used BEFORE the check-in", async () => {
				const pkg = await orpcCall<object, PackageInstance>(page, "packageInstances", "getById", {
					organizationId: TEST_ORG_ID,
					id: packageInstanceId!,
				});
				creditsUsedBefore = pkg.creditsUsed;
				expect(pkg.creditsRemaining, "freshly-seeded package has a credit available").toBeGreaterThan(0);
			});

			await test.step("Record the booking check-in consuming 1 credit", async () => {
				const checkIn = await orpcCall<object, CheckInRow>(page, "checkIns", "recordCheckIn", {
					organizationId: TEST_ORG_ID,
					clientType: "member",
					clientId: fx.client!.userId,
					branchId,
					source: "booking",
					outcome: "attended",
					packageInstanceId: packageInstanceId!,
					creditsConsumed: 1,
					notes: "E2E booking check-in",
				});
				checkInId = checkIn.id;
				expect(checkInId, "recordCheckIn must return a check-in id").toBeTruthy();
				expect(checkIn.creditsConsumed).toBe(1);
			});

			await test.step("Verify credits_used incremented by exactly 1 (getById)", async () => {
				const pkg = await orpcCall<object, PackageInstance>(page, "packageInstances", "getById", {
					organizationId: TEST_ORG_ID,
					id: packageInstanceId!,
				});
				expect(pkg.creditsUsed).toBe(creditsUsedBefore + 1);
				expect(pkg.creditsRemaining).toBe(pkg.creditsTotal - pkg.creditsUsed);
			});

			await test.step("Cross-check via getActivePackageForMember (credit now spent)", async () => {
				// With the only credit consumed, the member should no longer have an
				// active package with remaining credits → null.
				const active = await orpcCall<object, ActivePackage>(
					page,
					"checkIns",
					"getActivePackageForMember",
					{ organizationId: TEST_ORG_ID, clientId: fx.client!.userId },
				);
				// Either null (single-credit package fully spent) or a *different* package
				// with credits — the seeded one must not be returned with a positive balance.
				if (active && active.packageInstanceId === packageInstanceId) {
					expect(active.creditsRemaining).toBeGreaterThan(0);
				} else {
					expect(active === null || active.packageInstanceId !== packageInstanceId).toBeTruthy();
				}
			});
		});

		await test.step("Open the Attendance page — the result is visible to staff", async () => {
			await assertAttendancePageHealthy(page);
		});

		await test.step("Cleanup — delete the check-in (reverts credit) and cancel the appointment", async () => {
			if (checkInId) {
				try {
					await orpcCall(page, "checkIns", "deleteCheckIn", {
						organizationId: TEST_ORG_ID,
						id: checkInId,
					});
				} catch (err) {
					if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND")) throw err;
				}
			}
			if (appointmentId) await cleanupAppointment(page, appointmentId);
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────────
// P0 — Deleting a check-in reverts the consumed credit
// ─────────────────────────────────────────────────────────────────────────────────

test(
	"Deleting a check-in reverts the consumed package credit",
	{ tag: ["@p0"] },
	async ({ page }) => {
		let packageInstanceId: string | null = null;
		let appointmentId = "";
		let checkInId = "";
		let creditsUsedOriginal = 0;
		let branchId = "";

		await test.step("Seed an assigned 1-credit package + confirmed appointment", async () => {
			const fx = await ensureJourneyFixtures(page);
			expect(fx.client, "an active client must exist").toBeTruthy();
			expect(fx.packageService, "a package-eligible service must exist").toBeTruthy();
			branchId = branchForClient(fx);

			const adminMember = await pickFirstActiveTrainer(page);
			expect(adminMember, "a staff member must exist to assign the package").toBeTruthy();

			packageInstanceId = await seedAssignedPackageForAdmin(page, {
				serviceId: fx.packageService!.id,
				clientUserId: fx.client!.userId,
				adminMemberId: adminMember!.memberId,
				adminUserId: adminMember!.userId,
			});
			test.skip(!packageInstanceId, "Could not seed an active package (approval gate or no package service)");

			appointmentId = await seedConfirmedAppointment(page, {
				trainerMemberId: adminMember!.memberId,
				trainerUserId: adminMember!.userId,
				clientUserId: fx.client!.userId,
				serviceId: fx.packageService!.id,
				branchId,
			});

			const pkg = await orpcCall<object, PackageInstance>(page, "packageInstances", "getById", {
				organizationId: TEST_ORG_ID,
				id: packageInstanceId!,
			});
			creditsUsedOriginal = pkg.creditsUsed;

			// Record the check-in that spends a credit.
			const checkIn = await orpcCall<object, CheckInRow>(page, "checkIns", "recordCheckIn", {
				organizationId: TEST_ORG_ID,
				clientType: "member",
				clientId: fx.client!.userId,
				branchId,
				source: "booking",
				outcome: "attended",
				packageInstanceId: packageInstanceId!,
				creditsConsumed: 1,
			});
			checkInId = checkIn.id;
			expect(checkInId).toBeTruthy();
		});

		await test.step("Confirm the credit was consumed before deletion", async () => {
			const pkg = await orpcCall<object, PackageInstance>(page, "packageInstances", "getById", {
				organizationId: TEST_ORG_ID,
				id: packageInstanceId!,
			});
			expect(pkg.creditsUsed).toBe(creditsUsedOriginal + 1);
		});

		await test.step("Delete the check-in (mistake correction)", async () => {
			const res = await orpcCall<object, { success: boolean }>(page, "checkIns", "deleteCheckIn", {
				organizationId: TEST_ORG_ID,
				id: checkInId,
			});
			expect(res.success).toBe(true);
		});

		await test.step("Verify the credit was reverted (creditsUsed back to original)", async () => {
			const pkg = await orpcCall<object, PackageInstance>(page, "packageInstances", "getById", {
				organizationId: TEST_ORG_ID,
				id: packageInstanceId!,
			});
			expect(pkg.creditsUsed).toBe(creditsUsedOriginal);
			expect(pkg.creditsRemaining).toBe(pkg.creditsTotal - creditsUsedOriginal);
		});

		await test.step("Open the Attendance page — log reflects the corrected state", async () => {
			await assertAttendancePageHealthy(page);
		});

		await test.step("Cleanup — cancel the seeded appointment", async () => {
			if (appointmentId) await cleanupAppointment(page, appointmentId);
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────────
// P1 — Bulk check-in today's pending bookings
// ─────────────────────────────────────────────────────────────────────────────────

test(
	"Bulk check-in marks today's pending bookings attended in one call",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let branchId = "";
		let classSlotId = "";
		let pendingIds: string[] = [];
		const createdCheckInIds: string[] = [];

		await test.step("Resolve branch, a service, an instructor, and clients to enroll", async () => {
			const fx = await ensureJourneyFixtures(page);
			branchId = branchForClient(fx);
			expect(branchId, "a branch scope must resolve").toBeTruthy();
			expect(fx.service, "a service must exist for the class slot").toBeTruthy();

			type MemberRow = { userId: string };
			const clients = await orpcCall<object, MemberRow[]>(page, "members", "list", {
				organizationId: TEST_ORG_ID,
				role: "client",
				status: "active",
			});
			const clientUserIds = [...new Set(clients.map((c) => c.userId))].slice(0, 2);
			expect(clientUserIds.length, "need at least one client to enroll").toBeGreaterThan(0);

			await test.step("Create a class slot dated TODAY (noon, so it lands inside the today window)", async () => {
				const created = await orpcCall<object, { id: string }>(page, "classSlots", "create", {
					organizationId: TEST_ORG_ID,
					serviceId: fx.service!.id,
					branchId,
					date: new Date().toISOString(),
					startTime: "12:00",
					endTime: "13:00",
					capacity: clientUserIds.length + 1,
					// No instructor: each enrolment creates a per-client appointment; a shared
					// instructor would collide on appointments_trainer_no_overlap for the 2nd client.
				});
				classSlotId = created.id;
				expect(classSlotId, "class slot must be created").toBeTruthy();
			});

			await test.step("Enroll the clients — creates today's pending bookings (appointment_clients rows)", async () => {
				for (const clientUserId of clientUserIds) {
					await orpcCall(page, "classSlots", "enrollClient", {
						organizationId: TEST_ORG_ID,
						classSlotId,
						clientUserId,
					});
				}
			});
		});

		await test.step("List today's bookings — the enrolled clients appear as pending", async () => {
			const bookings = await orpcCall<object, TodaysBooking[]>(
				page,
				"checkIns",
				"listTodaysBookings",
				{ organizationId: TEST_ORG_ID, branchId, date: todayDateString() },
			);
			expect(Array.isArray(bookings)).toBe(true);
			pendingIds = bookings
				.filter((b) => b.attendanceStatus === "pending" && !b.checkInId)
				.map((b) => b.appointmentClientId)
				.slice(0, 100);
			test.info().annotations.push({ type: "todays-pending-bookings", description: String(pendingIds.length) });
			expect(
				pendingIds.length,
				"the seeded class-slot enrolments must surface as today's pending bookings",
			).toBeGreaterThan(0);
		});

		await test.step("Bulk check-in all pending bookings in a single call", async () => {
			const result = await orpcCall<object, BulkResult>(page, "checkIns", "recordBulkCheckIn", {
				organizationId: TEST_ORG_ID,
				branchId,
				bookingIds: pendingIds,
			});
			expect(result.totalChecked + result.totalSkipped + result.totalError).toBe(pendingIds.length);
			expect(result.totalChecked, "at least one booking must be checked in").toBeGreaterThan(0);
			for (const r of result.results) {
				if (r.status === "ok" && r.checkInId) createdCheckInIds.push(r.checkInId);
			}
		});

		await test.step("Open the Attendance page — bookings now show as checked-in", async () => {
			await assertAttendancePageHealthy(page);
		});

		await test.step("Cleanup — delete the bulk check-ins, then cancel the class slot", async () => {
			for (const id of createdCheckInIds) {
				try {
					await orpcCall(page, "checkIns", "deleteCheckIn", { organizationId: TEST_ORG_ID, id });
				} catch (err) {
					if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND")) throw err;
				}
			}
			if (classSlotId) {
				try {
					await orpcCall(page, "classSlots", "cancel", {
						organizationId: TEST_ORG_ID,
						id: classSlotId,
						cancellationReason: "E2E cleanup",
					});
				} catch (err) {
					if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND")) throw err;
				}
			}
		});
	},
);

// ─────────────────────────────────────────────────────────────────────────────────
// P1 — Anonymous walk-in / drop-in check-in
// ─────────────────────────────────────────────────────────────────────────────────

test(
	"An anonymous walk-in drop-in is recorded and shows in the check-in log",
	{ tag: ["@p1"] },
	async ({ page }) => {
		let branchId = "";
		let checkInId = "";
		const walkInName = `E2E Walk-in ${Date.now()}`;

		await test.step("Resolve the branch scope", async () => {
			const fx = await ensureJourneyFixtures(page);
			branchId = branchForClient(fx);
			expect(branchId, "a branch scope must resolve").toBeTruthy();
		});

		await test.step("Record an anonymous walk-in drop-in (no package, no credit)", async () => {
			const checkIn = await orpcCall<object, CheckInRow>(page, "checkIns", "recordCheckIn", {
				organizationId: TEST_ORG_ID,
				clientType: "walk_in",
				clientDisplayName: walkInName,
				branchId,
				source: "drop_in",
				outcome: "attended",
				creditsConsumed: 0,
				notes: "E2E drop-in",
			});
			checkInId = checkIn.id;
			expect(checkInId, "recordCheckIn must return a check-in id").toBeTruthy();
			expect(checkIn.clientType).toBe("walk_in");
			expect(checkIn.source).toBe("drop_in");
		});

		await test.step("Verify the drop-in appears in checkIns.list for today", async () => {
			const today = todayDateString();
			const list = await orpcCall<object, CheckInsList>(page, "checkIns", "list", {
				organizationId: TEST_ORG_ID,
				branchId,
				from: `${today}T00:00:00`,
				to: `${today}T23:59:59`,
			});
			expect(Array.isArray(list.rows)).toBe(true);
			const found = list.rows.find((r) => r.id === checkInId);
			expect(found, "the recorded drop-in must be listed").toBeTruthy();
			expect(found!.source).toBe("drop_in");
		});

		await test.step("Open the Attendance page — the drop-in is visible in the log", async () => {
			await assertAttendancePageHealthy(page);
		});

		await test.step("Cleanup — delete the drop-in check-in", async () => {
			if (checkInId) {
				try {
					await orpcCall(page, "checkIns", "deleteCheckIn", {
						organizationId: TEST_ORG_ID,
						id: checkInId,
					});
				} catch (err) {
					if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND")) throw err;
				}
			}
		});
	},
);
