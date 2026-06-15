/**
 * Journey suite: Appointments & Scheduling (expanded)
 * Actor: tenant-admin · Tiers: P1
 *
 * Routers in scope: appointments, classSlots, rooms, trainerAvailability,
 *                   serviceCategoryConfig, preferredTimes.
 * Pages in scope: appointment/view, appointment/class-slots/view,
 *                 rooms/view (redirects → service/view?tab=rooms),
 *                 trainers/availability.
 *
 * Each journey SEEDS + ASSERTS state via oRPC (deterministic + robust), then
 * navigates the relevant /dashboard surface and adds a tolerant UI assertion so
 * the recorded video shows the end-user-visible result.
 *
 * oRPC shapes verified against source (do NOT trust memory):
 *  - appointments.create — recurrence is a nested object {frequencyValue,timeUnit,
 *    repeatOn?,endsType,endsAfterOccurrences?,endsOn?}. Returns the parent row
 *    (isRecurring:true). trainerId is members.id; staffAssignments[].staffId is
 *    members.userId.
 *  - appointments.list — recurrence-aware; returns virtual occurrences carrying
 *    {isVirtual,parentId}. Needs branchId in the caller's accessible scope.
 *  - appointments.cancelFuture — {parentId, fromDate:"YYYY-MM-DD"} → {success}.
 *  - classSlots.create — {serviceId,branchId,date(datetime),startTime"HH:MM",
 *    endTime"HH:MM",capacity,instructorId?,location?} → row with id.
 *  - classSlots.getSignups — {id} → array (empty for a fresh slot).
 *  - rooms.create/update/delete — type ∈ {consultation,group_session,private,
 *    training,individual}; capacity ≥ 1.
 *  - trainerAvailability.upsert — {trainerId,slots:[{dayOfWeek,startTime"HH:MM",
 *    endTime"HH:MM",kind}]}; list — {trainerId}.
 *  - The trainer double-book rejection is enforced by a DB exclusion constraint
 *    (appointments_trainer_no_overlap, migration 0030) — overlapping non-cancelled
 *    rows for the same trainer_id are rejected and surfaced as an ORPCError.
 */
import { test, expect } from "@playwright/test";
import {
	ensureJourneyFixtures,
	branchForClient,
} from "../helpers/seed-journey-fixtures";
import { TEST_ORG_ID, cleanupAppointment } from "../helpers/seed-data";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";

// ─── Local helpers ──────────────────────────────────────────────────────────

/** A future date on a 30-min grid, N days out, returned as a Date. */
function futureDate(daysAhead: number, hour: number, minute: number): Date {
	const d = new Date();
	d.setDate(d.getDate() + daysAhead);
	d.setHours(hour, minute, 0, 0);
	return d;
}

/**
 * Per-run day jitter (0–29) so re-runs after a failed mid-run cleanup don't
 * collide with a leftover confirmed booking on the same far-future day. The
 * trainer overlap exclusion constraint keys on (trainer_id, time-range), so a
 * stale row would otherwise reject the next run's create.
 */
const RUN_JITTER_DAYS = Math.floor(Math.random() * 30);

/** "YYYY-MM-DD" for a Date (local). */
function isoDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

type Appointment = { id: string; isRecurring?: boolean; status?: string };
type ListedAppointment = {
	id: string;
	parentId?: string | null;
	isVirtual?: boolean;
	status?: string;
	startTime?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Recurring appointment series → list virtual occurrences → cancelFuture
// ─────────────────────────────────────────────────────────────────────────────
test("Admin creates a recurring weekly appointment series, sees virtual occurrences, then cancels all future occurrences", {
	tag: ["@p1"],
}, async ({ page }) => {
	let parentId = "";
	let branchId = "";

	await test.step("Resolve fixtures (trainer, client, service, branch)", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.trainer, "an active trainer must exist").toBeTruthy();
		expect(fx.client, "an active client must exist").toBeTruthy();
		branchId = branchForClient(fx);
		expect(branchId, "a branch scope must resolve").toBeTruthy();

		await test.step("Create a confirmed weekly recurring series (8 occurrences)", async () => {
			// Far-future + jittered day keeps this series clear of other tests' bookings
			// and clear of a stale row from a prior failed run.
			const start = futureDate(90 + RUN_JITTER_DAYS, 9, 0);
			const created = await orpcCall<object, Appointment>(
				page,
				"appointments",
				"create",
				{
					organizationId: TEST_ORG_ID,
					type: "private",
					startTime: start.toISOString(),
					duration: 60,
					branchId,
					serviceId: fx.service?.id ?? null,
					status: "confirmed",
					sessionTotal: 1,
					pricePerClient: 0,
					userId: fx.client!.userId,
					trainerId: fx.trainer!.memberId,
					staffAssignments: [{ staffId: fx.trainer!.userId, slotIndex: 0 }],
					recurrence: {
						frequencyValue: 1,
						timeUnit: "week",
						endsType: "after_occurrences",
						endsAfterOccurrences: 8,
					},
				},
			);
			parentId = created.id;
			expect(parentId, "recurring series parent must be created").toBeTruthy();
			// NOTE: createAppointment returns the row snapshot from the initial INSERT,
			// THEN sets isRecurring=true via a follow-up UPDATE in the same tx — so the
			// returned `isRecurring` is still false/undefined here. Persistence of the
			// recurrence is proven below by the virtual-occurrence expansion (the
			// expander only emits virtuals when isRecurring && status != 'cancelled').
		});
	});

	await test.step("List the series — virtual occurrences expand from the parent", async () => {
		// Wide window so the recurrence-aware list expands every weekly occurrence.
		const startFrom = futureDate(89 + RUN_JITTER_DAYS, 0, 0);
		const startTo = futureDate(180 + RUN_JITTER_DAYS, 23, 0);
		const rows = await orpcCall<object, ListedAppointment[]>(
			page,
			"appointments",
			"list",
			{
				organizationId: TEST_ORG_ID,
				branchId,
				startFrom: startFrom.toISOString(),
				startTo: startTo.toISOString(),
				limit: 200,
			},
		);
		const seriesRows = rows.filter(
			(r) => r.id === parentId || r.parentId === parentId,
		);
		const virtualRows = seriesRows.filter((r) => r.isVirtual);
		// At least several virtual occurrences should materialise in the window.
		expect(
			virtualRows.length,
			"virtual occurrences should expand for the series",
		).toBeGreaterThan(0);
		test.info().annotations.push({
			type: "series-occurrences",
			description: `total=${seriesRows.length} virtual=${virtualRows.length}`,
		});
	});

	await test.step("Open the Appointments schedule — the series renders without error", async () => {
		await page.goto("/dashboard/appointment/view");
		await expect(
			page.getByRole("heading", { name: /appointments/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cancel all future occurrences from a mid-series date", async () => {
		// Cancel from ~4 weeks into the series (28 days after the series start).
		const fromDate = isoDate(futureDate(118 + RUN_JITTER_DAYS, 0, 0));
		const res = await orpcCall<object, { success: boolean }>(
			page,
			"appointments",
			"cancelFuture",
			{
				organizationId: TEST_ORG_ID,
				parentId,
				fromDate,
			},
		);
		expect(res.success, "cancelFuture should report success").toBe(true);

		// Re-list with the same wide window: occurrences on/after fromDate must be gone.
		const startFrom = futureDate(89 + RUN_JITTER_DAYS, 0, 0);
		const startTo = futureDate(180 + RUN_JITTER_DAYS, 23, 0);
		const rows = await orpcCall<object, ListedAppointment[]>(
			page,
			"appointments",
			"list",
			{
				organizationId: TEST_ORG_ID,
				branchId,
				startFrom: startFrom.toISOString(),
				startTo: startTo.toISOString(),
				limit: 200,
			},
		);
		const fromMs = futureDate(118 + RUN_JITTER_DAYS, 0, 0).getTime();
		const futureActive = rows.filter(
			(r) =>
				(r.id === parentId || r.parentId === parentId) &&
				r.isVirtual === true &&
				r.startTime != null &&
				new Date(r.startTime).getTime() >= fromMs,
		);
		expect(
			futureActive.length,
			"no future virtual occurrences should remain after cancelFuture",
		).toBe(0);
	});

	await test.step("Cleanup — cancel the whole series", async () => {
		if (parentId) {
			try {
				await orpcCall(page, "appointments", "cancelSeries", {
					organizationId: TEST_ORG_ID,
					parentId,
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND")) {
					// best-effort cleanup — also try the single-appointment cancel
					await cleanupAppointment(page, parentId);
				}
			}
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Class slot create → getSignups
// ─────────────────────────────────────────────────────────────────────────────
test("Admin creates a class slot and reads its (empty) signup list", {
	tag: ["@p1"],
}, async ({ page }) => {
	let slotId = "";

	await test.step("Resolve fixtures (service, branch, trainer as instructor)", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(
			fx.service,
			"a service must exist to scaffold a class slot",
		).toBeTruthy();
		const branchId = branchForClient(fx);

		await test.step("Create a class slot for the service (capacity 10)", async () => {
			const date = futureDate(75, 0, 0);
			type Slot = { id: string; capacity: number; spotsAvailable?: number };
			const slot = await orpcCall<object, Slot>(page, "classSlots", "create", {
				organizationId: TEST_ORG_ID,
				serviceId: fx.service!.id,
				branchId,
				date: date.toISOString(),
				startTime: "18:00",
				endTime: "19:00",
				capacity: 10,
				instructorId: fx.trainer?.memberId,
				location: "E2E Studio A",
			});
			slotId = slot.id;
			expect(slotId, "class slot must be created").toBeTruthy();
			expect(slot.capacity).toBe(10);
		});

		await test.step("Read the slot's signups — fresh slot has zero enrollments", async () => {
			const signups = await orpcCall<object, unknown[]>(
				page,
				"classSlots",
				"getSignups",
				{
					organizationId: TEST_ORG_ID,
					id: slotId,
				},
			);
			expect(Array.isArray(signups)).toBe(true);
			expect(
				signups.length,
				"a brand-new class slot should have no signups",
			).toBe(0);
		});
	});

	await test.step("Open the Class Slots schedule — the new slot renders without error", async () => {
		await page.goto("/dashboard/appointment/class-slots/view");
		await expect(
			page.getByRole("heading", { name: /class slots/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the seeded class slot", async () => {
		if (slotId) {
			try {
				await orpcCall(page, "classSlots", "cancel", {
					organizationId: TEST_ORG_ID,
					id: slotId,
					cancellationReason: "E2E cleanup",
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND"))
					throw err;
			}
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Rooms CRUD (create / list / update / delete)
// ─────────────────────────────────────────────────────────────────────────────
test("Admin creates, lists, updates, and deletes a room", {
	tag: ["@p1"],
}, async ({ page }) => {
	let roomId = "";
	const roomName = `E2E Room ${Date.now()}`;

	await test.step("Resolve fixtures (branch)", async () => {
		const fx = await ensureJourneyFixtures(page);
		const branchId = branchForClient(fx);
		expect(branchId, "a branch scope must resolve").toBeTruthy();

		await test.step("Create a training room (capacity 4)", async () => {
			type Room = {
				id: string;
				name: string;
				capacity: number;
				isActive?: boolean;
			};
			const room = await orpcCall<object, Room>(page, "rooms", "create", {
				organizationId: TEST_ORG_ID,
				name: roomName,
				type: "training",
				capacity: 4,
				branchId,
				isActive: true,
			});
			roomId = room.id;
			expect(roomId, "room must be created").toBeTruthy();
			expect(room.name).toBe(roomName);
		});

		await test.step("List rooms — the new room is present", async () => {
			type Room = { id: string; name: string };
			const rooms = await orpcCall<object, Room[]>(page, "rooms", "list", {
				organizationId: TEST_ORG_ID,
			});
			expect(
				rooms.some((r) => r.id === roomId),
				"created room should appear in the list",
			).toBe(true);
		});

		await test.step("Update the room (rename + bump capacity)", async () => {
			type Room = { id: string; name: string; capacity: number };
			const updated = await orpcCall<object, Room>(page, "rooms", "update", {
				organizationId: TEST_ORG_ID,
				id: roomId,
				name: `${roomName} (updated)`,
				capacity: 8,
			});
			expect(updated.name).toBe(`${roomName} (updated)`);
			expect(updated.capacity).toBe(8);
		});
	});

	await test.step("Open the Rooms surface (redirects to Services → Rooms tab) without error", async () => {
		// /dashboard/rooms/view redirects to /dashboard/service/view?tab=rooms.
		await page.goto("/dashboard/rooms/view");
		await expect(page).toHaveURL(/\/dashboard\/service\/view/);
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Delete the room and confirm it is gone from the list", async () => {
		await orpcCall(page, "rooms", "delete", {
			organizationId: TEST_ORG_ID,
			id: roomId,
		});
		type Room = { id: string };
		// rooms.delete is a SOFT delete (sets isActive=false) — assert it's gone from
		// the ACTIVE list rather than the full list.
		const rooms = await orpcCall<object, Room[]>(page, "rooms", "list", {
			organizationId: TEST_ORG_ID,
			isActive: true,
		});
		expect(
			rooms.some((r) => r.id === roomId),
			"soft-deleted room should not appear among active rooms",
		).toBe(false);
		roomId = ""; // already deleted — skip cleanup
	});

	await test.step("Cleanup — delete the room if it still exists", async () => {
		if (roomId) {
			try {
				await orpcCall(page, "rooms", "delete", {
					organizationId: TEST_ORG_ID,
					id: roomId,
				});
			} catch (err) {
				if (!(err instanceof OrpcClientError && err.code === "NOT_FOUND"))
					throw err;
			}
		}
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Trainer availability upsert → list
// ─────────────────────────────────────────────────────────────────────────────
test("Admin upserts a trainer's weekly availability template and reads it back", {
	tag: ["@p1"],
}, async ({ page }) => {
	let trainerId = "";

	await test.step("Resolve fixtures (trainer)", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.trainer, "an active trainer must exist").toBeTruthy();
		trainerId = fx.trainer!.memberId;

		await test.step("Upsert a Mon/Wed availability template for the trainer", async () => {
			const result = await orpcCall<object, unknown>(
				page,
				"trainerAvailability",
				"upsert",
				{
					organizationId: TEST_ORG_ID,
					trainerId,
					slots: [
						{
							dayOfWeek: "monday",
							startTime: "09:00",
							endTime: "12:00",
							kind: "available",
						},
						{
							dayOfWeek: "wednesday",
							startTime: "13:00",
							endTime: "17:00",
							kind: "available",
						},
					],
				},
			);
			expect(result, "upsert should return a result payload").toBeTruthy();
		});

		await test.step("List the trainer's availability — both slots are present", async () => {
			type Slot = {
				id: string;
				dayOfWeek: string;
				startTime: string;
				endTime: string;
			};
			const slots = await orpcCall<object, Slot[]>(
				page,
				"trainerAvailability",
				"list",
				{
					organizationId: TEST_ORG_ID,
					trainerId,
				},
			);
			expect(Array.isArray(slots)).toBe(true);
			const days = new Set(slots.map((s) => s.dayOfWeek));
			expect(days.has("monday"), "Monday slot should be persisted").toBe(true);
			expect(days.has("wednesday"), "Wednesday slot should be persisted").toBe(
				true,
			);
		});
	});

	await test.step("Open the Trainer Availability page — template renders without error", async () => {
		await page.goto("/dashboard/trainers/availability");
		await expect(
			page.getByRole("heading", { name: /weekly schedule template/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});
	// No cleanup: availability is an idempotent weekly template (upsert replaces it
	// on the next run); leaving it set does not pollute other journeys.
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 — Double-booking the same trainer slot is rejected (overlap conflict guard)
// ─────────────────────────────────────────────────────────────────────────────
test("Double-booking the same trainer at the same time is rejected by the overlap guard", {
	tag: ["@p1"],
}, async ({ page }) => {
	let firstId = "";
	let secondId = ""; // should never be set — the second create must throw

	await test.step("Resolve fixtures (trainer, client, service, branch)", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.trainer, "an active trainer must exist").toBeTruthy();
		expect(fx.client, "an active client must exist").toBeTruthy();
		const branchId = branchForClient(fx);
		const trainerId = fx.trainer!.memberId;

		// Far-future, jittered day, exact overlap window for the same trainer.
		// Offset +200 keeps it clear of journey 1's series window.
		const start = futureDate(200 + RUN_JITTER_DAYS, 14, 0);
		const baseInput = {
			organizationId: TEST_ORG_ID,
			type: "private" as const,
			startTime: start.toISOString(),
			duration: 60,
			branchId,
			serviceId: fx.service?.id ?? null,
			status: "confirmed" as const,
			sessionTotal: 1,
			pricePerClient: 0,
			userId: fx.client!.userId,
			trainerId,
			staffAssignments: [{ staffId: fx.trainer!.userId, slotIndex: 0 }],
		};

		await test.step("Book the trainer's first appointment (confirmed)", async () => {
			const created = await orpcCall<object, Appointment>(
				page,
				"appointments",
				"create",
				baseInput,
			);
			firstId = created.id;
			expect(firstId, "first appointment must be created").toBeTruthy();
		});

		await test.step("Attempt a second, overlapping booking for the SAME trainer → rejected", async () => {
			let threw = false;
			try {
				const dup = await orpcCall<object, Appointment>(
					page,
					"appointments",
					"create",
					baseInput,
				);
				secondId = dup.id; // unexpected — capture for cleanup
			} catch (err) {
				threw = true;
				expect(err, "rejection should be a typed oRPC error").toBeInstanceOf(
					OrpcClientError,
				);
				test.info().annotations.push({
					type: "double-book-rejection",
					description:
						err instanceof OrpcClientError
							? `${err.code}: ${err.message}`
							: String(err),
				});
			}
			expect(threw, "the overlapping second booking must be rejected").toBe(
				true,
			);
			expect(secondId, "no second appointment should have been created").toBe(
				"",
			);
		});
	});

	await test.step("Open the Appointments schedule — the single booking renders without error", async () => {
		await page.goto("/dashboard/appointment/view");
		await expect(
			page.getByRole("heading", { name: /appointments/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel any appointments created in this journey", async () => {
		if (firstId) await cleanupAppointment(page, firstId);
		if (secondId) await cleanupAppointment(page, secondId);
	});
});
