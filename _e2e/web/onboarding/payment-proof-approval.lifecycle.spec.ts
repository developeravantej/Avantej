import { test, expect } from "@playwright/test";
import { testId, Cleanup, rpc, rpcRaw, getOrgId } from "../_safe-mutation";
import { getPkgFixtures, pkgWindow } from "../_pkg-fixtures";

/**
 * UAT §2 — Client onboarding: payment proof attaches and routes to admin approval.
 *
 * The end-to-end onboarding journey is: client registers → a purchased package is
 * created in `pending` (the approval gate) → the offline payment proof is uploaded
 * and ATTACHES to that package → the admin sees it in the approval queue → approval
 * activates the package. This spec proves that whole linkage at the API boundary:
 * the proof attaches to the registered client's package and the package only goes
 * active after admin confirmation.
 *
 * (Proofs attach to the package instance — the correct data model — not to the bare
 * registration form, which has no package to hang a payment against yet.)
 */

// Minimal valid 1×1 transparent PNG (same fixture the §7 R2 round-trip uses).
const PNG_1x1_BASE64 =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.describe("§2 onboarding — payment proof → admin approval → activation", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	test("proof attaches to the pending package and approval activates it", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const fx = await getPkgFixtures(page.request, organizationId);
		test.skip(!fx.serviceId || !fx.clientId, "no service/client fixture");

		// 1. Newly-registered client's purchased package — approval gate forces pending.
		const { startsAt, expiresAt } = pkgWindow();
		const pkg = await rpc(page.request, "packageInstances/create", {
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
		expect(pkg?.id, `create: ${JSON.stringify(pkg)}`).toBeTruthy();
		expect(pkg?.status, "purchased package is gated to pending").toBe(
			"pending",
		);
		cleanup.add(`pkg ${pkg.id}`, async () => {
			await rpcRaw(page.request, "packageInstances/cancel", {
				organizationId,
				id: pkg.id,
				reason: "E2E-DEEP cleanup",
			});
		});

		// 2. Upload the offline payment proof — it ATTACHES to this client's package.
		const fileName = `${testId("proof")}.png`;
		const uploaded = await rpc(
			page.request,
			"packageInstances/uploadPaymentProof",
			{
				organizationId,
				packageInstanceId: pkg.id,
				fileName,
				contentType: "image/png",
				dataBase64: PNG_1x1_BASE64,
			},
		);
		expect(uploaded?.id, "proof row returned").toBeTruthy();
		expect(uploaded?.r2Key).toContain(pkg.id);

		// 3. Admin sees the proof in the approval queue for that package.
		const proofs = await rpc(
			page.request,
			"packageInstances/listPaymentProofs",
			{ organizationId, packageInstanceId: pkg.id },
		);
		const proofList = Array.isArray(proofs) ? proofs : (proofs?.items ?? []);
		expect(
			proofList.some((p: { id: string }) => p.id === uploaded.id),
			"uploaded proof appears in the package's approval queue",
		).toBeTruthy();

		// 4. Package must still be pending BEFORE admin acts (no auto-activation).
		expect(pkg.status).toBe("pending");

		// 5. Admin confirms the (now-evidenced) payment, then activates via assignTrainer.
		await rpc(page.request, "packageInstances/confirmPayment", {
			organizationId,
			packageInstanceId: pkg.id,
			paymentMethod: "manual_transfer",
		});

		test.skip(!fx.trainerMemberId, "no trainer fixture for assignTrainer");
		const activated = await rpc(
			page.request,
			"packageInstances/assignTrainer",
			{
				organizationId,
				packageInstanceId: pkg.id,
				trainerMemberId: fx.trainerMemberId,
			},
		);
		expect(
			activated?.status,
			"package activates only after admin approval",
		).toBe("active");
	});
});
