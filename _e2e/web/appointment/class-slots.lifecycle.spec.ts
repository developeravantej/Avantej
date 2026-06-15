import { test, expect } from "@playwright/test";
import {
	testId,
	Cleanup,
	rpc,
	rpcRaw,
	getOrgId,
	getBranchId,
	expectRejected,
} from "../_safe-mutation";

// Deep, API-driven + API-verified, self-cleaning class-slot tests.
//
// A class slot needs a real serviceId + branchId. instructorId is optional, so
// these tests do not resolve a trainer (avoids a fragile dependency). The
// service is created as a throwaway and soft-removed (isActive:false) on
// teardown; the slot is torn down via classSlots/cancel (cascades enrollments).
//
// Rules exercised (class-slots crud + enrollment procedures):
//   - update capacity below current spotsBooked -> BAD_REQUEST 400
//   - enrolling the same client twice in one slot -> CONFLICT 409
//
// Enrollment inserts an appointment for the given clientUserId (free text, min
// length 1) and does NOT validate the user exists — a synthetic id is safe.
test.describe("appointment/class-slots", () => {
	const cleanup = new Cleanup();
	test.afterEach(() => cleanup.runAll());

	async function makeService(
		request: import("@playwright/test").APIRequestContext,
	): Promise<string> {
		const organizationId = getOrgId();
		const created = await rpc(request, "services/create", {
			organizationId,
			name: testId("service"),
			duration: 60,
			maxAttendees: 10,
			price: 5000,
		});
		const serviceId = created?.id ?? created?.service?.id;
		expect(
			serviceId,
			`service create: ${JSON.stringify(created)}`,
		).toBeTruthy();
		cleanup.add(`service ${serviceId}`, async () => {
			await rpcRaw(request, "services/update", {
				organizationId,
				id: serviceId,
				isActive: false,
			});
		});
		return serviceId as string;
	}

	function slotPayload(
		organizationId: string,
		serviceId: string,
		branchId: string,
		capacity: number,
	) {
		const date = new Date();
		date.setDate(date.getDate() + 7); // a week out — safe future slot
		return {
			organizationId,
			serviceId,
			branchId,
			date: date.toISOString(),
			startTime: "10:00",
			endTime: "11:00",
			capacity,
		};
	}

	test("Class slot rule — reducing capacity below booked spots is rejected (400)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const serviceId = await makeService(page.request);

		// CREATE a slot with capacity 2.
		const slot = await rpc(
			page.request,
			"classSlots/create",
			slotPayload(organizationId, serviceId, branchId, 2),
		);
		const slotId = slot?.id ?? slot?.slot?.id;
		expect(slotId, `slot create: ${JSON.stringify(slot)}`).toBeTruthy();
		cleanup.add(`class-slot ${slotId}`, async () => {
			await rpcRaw(page.request, "classSlots/cancel", {
				organizationId,
				id: slotId,
			});
		});

		// Enroll one client so spotsBooked becomes 1.
		const enroll = await rpc(page.request, "classSlots/enrollClient", {
			organizationId,
			classSlotId: slotId,
			clientUserId: testId("client"),
		});
		expect(
			enroll?.appointmentId,
			`enroll: ${JSON.stringify(enroll)}`,
		).toBeTruthy();

		// Updating capacity to 0 (< spotsBooked of 1) must be rejected (400).
		await expectRejected(
			page.request,
			"classSlots/update",
			{ organizationId, id: slotId, capacity: 0 },
			[400],
		);
	});

	test("Class slot rule — enrolling the same client twice is rejected (409)", async ({
		page,
	}) => {
		const organizationId = getOrgId();
		const branchId = await getBranchId(page.request);
		const serviceId = await makeService(page.request);

		const slot = await rpc(
			page.request,
			"classSlots/create",
			slotPayload(organizationId, serviceId, branchId, 5),
		);
		const slotId = slot?.id ?? slot?.slot?.id;
		expect(slotId, `slot create: ${JSON.stringify(slot)}`).toBeTruthy();
		cleanup.add(`class-slot ${slotId}`, async () => {
			await rpcRaw(page.request, "classSlots/cancel", {
				organizationId,
				id: slotId,
			});
		});

		const clientUserId = testId("client");

		// First enrollment succeeds.
		const first = await rpc(page.request, "classSlots/enrollClient", {
			organizationId,
			classSlotId: slotId,
			clientUserId,
		});
		expect(
			first?.appointmentId,
			`first enroll: ${JSON.stringify(first)}`,
		).toBeTruthy();

		// Second enrollment of the same client in the same slot -> CONFLICT 409.
		await expectRejected(
			page.request,
			"classSlots/enrollClient",
			{ organizationId, classSlotId: slotId, clientUserId },
			[409],
		);
	});
});
