/**
 * Appointments Router — unit tests for create guards and error mapping.
 */

import { describe, expect, it, mock, beforeEach } from "bun:test";
import { call } from "@orpc/server";
import { ORPCError } from "@orpc/server";
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
const mockGetDescendantNodeIds = mock(() => Promise.resolve([BRANCH_ID]));
const mockSyncGcal = mock(() => Promise.resolve());

mock.module("@avantej-core/services", () => ({
	...services,
	createAppointment: mockCreateAppointment,
	syncAppointmentToGoogleCalendar: mockSyncGcal,
	listAppointmentsForUser: mock(() => Promise.resolve([])),
	getAppointmentById: mock(() => Promise.resolve(null)),
	listAppointmentsWithRecurrence: mock(() => Promise.resolve([])),
	isVirtualId: mock(() => false),
	getAppointmentStatusHistory: mock(() => Promise.resolve([])),
	getDescendantNodeIds: mockGetDescendantNodeIds,
}));

mock.module("../lib/orpc-error-mapper", () => ({
	mapPgError: mock((err: unknown) => {
		if (err instanceof Error && err.message.includes("overlap")) {
			return new ORPCError("CONFLICT", {
				message: "Trainer or room is already booked for this time",
			});
		}
		return null;
	}),
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
						packageStatus
							? { id: PKG_ID, status: packageStatus }
							: null,
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
			throw new Error("overlap exclusion violated");
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
			message: "Trainer or room is already booked for this time",
		});
	});
});
