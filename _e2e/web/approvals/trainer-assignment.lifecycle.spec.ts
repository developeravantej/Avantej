import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";

/**
 * Approvals trainer-assignment journey (Plan 1 Task 5).
 *
 * Mirrors what the approvals inbox (/dashboard/operations/approvals) does:
 * a purchased package lands in the pending queue, an admin confirms payment
 * and assigns a trainer (assignment IS approval), the assignment is recorded
 * in package_instance_staff (slot 0) and the row leaves the pending list.
 *
 * API-driven per convention: the assign popover is Radix-based and cannot be
 * UI-automated (isTrusted), so we drive /rpc/<router>/<procedure> directly —
 * the exact calls ExpandedRowDetail.assignMutation and the inbox query make.
 */
test.describe("approvals — trainer assignment journey", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	async function createPendingPurchased(
		request: import("@playwright/test").APIRequestContext,
		organizationId: string,
		fx: { serviceId: string; clientId: string },
	) {
		const { startsAt, expiresAt } = pkgWindow();
		const created = await rpc(request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "purchased",
			creditsTotal: 5,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "pending",
			purchaseNumber: testId("pn"),
		});
		const id = created?.id;
		expect(id, `create: ${JSON.stringify(created)}`).toBeTruthy();
		cleanup.add(`pkg ${id}`, async () => {
			await rpcRaw(request, "packageInstances/cancel", {
				organizationId,
				id,
				reason: "E2E-DEEP cleanup (approvals journey)",
			});
		});
		return created;
	}

	async function listPendingIds(
		request: import("@playwright/test").APIRequestContext,
		organizationId: string,
	): Promise<string[]> {
		const res = await rpc(request, "packageInstances/listPending", {
			organizationId,
			approvalStatus: "pending",
			scope: "all",
			limit: 200,
		});
		const rows = Array.isArray(res) ? res : (res?.rows ?? []);
		return rows.map((r: { id: string }) => r.id);
	}

	test("assign trainer from the pending queue → staff slot written, row leaves the list", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");
		test.skip(!fx.trainerMemberId, "no trainer fixture for assignTrainer");

		// Resolve the trainer's control-panel userId — package_instance_staff
		// stores members.userId (not members.id) per project convention.
		const memRes = await rpc(page.request, "members/list", { organizationId });
		const members = Array.isArray(memRes)
			? memRes
			: (memRes?.items ?? memRes?.members ?? []);
		const trainer = members.find(
			(m: { id: string }) => m.id === fx.trainerMemberId,
		);
		expect(trainer?.userId, "trainer userId resolvable").toBeTruthy();

		// 1. Purchased package lands in pending (approval gate invariant).
		const created = await createPendingPurchased(
			page.request,
			organizationId,
			fx,
		);
		expect(created?.status).toBe("pending");

		// 2. Offline payment confirmed by the admin (Confirm payment received).
		await rpc(page.request, "packageInstances/confirmPayment", {
			organizationId,
			packageInstanceId: created.id,
			paymentMethod: "cash",
		});

		// 3. The package appears in the approvals inbox pending queue.
		const pendingBefore = await listPendingIds(page.request, organizationId);
		expect(
			pendingBefore,
			"created package should be in the pending approvals queue",
		).toContain(created.id);

		// 4. Admin assigns a trainer (assignment IS approval → active).
		const assigned = await rpc(page.request, "packageInstances/assignTrainer", {
			organizationId,
			packageInstanceId: created.id,
			trainerMemberId: fx.trainerMemberId,
		});
		expect(assigned?.status).toBe("active");
		expect(assigned?.assignedTrainerId).toBe(fx.trainerMemberId);

		// 5. packageInstanceStaff reflects the assignment (slot 0, role trainer,
		//    staffId = trainer's userId).
		const staff = await rpc(page.request, "packageInstanceStaff/list", {
			organizationId,
			packageInstanceId: created.id,
		});
		const staffRows = Array.isArray(staff) ? staff : (staff?.rows ?? []);
		const slot0 = staffRows.find(
			(s: { slotIndex: number }) => s.slotIndex === 0,
		);
		expect(slot0, `staff rows: ${JSON.stringify(staffRows)}`).toBeTruthy();
		expect(slot0.staffId).toBe(trainer.userId);
		expect(slot0.role).toBe("trainer");

		// 6. The row leaves the pending list…
		const pendingAfter = await listPendingIds(page.request, organizationId);
		expect(pendingAfter).not.toContain(created.id);

		// …and shows up under the approved filter (assignedTrainerId set).
		const approvedRes = await rpc(
			page.request,
			"packageInstances/listPending",
			{
				organizationId,
				approvalStatus: "approved",
				scope: "all",
				limit: 200,
			},
		);
		const approvedRows = Array.isArray(approvedRes)
			? approvedRes
			: (approvedRes?.rows ?? []);
		expect(approvedRows.map((r: { id: string }) => r.id)).toContain(created.id);
	});

	test("assignTrainer is blocked while the payment has failed", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");
		test.skip(!fx.trainerMemberId, "no trainer fixture for assignTrainer");

		const { startsAt, expiresAt } = pkgWindow();
		const created = await rpc(page.request, "packageInstances/create", {
			organizationId,
			serviceId: fx.serviceId,
			clientId: fx.clientId,
			source: "purchased",
			creditsTotal: 5,
			startsAt,
			expiresAt,
			totalPrice: 0,
			paymentStatus: "failed",
			purchaseNumber: testId("pn"),
		});
		test.skip(
			created?.paymentStatus !== "failed",
			"tenant does not persist a failed paymentStatus on create",
		);
		cleanup.add(`pkg ${created.id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id: created.id,
				reason: "E2E-DEEP cleanup (approvals journey)",
			});
		});

		// Payment gate: failed payment must be resolved before approval.
		const res = await rpcRaw(page.request, "packageInstances/assignTrainer", {
			organizationId,
			packageInstanceId: created.id,
			trainerMemberId: fx.trainerMemberId,
		});
		expect(
			[400, 422].includes(res.status()),
			`expected assignTrainer to be rejected for failed payment, got ${res.status()}`,
		).toBeTruthy();
	});
});
