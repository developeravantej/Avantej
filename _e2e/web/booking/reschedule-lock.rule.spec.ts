import { test, expect, type APIRequestContext } from "@playwright/test";
import { existsSync } from "node:fs";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";

/**
 * UAT §5 — 24-hour lock. "Changes are allowed only up to 24 hours before the
 * session. Inside the 24-hour lock the only permitted actions are burn or claim."
 *
 * Now enforced server-side (appointments.reschedule / update). Role-gated with an
 * admin override: on the SAME inside-lock appointment, an admin can reschedule
 * (override) but a non-admin (staff) is rejected — demonstrating the lock.
 */
const STAFF_STATE = "_e2e/.auth/staff.json";
const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3021";

test.describe("§5 session booking — 24h reschedule lock", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("admin can reschedule inside the 24h lock; a non-admin cannot", async ({
		page,
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();

		const apptRes = await rpc(page.request, "appointments/list", {
			organizationId,
		});
		const appts = Array.isArray(apptRes)
			? apptRes
			: (apptRes?.items ?? apptRes?.appointments ?? []);
		const branchId = appts.find((a: any) => a.branchId)?.branchId;
		test.skip(!branchId, "no accessible branch");

		const insideLock = () =>
			new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
		const book = async () => {
			const a = await rpc(page.request, "appointments/create", {
				organizationId,
				type: "private",
				startTime: insideLock(),
				duration: 60,
				branchId,
				status: "confirmed",
				sessionTotal: 0,
				pricePerClient: 0,
				bookingNumber: testId("lock"),
			});
			expect(a?.id, `book: ${JSON.stringify(a)}`).toBeTruthy();
			cleanup.add(`appt ${a.id}`, async () => {
				await rpcRaw(page.request, "appointments/update", {
					organizationId,
					id: a.id,
					status: "cancelled",
				});
			});
			return a.id as string;
		};
		const newStart = new Date(Date.now() + 13 * 60 * 60 * 1000).toISOString();

		// ADMIN override — reschedule inside the lock succeeds.
		const a1 = await book();
		const adminResched = await rpcRaw(page.request, "appointments/reschedule", {
			organizationId,
			appointmentId: a1,
			newStartTime: newStart,
		});
		expect(
			adminResched.ok(),
			`admin reschedule inside lock -> ${adminResched.status()} (override expected)`,
		).toBeTruthy();

		// NON-ADMIN (staff) — reschedule inside the lock is rejected.
		const a2 = await book();
		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		const staffResched = await rpcRaw(staff, "appointments/reschedule", {
			organizationId,
			appointmentId: a2,
			newStartTime: newStart,
		});
		expect(
			staffResched.status() >= 400,
			`staff reschedule inside lock -> ${staffResched.status()} (expected rejection)`,
		).toBeTruthy();
		await staff.dispose();
	});

	test("admin can cancel inside the 24h lock; a non-admin cannot", async ({
		page,
		playwright,
	}) => {
		test.skip(
			!existsSync(STAFF_STATE),
			"no staff session — run `bun e2e:seed`",
		);
		const organizationId = getOrgId();

		const apptRes = await rpc(page.request, "appointments/list", {
			organizationId,
		});
		const appts = Array.isArray(apptRes)
			? apptRes
			: (apptRes?.items ?? apptRes?.appointments ?? []);
		const branchId = appts.find((a: any) => a.branchId)?.branchId;
		test.skip(!branchId, "no accessible branch");

		// Book inside the 24h lock (booking itself is not locked).
		const appt = await rpc(page.request, "appointments/create", {
			organizationId,
			type: "private",
			startTime: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
			duration: 60,
			branchId,
			status: "confirmed",
			sessionTotal: 0,
			pricePerClient: 0,
			bookingNumber: testId("cancel-lock"),
		});
		const apptId = appt?.id;
		expect(apptId, `book: ${JSON.stringify(appt)}`).toBeTruthy();
		cleanup.add(`appt ${apptId}`, async () => {
			await rpcRaw(page.request, "appointments/update", {
				organizationId,
				id: apptId,
				status: "cancelled",
			});
		});

		// NON-ADMIN (staff) cancel inside the lock → rejected, appt stays un-cancelled.
		const staff: APIRequestContext = await playwright.request.newContext({
			baseURL: BASE,
			storageState: STAFF_STATE,
		});
		const staffCancel = await rpcRaw(staff, "appointments/update", {
			organizationId,
			id: apptId,
			status: "cancelled",
		});
		expect(
			staffCancel.status() >= 400,
			`staff cancel inside lock -> ${staffCancel.status()} (expected rejection)`,
		).toBeTruthy();
		await staff.dispose();

		const afterStaff = await rpc(page.request, "appointments/getById", {
			organizationId,
			id: apptId,
		});
		expect(
			afterStaff?.status,
			"appt must remain un-cancelled after a blocked staff cancel",
		).not.toBe("cancelled");

		// ADMIN override — cancel inside the lock succeeds (also serves as cleanup).
		const adminCancel = await rpcRaw(page.request, "appointments/update", {
			organizationId,
			id: apptId,
			status: "cancelled",
		});
		expect(
			adminCancel.ok(),
			`admin cancel inside lock -> ${adminCancel.status()} (override expected)`,
		).toBeTruthy();
	});
});
