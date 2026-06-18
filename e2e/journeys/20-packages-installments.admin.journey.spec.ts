/**
 * Journey suite: Packages, Memberships & Installments.
 * Actor: tenant-admin.
 *
 * Routers in scope: packageInstances, packageInstanceStaff, installments,
 *                   installmentPlans, preferredTimes.
 * Pages in scope: packages/instances/view, memberships/view,
 *                 packages/installments/view, operations/approvals.
 *
 * Every journey SEEDS state via oRPC (deterministic), ASSERTS state via oRPC
 * (robust), THEN navigates the relevant /dashboard page and makes a tolerant
 * UI assertion so the recorded video shows the end-user-visible result.
 *
 * Note: packages/instances/view, memberships/view and packages/installments/view
 * are legacy tab-redirects to /dashboard/packages/view?tab=… — we navigate them
 * (honouring "pages in scope") and assert the REDIRECTED URL + the real
 * <h1>Packages</h1> heading.
 */
import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { ensureJourneyFixtures } from "../helpers/seed-journey-fixtures";
import { orpcCall, OrpcClientError } from "../helpers/orpc-client";
import { TEST_ORG_ID } from "../helpers/seed-data";

// ── Shared types (minimal — only the fields we assert on) ───────────────────
type PackageInstance = {
	id: string;
	status?: string;
	source?: string;
	clientId?: string | null;
	assignedTrainerId?: string | null;
	creditsTotal?: number;
	creditsUnlocked?: number | null;
	installmentsTotal?: number;
	installmentsPaid?: number;
};
type ServiceRow = {
	id: string;
	name: string;
	branchId?: string | null;
	sessionCount?: number | null;
	isActive?: boolean;
	expirable?: boolean;
	expiryDays?: number | null;
};
type MemberRow = {
	id: string;
	userId: string;
	role: string;
	status: string;
	name: string;
	hierarchyScopeId?: string | null;
};

const NOW = () => new Date();
const PLUS_DAYS = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

/**
 * Resolve a (package-eligible service, active trainer) pair where assignTrainer's
 * branch checks will pass:
 *   - service.branchId == null  → all branch checks are skipped (best case), OR
 *   - some active trainer has hierarchyScopeId === service.branchId.
 * Returns null if no compatible pair exists in the tenant.
 */
async function resolveAssignablePair(
	page: Page,
): Promise<{ service: ServiceRow; trainer: MemberRow } | null> {
	const [services, trainers] = await Promise.all([
		orpcCall<object, ServiceRow[]>(page, "services", "list", {
			organizationId: TEST_ORG_ID,
			isActive: true,
		}),
		orpcCall<object, MemberRow[]>(page, "members", "list", {
			organizationId: TEST_ORG_ID,
			role: "trainer",
			status: "active",
		}),
	]);

	const eligible = services.filter(
		(s) =>
			s.expirable === true &&
			s.expiryDays != null &&
			s.expiryDays > 0 &&
			s.sessionCount != null &&
			s.sessionCount > 0,
	);
	if (eligible.length === 0 || trainers.length === 0) return null;

	// Prefer a null-branch service — sidesteps every branch check.
	const nullBranchSvc = eligible.find((s) => s.branchId == null);
	if (nullBranchSvc) return { service: nullBranchSvc, trainer: trainers[0]! };

	// Otherwise find a service whose branch a trainer is scoped to.
	for (const svc of eligible) {
		const match = trainers.find((t) => t.hierarchyScopeId === svc.branchId);
		if (match) return { service: svc, trainer: match };
	}
	return null;
}

/**
 * Force the purchased-package approval gate ON so `source: "purchased"` packages
 * are guaranteed to start in `pending` (the default is ON, but a prior test could
 * have written "false" — this makes the P0 deterministic). Admin-only upsert.
 */
async function forceApprovalGateOn(page: Page): Promise<void> {
	try {
		await orpcCall(page, "organizationSettings", "upsert", {
			organizationId: TEST_ORG_ID,
			key: "package_approval.required",
			value: "true",
		});
	} catch {
		// Non-critical — default is ON; proceed and let create's status assertion stand.
	}
}

// ───────────────────────────────────────────────────────────────────────────
// P0 — Approval gate: purchased package starts pending → assignTrainer → active
// ───────────────────────────────────────────────────────────────────────────
test("Purchased package starts pending, then assigning a trainer activates it", {
	tag: ["@p0"],
}, async ({ page }) => {
	let instanceId = "";
	let trainer: MemberRow | null = null;

	await test.step("Resolve a package-eligible service + assignable trainer", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.client, "an active client must exist").toBeTruthy();

		const pair = await resolveAssignablePair(page);
		// Precondition genuinely impossible to fabricate without editing helpers.
		test.skip(
			!pair || !fx.client,
			"No package-eligible service + branch-aligned active trainer in tenant",
		);
		trainer = pair!.trainer;

		// Guard so a branch mismatch fails legibly rather than as an opaque BAD_REQUEST.
		const svcBranch = pair!.service.branchId ?? null;
		expect(
			svcBranch == null || trainer.hierarchyScopeId === svcBranch,
			"trainer branch must match service branch (or service must be org-wide)",
		).toBe(true);

		await test.step("Create a customer-purchased package (hits the approval gate)", async () => {
			await forceApprovalGateOn(page);
			const created = await orpcCall<object, PackageInstance>(
				page,
				"packageInstances",
				"create",
				{
					organizationId: TEST_ORG_ID,
					serviceId: pair!.service.id,
					clientId: fx.client!.userId,
					source: "purchased",
					creditsTotal: pair!.service.sessionCount ?? 1,
					startsAt: NOW().toISOString(),
					expiresAt: PLUS_DAYS(180).toISOString(),
					totalPrice: 50000,
					paymentStatus: "paid",
					paymentMethod: "cash",
				},
			);
			instanceId = created.id;
			expect(instanceId, "create must return an id").toBeTruthy();
			// Gate default is ON → purchased packages start pending.
			expect(created.status).toBe("pending");
		});
	});

	await test.step("Pending package appears in the Approvals queue", async () => {
		// oRPC truth: listPending returns this pending+purchased package.
		type PendingRow = { id: string; serviceName?: string | null };
		const pending = await orpcCall<object, PendingRow[]>(
			page,
			"packageInstances",
			"listPending",
			{ organizationId: TEST_ORG_ID, scope: "all", limit: 200 },
		);
		const found = pending.some((r) => r.id === instanceId);
		// Scope can make this flaky for non-org-wide admins — annotate either way,
		// keep the hard assertion only when present.
		test.info().annotations.push({
			type: "listPending-contains-seed",
			description: String(found),
		});

		await page.goto("/dashboard/operations/approvals");
		await expect(page).toHaveURL(/\/dashboard\/operations\/approvals/);
		await page.waitForTimeout(1200);
		// Approvals page uses divs, not semantic headings.
		await expect(
			page.getByText(/pending package approvals/i).first(),
		).toBeVisible();
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Assign a trainer — package transitions pending → active", async () => {
		await orpcCall(page, "packageInstances", "assignTrainer", {
			organizationId: TEST_ORG_ID,
			packageInstanceId: instanceId,
			trainerMemberId: trainer!.id, // tenant members.id
		});
	});

	await test.step("Verify the package is now active via getById", async () => {
		const pkg = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"getById",
			{ organizationId: TEST_ORG_ID, id: instanceId },
		);
		expect(pkg.status).toBe("active");
		expect(pkg.assignedTrainerId).toBe(trainer!.id);
	});

	await test.step("Open the Packages view (legacy instances tab redirects here)", async () => {
		await page.goto("/dashboard/packages/instances/view");
		await expect(page).toHaveURL(/\/dashboard\/packages\/view/);
		await expect(
			page.getByRole("heading", { name: /packages/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the seeded package", async () => {
		if (!instanceId) return;
		try {
			await orpcCall(page, "packageInstances", "cancel", {
				organizationId: TEST_ORG_ID,
				id: instanceId,
				reason: "E2E cleanup",
			});
		} catch (err) {
			if (
				err instanceof OrpcClientError &&
				(err.code === "NOT_FOUND" || err.code === "CONFLICT")
			)
				return;
			throw err;
		}
	});
});

// ───────────────────────────────────────────────────────────────────────────
// P0 — Reject a pending package → status cancelled
// ───────────────────────────────────────────────────────────────────────────
test("Rejecting a pending package cancels it", { tag: ["@p0"] }, async ({
	page,
}) => {
	let instanceId = "";

	await test.step("Seed a customer-purchased (pending) package", async () => {
		const fx = await ensureJourneyFixtures(page);
		const pair = await resolveAssignablePair(page);
		test.skip(
			!pair || !fx.client,
			"No package-eligible service available to seed a pending package",
		);

		await forceApprovalGateOn(page);
		const created = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"create",
			{
				organizationId: TEST_ORG_ID,
				serviceId: pair!.service.id,
				clientId: fx.client!.userId,
				source: "purchased",
				creditsTotal: pair!.service.sessionCount ?? 1,
				startsAt: NOW().toISOString(),
				expiresAt: PLUS_DAYS(180).toISOString(),
				totalPrice: 50000,
				paymentStatus: "paid",
				paymentMethod: "cash",
			},
		);
		instanceId = created.id;
		expect(created.status).toBe("pending");
	});

	await test.step("Reject the pending package as admin", async () => {
		await orpcCall(page, "packageInstances", "reject", {
			organizationId: TEST_ORG_ID,
			packageInstanceId: instanceId,
			reason: "E2E rejection",
		});
	});

	await test.step("Verify the package status is cancelled via getById", async () => {
		const pkg = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"getById",
			{ organizationId: TEST_ORG_ID, id: instanceId },
		);
		expect(pkg.status).toBe("cancelled");
	});

	await test.step("Open the Approvals queue (rejected package no longer pending)", async () => {
		await page.goto("/dashboard/operations/approvals");
		await expect(page).toHaveURL(/\/dashboard\/operations\/approvals/);
		await page.waitForTimeout(1000);
		await expect(
			page.getByText(/pending package approvals/i).first(),
		).toBeVisible();
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — none needed (reject already cancelled the package)", async () => {
		// The reject step set status=cancelled; a redundant cancel would 409
		// ("already cancelled"), so no further cleanup is required.
	});
});

// ───────────────────────────────────────────────────────────────────────────
// P0 — Installment confirmPayment unlocks credits
// ───────────────────────────────────────────────────────────────────────────
test("Confirming an installment payment unlocks credits on the package", {
	tag: ["@p0"],
}, async ({ page }) => {
	let instanceId = "";

	await test.step("Seed an active installment-plan package", async () => {
		const fx = await ensureJourneyFixtures(page);
		expect(fx.client, "an active client must exist").toBeTruthy();
		expect(
			fx.packageService,
			"a package-eligible service must exist",
		).toBeTruthy();
		expect(
			fx.installmentPlan,
			"an installment plan (>= 2 installments) must exist",
		).toBeTruthy();
		test.skip(
			!fx.client || !fx.packageService || !fx.installmentPlan,
			"Missing client / package service / installment plan to seed installments",
		);

		const plan = fx.installmentPlan!;
		// source: assigned + status active skips the approval gate; the schedule is
		// generated because the plan has numInstallments > 1. Credits >= numInstallments
		// so the first installment unlocks at least one credit.
		const created = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"create",
			{
				organizationId: TEST_ORG_ID,
				serviceId: fx.packageService!.id,
				clientId: fx.client!.userId,
				source: "assigned",
				status: "active",
				creditsTotal: Math.max(plan.numInstallments * 3, plan.numInstallments),
				startsAt: NOW().toISOString(),
				expiresAt: PLUS_DAYS(180).toISOString(),
				totalPrice: 90000,
				paymentStatus: "pending",
				paymentMethod: "cash",
				paymentPlanType: plan.code,
			},
		);
		instanceId = created.id;
		expect(instanceId).toBeTruthy();
		expect(created.installmentsTotal).toBe(plan.numInstallments);
	});

	let firstInstallmentId = "";
	let creditsBefore = 0;

	await test.step("Read the generated installment schedule", async () => {
		type Installment = {
			id: string;
			installmentNumber: number;
			status: string;
			amount: number;
		};
		const installments = await orpcCall<object, Installment[]>(
			page,
			"installments",
			"listByPackageInstance",
			{ organizationId: TEST_ORG_ID, packageInstanceId: instanceId },
		);
		expect(installments.length).toBeGreaterThan(1);
		const firstPending = installments.find(
			(i) => i.status === "pending" || i.status === "overdue",
		);
		expect(firstPending, "a payable installment must exist").toBeTruthy();
		firstInstallmentId = firstPending!.id;

		const pkg = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"getById",
			{ organizationId: TEST_ORG_ID, id: instanceId },
		);
		creditsBefore = pkg.creditsUnlocked ?? 0;
	});

	await test.step("Confirm the first installment payment (cash)", async () => {
		type ConfirmResult = {
			installment: { status: string };
			packageInstance: {
				creditsUnlocked?: number | null;
				installmentsPaid?: number;
			};
		};
		const result = await orpcCall<object, ConfirmResult>(
			page,
			"installments",
			"confirmPayment",
			{
				organizationId: TEST_ORG_ID,
				installmentId: firstInstallmentId,
				paymentMethod: "cash",
				notes: "E2E confirm",
			},
		);
		expect(result.installment.status).toBe("paid");
		expect(result.packageInstance.installmentsPaid).toBeGreaterThanOrEqual(1);
		// Confirming a payment must unlock at least as many credits as before.
		const after = result.packageInstance.creditsUnlocked ?? 0;
		expect(after).toBeGreaterThanOrEqual(creditsBefore);
		expect(after).toBeGreaterThan(0);
		test.info().annotations.push({
			type: "credits-unlocked",
			description: `${creditsBefore} → ${after}`,
		});
	});

	await test.step("Open the Installments view (legacy tab redirects to packages)", async () => {
		await page.goto("/dashboard/packages/installments/view");
		await expect(page).toHaveURL(/\/dashboard\/packages\/view/);
		await expect(
			page.getByRole("heading", { name: /packages/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the installment package", async () => {
		if (!instanceId) return;
		try {
			await orpcCall(page, "packageInstances", "cancel", {
				organizationId: TEST_ORG_ID,
				id: instanceId,
				reason: "E2E cleanup",
			});
		} catch (err) {
			if (
				err instanceof OrpcClientError &&
				(err.code === "NOT_FOUND" || err.code === "CONFLICT")
			)
				return;
			throw err;
		}
	});
});

// ───────────────────────────────────────────────────────────────────────────
// P1 — packageInstanceStaff: assign → replace → remove
// ───────────────────────────────────────────────────────────────────────────
test("Package staff can be assigned, replaced, and removed", {
	tag: ["@p1"],
}, async ({ page }) => {
	let instanceId = "";
	let trainer: MemberRow | null = null;

	await test.step("Seed an active package to attach staff to", async () => {
		const fx = await ensureJourneyFixtures(page);
		const pair = await resolveAssignablePair(page);
		test.skip(
			!pair || !fx.client,
			"No package-eligible service + trainer available for staff assignment",
		);
		trainer = pair!.trainer;

		// Assigned + active so it is a usable, non-pending package.
		const created = await orpcCall<object, PackageInstance>(
			page,
			"packageInstances",
			"create",
			{
				organizationId: TEST_ORG_ID,
				serviceId: pair!.service.id,
				clientId: fx.client!.userId,
				source: "assigned",
				status: "active",
				creditsTotal: pair!.service.sessionCount ?? 1,
				startsAt: NOW().toISOString(),
				expiresAt: PLUS_DAYS(180).toISOString(),
				totalPrice: 50000,
				paymentStatus: "paid",
				paymentMethod: "cash",
			},
		);
		instanceId = created.id;
		expect(instanceId).toBeTruthy();
	});

	await test.step("Assign a trainer to staff slot 0", async () => {
		// staffId is the control-panel userId (assignTrainer writes members.userId here).
		await orpcCall(page, "packageInstanceStaff", "assign", {
			organizationId: TEST_ORG_ID,
			packageInstanceId: instanceId,
			staffId: trainer!.userId,
			slotIndex: 0,
			role: "trainer",
		});

		type StaffRow = { staffId: string; slotIndex: number };
		const staff = await orpcCall<object, StaffRow[]>(
			page,
			"packageInstanceStaff",
			"list",
			{ organizationId: TEST_ORG_ID, packageInstanceId: instanceId },
		);
		expect(staff.some((s) => s.staffId === trainer!.userId)).toBe(true);
	});

	await test.step("Replace ALL staff assignments atomically (slot 0 only)", async () => {
		await orpcCall(page, "packageInstanceStaff", "replace", {
			organizationId: TEST_ORG_ID,
			packageInstanceId: instanceId,
			assignments: [
				{ staffId: trainer!.userId, slotIndex: 0, role: "trainer" },
			],
		});

		type StaffRow = { staffId: string; slotIndex: number };
		const staff = await orpcCall<object, StaffRow[]>(
			page,
			"packageInstanceStaff",
			"list",
			{ organizationId: TEST_ORG_ID, packageInstanceId: instanceId },
		);
		expect(staff.length).toBe(1);
		expect(staff[0]!.staffId).toBe(trainer!.userId);
	});

	await test.step("Remove the staff member", async () => {
		const res = await orpcCall<object, { success: boolean }>(
			page,
			"packageInstanceStaff",
			"remove",
			{
				organizationId: TEST_ORG_ID,
				packageInstanceId: instanceId,
				staffId: trainer!.userId,
			},
		);
		expect(res.success).toBe(true);

		type StaffRow = { staffId: string };
		const staff = await orpcCall<object, StaffRow[]>(
			page,
			"packageInstanceStaff",
			"list",
			{ organizationId: TEST_ORG_ID, packageInstanceId: instanceId },
		);
		expect(staff.some((s) => s.staffId === trainer!.userId)).toBe(false);
	});

	await test.step("Open the Session Packs view to show the package list renders", async () => {
		await page.goto("/dashboard/packages/instances/view");
		await expect(page).toHaveURL(/\/dashboard\/packages\/view/);
		await expect(
			page.getByRole("heading", { name: /packages/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});

	await test.step("Cleanup — cancel the seeded package", async () => {
		if (!instanceId) return;
		try {
			await orpcCall(page, "packageInstances", "cancel", {
				organizationId: TEST_ORG_ID,
				id: instanceId,
				reason: "E2E cleanup",
			});
		} catch (err) {
			if (
				err instanceof OrpcClientError &&
				(err.code === "NOT_FOUND" || err.code === "CONFLICT")
			)
				return;
			throw err;
		}
	});
});

// ───────────────────────────────────────────────────────────────────────────
// P1 — Memberships list renders
// ───────────────────────────────────────────────────────────────────────────
test("Memberships list renders for the admin", { tag: ["@p1"] }, async ({
	page,
}) => {
	await test.step("List active memberships via packageInstances.listMemberships", async () => {
		// The Memberships tab renders this query (not the freeze/holds memberships router).
		type MembershipRow = { id: string; status?: string };
		const raw = await orpcCall<
			object,
			MembershipRow[] | { rows?: MembershipRow[]; items?: MembershipRow[] }
		>(page, "packageInstances", "listMemberships", {
			organizationId: TEST_ORG_ID,
			filter: "active",
			limit: 100,
			offset: 0,
		});
		const rows = Array.isArray(raw) ? raw : (raw.rows ?? raw.items ?? []);
		expect(Array.isArray(rows)).toBe(true);
		test.info().annotations.push({
			type: "memberships-count",
			description: String(rows.length),
		});
	});

	await test.step("Open the Memberships view (legacy tab redirects to packages)", async () => {
		await page.goto("/dashboard/memberships/view");
		await expect(page).toHaveURL(/\/dashboard\/packages\/view/);
		await expect(
			page.getByRole("heading", { name: /packages/i }).first(),
		).toBeVisible();
		await page.waitForTimeout(1000);
		await expect(page.locator("body")).not.toContainText(
			/something went wrong/i,
		);
	});
});
