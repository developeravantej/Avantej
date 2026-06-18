/**
 * Payment Side Effects — Integration Tests
 *
 * Verifies the DB-observable guarantees of `onAppointmentPaid` against a live
 * tenant Neon branch (node-postgres harness):
 *
 *   1. A `pending` appointment is auto-confirmed (pending → confirmed) and a
 *      matching `appointment_status_history` row is written.
 *   2. A non-`pending` appointment (e.g. `cancelled`) is left untouched and NO
 *      history row is written — the guarded WHERE must not resurrect a
 *      terminal-state booking.
 *
 * Self-seeding & fixture-independent: it discovers a real hierarchy node at
 * runtime (branch_id is a restrict-FK), inserts its own appointment rows, and
 * deletes them in a finally block — so it does NOT depend on the shared seed
 * fixtures (which vary between branches). The receipt-email path is a no-op
 * here because no `appointment_clients` row is seeded (resolveCustomerEmail
 * returns null → sendEmail is skipped), so no real email is sent.
 *
 * Skips automatically when TENANT_DATABASE_URL is unset (see shouldSkipIntegration).
 *
 * Run: bun test src/tests/integration/payment-side-effects.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import { appointmentStatusHistory } from "@avantej-core/db/schema/tenant/appointment-status-history";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { onAppointmentPaid } from "@/services/payment-side-effects.service";
import {
	createControlPanelDb,
	createTenantDb,
	shouldSkipIntegration,
} from "../helpers/integration-setup";

const skip = shouldSkipIntegration();
const d = skip ? describe.skip : describe;

let tenantDb: ReturnType<typeof createTenantDb>;
let controlPanelDb: ReturnType<typeof createControlPanelDb>;
let branchNodeId: string | null = null;

// Track inserted appointment ids so we always clean up, even on assertion fail.
const createdAppointmentIds: string[] = [];

async function seedPendingAppointment(branchId: string): Promise<string> {
	const id = crypto.randomUUID();
	const now = new Date();
	await tenantDb.insert(appointments).values({
		id,
		type: "private",
		startTime: now,
		duration: 60,
		endTime: new Date(now.getTime() + 60 * 60 * 1000),
		branchId,
		status: "pending",
		sessionTotal: 10000,
		pricePerClient: 10000,
		paymentStatus: "paid", // webhook already flipped this; service confirms status
		createdBy: "integration-test",
	});
	createdAppointmentIds.push(id);
	return id;
}

d("payment-side-effects · onAppointmentPaid (live tenant DB)", () => {
	beforeAll(async () => {
		tenantDb = createTenantDb();
		controlPanelDb = createControlPanelDb();
		const [node] = await tenantDb
			.select({ id: hierarchyNodes.id })
			.from(hierarchyNodes)
			.limit(1);
		branchNodeId = node?.id ?? null;
		if (!branchNodeId) {
			console.warn(
				"[payment-side-effects.integration] no hierarchy node in tenant DB — tests will no-op",
			);
		}
	});

	afterAll(async () => {
		// Clean up every seeded row (history first, then appointment).
		for (const id of createdAppointmentIds) {
			try {
				await tenantDb
					.delete(appointmentStatusHistory)
					.where(eq(appointmentStatusHistory.appointmentId, id));
				await tenantDb.delete(appointments).where(eq(appointments.id, id));
			} catch (err) {
				console.error(
					`[payment-side-effects.integration] cleanup failed for appt=${id}:`,
					err,
				);
			}
		}
	});

	test("auto-confirms a pending appointment and writes a status-history row", async () => {
		if (!branchNodeId) return;
		const appointmentId = await seedPendingAppointment(branchNodeId);

		await onAppointmentPaid({
			tenantDb,
			controlPanelDb,
			appointmentId,
			organizationId: "itest-org",
			paymentIntentId: "pi_itest_123",
			amountCents: 10000,
			currency: "MYR",
		});

		const [appt] = await tenantDb
			.select({ status: appointments.status })
			.from(appointments)
			.where(eq(appointments.id, appointmentId))
			.limit(1);
		expect(appt?.status).toBe("confirmed");

		const history = await tenantDb
			.select({
				fromStatus: appointmentStatusHistory.fromStatus,
				toStatus: appointmentStatusHistory.toStatus,
				reason: appointmentStatusHistory.reason,
			})
			.from(appointmentStatusHistory)
			.where(eq(appointmentStatusHistory.appointmentId, appointmentId));

		expect(history.length).toBeGreaterThanOrEqual(1);
		const confirmRow = history.find((h) => h.toStatus === "confirmed");
		expect(confirmRow).toBeTruthy();
		expect(confirmRow?.fromStatus).toBe("pending");
		expect(confirmRow?.reason).toBe("payment_confirmed");
	});

	test("does NOT touch a non-pending (cancelled) appointment and writes no history", async () => {
		if (!branchNodeId) return;
		const appointmentId = await seedPendingAppointment(branchNodeId);
		// Move it to a terminal state before the side-effect runs.
		await tenantDb
			.update(appointments)
			.set({ status: "cancelled" })
			.where(eq(appointments.id, appointmentId));

		await onAppointmentPaid({
			tenantDb,
			controlPanelDb,
			appointmentId,
			organizationId: "itest-org",
			paymentIntentId: "pi_itest_456",
			amountCents: 10000,
			currency: "MYR",
		});

		const [appt] = await tenantDb
			.select({ status: appointments.status })
			.from(appointments)
			.where(eq(appointments.id, appointmentId))
			.limit(1);
		expect(appt?.status).toBe("cancelled"); // unchanged — guard held

		const history = await tenantDb
			.select({ id: appointmentStatusHistory.id })
			.from(appointmentStatusHistory)
			.where(
				and(
					eq(appointmentStatusHistory.appointmentId, appointmentId),
					eq(appointmentStatusHistory.toStatus, "confirmed"),
				),
			);
		expect(history.length).toBe(0); // no confirm transition recorded
	});
});
