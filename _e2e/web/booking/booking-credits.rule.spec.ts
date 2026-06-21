import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";
import { smokeLoad } from "../_helpers";

/**
 * UAT §5 — Session Booking invariants (the marquee gap).
 *
 * Asserts the core booking-rule domain invariants from the UAT checklist at the
 * API boundary (reliable), then shows the schedule in the UI for the video:
 *   - "Credit deduction": booking against an active package reduces the balance by one.
 *   - "Credit restoration": a no-show reinstate returns the credit.
 *
 * Booking deducts package credits in appointment.service.ts (createAppointment →
 * packageInstances credit consume); reinstateCredits restores them for a no-show.
 * Self-cleaning: the appointment is cancelled and the package cancelled in finally.
 *
 * Sub-items still open (separate specs): 24h-lock enforcement, burn vs claim
 * (check-ins.recordCheckIn), client-side booking (mobile). Tracked in the ledger.
 */
test.describe("§5 session booking — credit invariants", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("booking deducts a package credit; no-show reinstate restores it", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(
			!fx.serviceId || !fx.clientId,
			"no service/client fixture available",
		);

		// Appointment.branchId is NOT NULL and is RBAC-scoped. Derive an
		// *accessible* branch from an existing appointment the admin can list
		// (picking an arbitrary branch node hits the accessible-scope guard).
		const apptRes = await rpc(page.request, "appointments/list", {
			organizationId,
		});
		const existing = Array.isArray(apptRes)
			? apptRes
			: (apptRes?.items ?? apptRes?.appointments ?? []);
		const branchId = existing.find((a: any) => a.branchId)?.branchId;
		test.skip(
			!branchId,
			"no accessible branch (no existing appointment to source one)",
		);

		const { startsAt, expiresAt } = pkgWindow();

		// Active package with 4 credits.
		const pkg = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned",
			creditsTotal: 4,
			creditsUsed: 0,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid",
			purchaseNumber: testId("pn"),
		});
		const pkgId = pkg?.id;
		expect(pkgId, `package create: ${JSON.stringify(pkg)}`).toBeTruthy();
		expect(pkg?.creditsRemaining).toBe(4);
		cleanup.add(`pkg ${pkgId}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id: pkgId,
				reason: "E2E-DEEP cleanup",
			});
		});

		// BOOK a session against the package (outside the 24h lock — far-future).
		const startTime = new Date(Date.UTC(2026, 8, 1, 4, 0, 0)).toISOString();
		const appt = await rpc(page.request, "appointments/create", {
			organizationId,
			type: "private",
			startTime,
			duration: 60,
			branchId,
			serviceId: fx.serviceId,
			status: "confirmed",
			sessionTotal: 0,
			pricePerClient: 0,
			userId: fx.clientId,
			trainerId: fx.trainerMemberId,
			packageInstanceId: pkgId,
			creditsUsed: 1,
			bookingNumber: testId("bk"),
		});
		const apptId = appt?.id;
		expect(apptId, `booking create: ${JSON.stringify(appt)}`).toBeTruthy();
		cleanup.add(`appt ${apptId}`, async () => {
			await rpcRaw(page.request, "appointments/update", {
				organizationId,
				id: apptId,
				status: "cancelled",
			});
		});

		// INVARIANT 1 — credit deduction: balance drops by exactly one.
		const afterBook = await rpc(page.request, "packageInstances/getById", {
			organizationId,
			id: pkgId,
		});
		expect(
			afterBook?.creditsRemaining,
			"booking should deduct one credit",
		).toBe(3);

		// INVARIANT 2 — credit restoration: no-show reinstate returns the credit.
		await rpc(page.request, "appointments/update", {
			organizationId,
			id: apptId,
			status: "no-show",
		});
		await rpc(page.request, "appointments/reinstateCredits", {
			organizationId,
			appointmentId: apptId,
			reason: "E2E-DEEP reinstate",
		});
		const afterReinstate = await rpc(page.request, "packageInstances/getById", {
			organizationId,
			id: pkgId,
		});
		expect(
			afterReinstate?.creditsRemaining,
			"no-show reinstate should restore the credit",
		).toBe(4);

		// UI — show the schedule (recorded for the review video).
		await smokeLoad(page, "/dashboard/appointment/view");
		await expect(page.locator('[data-sidebar="content"]')).toBeVisible();
	});

	test("claim (completed) and burn (no-show, no reinstate) both keep the credit consumed", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(
			!fx.serviceId || !fx.clientId,
			"no service/client fixture available",
		);
		const apptRes = await rpc(page.request, "appointments/list", {
			organizationId,
		});
		const existing = Array.isArray(apptRes)
			? apptRes
			: (apptRes?.items ?? apptRes?.appointments ?? []);
		const branchId = existing.find((a: any) => a.branchId)?.branchId;
		test.skip(!branchId, "no accessible branch");

		const { startsAt, expiresAt } = pkgWindow();
		const pkg = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "assigned",
			creditsTotal: 4,
			creditsUsed: 0,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "paid",
			purchaseNumber: testId("pn"),
		});
		const pkgId = pkg?.id;
		expect(pkgId, `package create: ${JSON.stringify(pkg)}`).toBeTruthy();
		cleanup.add(`pkg ${pkgId}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id: pkgId,
				reason: "E2E-DEEP cleanup",
			});
		});

		const book = async (label: string, hour: number) => {
			const a = await rpc(page.request, "appointments/create", {
				organizationId,
				type: "private",
				startTime: new Date(Date.UTC(2026, 9, 1, hour, 0, 0)).toISOString(),
				duration: 60,
				branchId,
				serviceId: fx.serviceId,
				status: "confirmed",
				sessionTotal: 0,
				pricePerClient: 0,
				userId: fx.clientId,
				// trainerId omitted (null): isolates the credit invariant from the
				// trainer double-booking guard so retries can't collide.
				trainerId: null,
				packageInstanceId: pkgId,
				creditsUsed: 1,
				bookingNumber: testId(label),
			});
			expect(a?.id, `book ${label}: ${JSON.stringify(a)}`).toBeTruthy();
			cleanup.add(`appt ${a.id}`, async () => {
				await rpcRaw(page.request, "appointments/update", {
					organizationId,
					id: a.id,
					status: "cancelled",
				});
			});
			return a.id as string;
		};
		const remaining = async () =>
			(
				await rpc(page.request, "packageInstances/getById", {
					organizationId,
					id: pkgId,
				})
			)?.creditsRemaining;

		// CLAIM — book then mark completed: credit stays consumed (delivered, no refund).
		const claimId = await book("claim", 4);
		expect(await remaining(), "book deducts").toBe(3);
		await rpc(page.request, "appointments/update", {
			organizationId,
			id: claimId,
			status: "completed",
		});
		expect(await remaining(), "claim/completed keeps the credit consumed").toBe(
			3,
		);

		// BURN — book then mark no-show WITHOUT reinstate: credit stays consumed (no refund).
		const burnId = await book("burn", 8);
		expect(await remaining(), "second book deducts").toBe(2);
		await rpc(page.request, "appointments/update", {
			organizationId,
			id: burnId,
			status: "no-show",
		});
		expect(
			await remaining(),
			"burn/no-show without reinstate keeps the credit consumed",
		).toBe(2);

		await smokeLoad(page, "/dashboard/appointment/view");
		await expect(page.locator('[data-sidebar="content"]')).toBeVisible();
	});
});
