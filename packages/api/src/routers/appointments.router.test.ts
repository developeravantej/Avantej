/**
 * Appointments Router — unit tests for create guards and error mapping.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { createMockContext } from "../test-utils/mock-context";
import * as services from "@avantej-core/services";

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PKG_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const mockCreateAppointment = mock(() =>
	Promise.resolve({
		id: "appt-1",
		status: "confirmed",
		branchId: BRANCH_ID,
	}),
);
const mockUpdateAppointment = mock((_, id: string) =>
	Promise.resolve({ id, status: "cancelled", branchId: BRANCH_ID }),
);
const mockGetDescendantNodeIds = mock(() => Promise.resolve([BRANCH_ID]));
const mockSyncGcal = mock(() => Promise.resolve());

mock.module("@avantej-core/services", () => ({
	...services,
	createAppointment: mockCreateAppointment,
	updateAppointment: mockUpdateAppointment,
	syncAppointmentToGoogleCalendar: mockSyncGcal,
	listAppointmentsForUser: mock(() => Promise.resolve([])),
	getAppointmentById: mock(() => Promise.resolve(null)),
	listAppointmentsWithRecurrence: mock(() => Promise.resolve([])),
	isVirtualId: mock(() => false),
	getAppointmentStatusHistory: mock(() => Promise.resolve([])),
	getDescendantNodeIds: mockGetDescendantNodeIds,
}));

import { appointmentsRouter } from "./appointments";

function makeAdminDb(packageStatus?: string) {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
			packageInstances: {
				findFirst: mock(() =>
					Promise.resolve(
						packageStatus ? { id: PKG_ID, status: packageStatus } : null,
					),
				),
			},
		},
	} as unknown as never;
}

const validInput = {
	organizationId: ORG_ID,
	type: "private" as const,
	startTime: "2026-06-01T10:00:00.000Z",
	duration: 60,
	branchId: BRANCH_ID,
	sessionTotal: 5000,
	pricePerClient: 5000,
};

describe("appointmentsRouter.create", () => {
	beforeEach(() => {
		mockCreateAppointment.mockClear();
		mockGetDescendantNodeIds.mockClear();
	});

	it("delegates to createAppointment on happy path", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		const result = await call(appointmentsRouter.create, validInput, {
			context: ctx,
		});
		expect(result).toMatchObject({ id: "appt-1" });
		expect(mockCreateAppointment).toHaveBeenCalledTimes(1);
	});

	it("rejects when tenantDb is missing", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: undefined,
		});
		await expect(
			call(appointmentsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});

	it("rejects when member is missing", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeAdminDb(),
			member: null,
		});
		await expect(
			call(appointmentsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects when branchId is outside accessible scope", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [OTHER_BRANCH],
		});
		await expect(
			call(appointmentsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("rejects booking against pending package instance", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeAdminDb("pending"),
			accessibleNodeIds: [BRANCH_ID],
		});
		await expect(
			call(
				appointmentsRouter.create,
				{ ...validInput, packageInstanceId: PKG_ID },
				{ context: ctx },
			),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Package is awaiting trainer assignment.",
		});
	});

	it("maps overlap errors to CONFLICT via mapPgError", async () => {
		mockCreateAppointment.mockImplementation(() => {
			throw { code: "23P01", constraint: "appointments_trainer_no_overlap" };
		});
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeAdminDb(),
			accessibleNodeIds: [BRANCH_ID],
		});
		await expect(
			call(appointmentsRouter.create, validInput, { context: ctx }),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Conflict: trainer is already booked for an overlapping time.",
		});
	});
});

// ---------------------------------------------------------------------------
// Helpers for series cancel tests
// ---------------------------------------------------------------------------

const PARENT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function makeAppt(
	id: string,
	status = "confirmed",
	recurringParentId: string | null = null,
) {
	return { id, status, branchId: BRANCH_ID, recurringParentId };
}

/**
 * DB mock that returns `toCancel` for any `.select().from().where()` call.
 * The `transaction` executes the callback synchronously with a stub tx.
 */
function makeSeriesCancelDb(toCancel: ReturnType<typeof makeAppt>[] = []) {
	const stubTx = {
		update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
	};
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
		select: () => ({
			from: () => ({ where: () => Promise.resolve(toCancel) }),
		}),
		transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(stubTx),
	} as unknown as never;
}

// ---------------------------------------------------------------------------
// cancelSeries
// ---------------------------------------------------------------------------

describe("appointmentsRouter.cancelSeries", () => {
	beforeEach(() => {
		mockUpdateAppointment.mockClear();
		mockSyncGcal.mockClear();
	});

	it("calls updateAppointment for each non-terminal appointment", async () => {
		const appts = [
			makeAppt(PARENT_ID),
			makeAppt("child-1", "confirmed", PARENT_ID),
			makeAppt("child-2", "pending", PARENT_ID),
		];
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeSeriesCancelDb(appts),
		});

		const result = await call(
			appointmentsRouter.cancelSeries,
			{ organizationId: ORG_ID, parentId: PARENT_ID },
			{ context: ctx },
		);

		expect(result).toEqual({ success: true });
		expect(mockUpdateAppointment).toHaveBeenCalledTimes(3);
		for (const appt of appts) {
			expect(mockUpdateAppointment).toHaveBeenCalledWith(
				expect.anything(),
				appt.id,
				expect.objectContaining({ status: "cancelled" }),
			);
		}
	});

	it("fires a GCal delete sync for each cancelled appointment", async () => {
		const appts = [
			makeAppt(PARENT_ID),
			makeAppt("child-1", "confirmed", PARENT_ID),
		];
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeSeriesCancelDb(appts),
		});

		await call(
			appointmentsRouter.cancelSeries,
			{ organizationId: ORG_ID, parentId: PARENT_ID },
			{ context: ctx },
		);

		// Sync fires async (fire-and-forget) — flush microtasks
		await Promise.resolve();
		expect(mockSyncGcal).toHaveBeenCalledTimes(2);
		expect(mockSyncGcal).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "cancelled" }),
			"delete",
			expect.anything(),
		);
	});

	it("succeeds with no appointments to cancel", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeSeriesCancelDb([]),
		});

		const result = await call(
			appointmentsRouter.cancelSeries,
			{ organizationId: ORG_ID, parentId: PARENT_ID },
			{ context: ctx },
		);

		expect(result).toEqual({ success: true });
		expect(mockUpdateAppointment).not.toHaveBeenCalled();
	});
});

// ---------------------------------------------------------------------------
// cancelFuture
// ---------------------------------------------------------------------------

describe("appointmentsRouter.cancelFuture", () => {
	beforeEach(() => {
		mockUpdateAppointment.mockClear();
		mockSyncGcal.mockClear();
	});

	it("calls updateAppointment for each non-terminal child from fromDate", async () => {
		const children = [
			makeAppt("child-1", "confirmed", PARENT_ID),
			makeAppt("child-2", "pending", PARENT_ID),
		];
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeSeriesCancelDb(children),
		});

		const result = await call(
			appointmentsRouter.cancelFuture,
			{ organizationId: ORG_ID, parentId: PARENT_ID, fromDate: "2026-07-01" },
			{ context: ctx },
		);

		expect(result).toEqual({ success: true });
		expect(mockUpdateAppointment).toHaveBeenCalledTimes(2);
		for (const child of children) {
			expect(mockUpdateAppointment).toHaveBeenCalledWith(
				expect.anything(),
				child.id,
				expect.objectContaining({ status: "cancelled" }),
			);
		}
	});

	it("fires a GCal delete sync for each cancelled child", async () => {
		const children = [makeAppt("child-1", "confirmed", PARENT_ID)];
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeSeriesCancelDb(children),
		});

		await call(
			appointmentsRouter.cancelFuture,
			{ organizationId: ORG_ID, parentId: PARENT_ID, fromDate: "2026-07-01" },
			{ context: ctx },
		);

		await Promise.resolve();
		expect(mockSyncGcal).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ status: "cancelled" }),
			"delete",
			expect.anything(),
		);
	});
});

// ---------------------------------------------------------------------------
// commission triggers — router ↔ service contract
// ---------------------------------------------------------------------------
//
// ARCHITECTURAL NOTE: Commission calculation lives inside `updateAppointment`
// in `packages/services/src/appointment.service.ts`. This test file mocks the
// entire `@avantej-core/services` module (including `updateAppointment`), so
// `calculateCommissionForAppointment` is never executed at the router layer.
//
// What these tests verify:
//   1. The router calls `updateAppointment` with the correct `status` value —
//      ensuring the commission-triggering branches inside the service are
//      reachable for each transition (completed / no-show / cancelled).
//   2. The router threads the `actor` object (userId / memberId / role) through
//      to the service — required for the commission audit trail.
//   3. Fix 1 (commission error non-fatal): when `updateAppointment` throws, the
//      router maps it to BAD_REQUEST. In production the service itself swallows
//      commission errors and returns the updated row — so a commission failure
//      never reaches this catch block. This test confirms the router boundary.
//
// For full integration coverage of commission *firing* (splits created in DB,
// earnReason propagated, double-commission guard), add service-layer
// integration tests in packages/services/src/appointment.service.integration.test.ts.
// ---------------------------------------------------------------------------

const APPT_ID = "11111111-1111-4111-8111-111111111111";

const mockGetApptById = mock(() =>
	Promise.resolve({
		id: APPT_ID,
		status: "confirmed",
		branchId: BRANCH_ID,
		userId: null,
		salesOrderId: null,
		serviceId: "svc-1",
	}),
);

// Re-register the services mock to expose getAppointmentById alongside the
// existing mocks (mock.module is idempotent — last registration wins).
mock.module("@avantej-core/services", () => ({
	...services,
	createAppointment: mockCreateAppointment,
	updateAppointment: mockUpdateAppointment,
	getAppointmentById: mockGetApptById,
	syncAppointmentToGoogleCalendar: mockSyncGcal,
	listAppointmentsForUser: mock(() => Promise.resolve([])),
	listAppointmentsWithRecurrence: mock(() => Promise.resolve([])),
	isVirtualId: mock(() => false),
	getAppointmentStatusHistory: mock(() => Promise.resolve([])),
	getDescendantNodeIds: mockGetDescendantNodeIds,
	writeAudit: mock(() => Promise.resolve()),
}));

function makeUpdateDb() {
	return {
		query: {
			roles: { findFirst: mock(() => Promise.resolve(undefined)) },
			permissions: { findFirst: mock(() => Promise.resolve(undefined)) },
		},
	} as unknown as never;
}

const updateInput = {
	organizationId: ORG_ID,
	id: APPT_ID,
};

describe("commission triggers", () => {
	beforeEach(() => {
		mockUpdateAppointment.mockClear();
		mockGetApptById.mockClear();
		mockUpdateAppointment.mockImplementation(
			(_, id: string, params: { status?: string }) =>
				Promise.resolve({
					id,
					status: params.status ?? "confirmed",
					branchId: BRANCH_ID,
				}),
		);
		mockGetApptById.mockImplementation(() =>
			Promise.resolve({
				id: APPT_ID,
				status: "confirmed",
				branchId: BRANCH_ID,
				userId: null,
				salesOrderId: null,
				serviceId: "svc-1",
			}),
		);
	});

	it("calls updateAppointment with status=completed when marking appointment completed", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		const result = await call(
			appointmentsRouter.update,
			{ ...updateInput, status: "completed" },
			{ context: ctx },
		);

		expect(result).toMatchObject({ id: APPT_ID });
		expect(mockUpdateAppointment).toHaveBeenCalledTimes(1);
		expect(mockUpdateAppointment).toHaveBeenCalledWith(
			expect.anything(),
			APPT_ID,
			expect.objectContaining({ status: "completed" }),
		);
	});

	it("maps a thrown updateAppointment error to BAD_REQUEST (Fix 1 router boundary)", async () => {
		mockUpdateAppointment.mockImplementation(() => {
			throw new Error("commission calculation failed");
		});

		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		await expect(
			call(
				appointmentsRouter.update,
				{ ...updateInput, status: "completed" },
				{ context: ctx },
			),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "commission calculation failed",
		});
	});

	it("calls updateAppointment with status=no-show for a no-show transition", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		await call(
			appointmentsRouter.update,
			{ ...updateInput, status: "no-show" },
			{ context: ctx },
		);

		expect(mockUpdateAppointment).toHaveBeenCalledWith(
			expect.anything(),
			APPT_ID,
			expect.objectContaining({ status: "no-show" }),
		);
	});

	it("calls updateAppointment with status=cancelled for a cancellation", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
		});

		await call(
			appointmentsRouter.update,
			{ ...updateInput, status: "cancelled" },
			{ context: ctx },
		);

		expect(mockUpdateAppointment).toHaveBeenCalledWith(
			expect.anything(),
			APPT_ID,
			expect.objectContaining({ status: "cancelled" }),
		);
	});

	it("passes actor with userId, memberId, and role to updateAppointment (commission audit trail)", async () => {
		const ctx = createMockContext({
			organizationId: ORG_ID,
			tenantDb: makeUpdateDb(),
			accessibleNodeIds: [BRANCH_ID],
			session: {
				user: { id: "user-actor-1", email: "actor@example.com", name: "Actor" },
				session: { id: "sess-1" },
			},
			member: {
				id: "member-actor-1",
				userId: "user-actor-1",
				role: "admin",
				status: "active",
				hierarchyScopeId: BRANCH_ID,
			},
		});

		await call(
			appointmentsRouter.update,
			{ ...updateInput, status: "completed" },
			{ context: ctx },
		);

		expect(mockUpdateAppointment).toHaveBeenCalledWith(
			expect.anything(),
			APPT_ID,
			expect.objectContaining({
				actor: {
					userId: "user-actor-1",
					memberId: "member-actor-1",
					role: "admin",
				},
			}),
		);
	});
});
