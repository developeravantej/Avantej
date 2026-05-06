/**
 * Example test exercising the `members` router via the test harness in
 * `../test-utils/mock-context.ts`. Covers `retryGhlSync` because it has a
 * minimal mocking surface (one tenantDb null check + two honoContext lookups).
 *
 * This file is intentionally small — its purpose is to prove the harness is
 * usable. Per-procedure coverage will be added in follow-up tasks.
 */

import { describe, expect, it, mock } from "bun:test";
import { call, ORPCError } from "@orpc/server";
import { memberRouter } from "./members";
import { createMockContext } from "../test-utils/mock-context";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

describe("memberRouter.retryGhlSync", () => {
	it("returns ghlSync error when GHL dispatcher binding is missing", async () => {
		const context = createMockContext({
			tenantDb: {} as never,
			// no honoBindings — controlPanelDb + dispatchStaffSync absent
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({
			ghlSync: {
				status: "error",
				error: "GHL sync not configured",
			},
		});
	});

	it("invokes dispatchStaffSync with operation=update and returns its result", async () => {
		const dispatchStaffSync = mock(() =>
			Promise.resolve({
				status: "synced" as const,
				ghlUserId: "ghl-user-123",
			}),
		);
		const controlPanelDb = { __marker: "cp-db" };
		const tenantDb = { __marker: "tenant-db" };

		const context = createMockContext({
			tenantDb: tenantDb as never,
			honoBindings: { controlPanelDb, dispatchStaffSync },
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(dispatchStaffSync).toHaveBeenCalledTimes(1);
		const arg = dispatchStaffSync.mock.calls[0][0] as {
			controlPanelDb: unknown;
			tenantDb: unknown;
			organizationId: string;
			memberId: string;
			operation: string;
		};
		expect(arg.controlPanelDb).toBe(controlPanelDb);
		expect(arg.tenantDb).toBe(tenantDb);
		expect(arg.organizationId).toBe(ORG_ID);
		expect(arg.memberId).toBe(MEMBER_ID);
		expect(arg.operation).toBe("update");
		expect(result).toEqual({
			ghlSync: { status: "synced", ghlUserId: "ghl-user-123" },
		});
	});

	it("wraps dispatcher rejections into a ghlSync error result", async () => {
		const dispatchStaffSync = mock(() =>
			Promise.reject(new Error("boom")),
		);
		const context = createMockContext({
			tenantDb: {} as never,
			honoBindings: {
				controlPanelDb: {},
				dispatchStaffSync,
			},
		});

		const result = await call(
			memberRouter.retryGhlSync,
			{ organizationId: ORG_ID, memberId: MEMBER_ID },
			{ context },
		);

		expect(result).toEqual({
			ghlSync: { status: "error", error: "boom" },
		});
	});

	it("throws INTERNAL_SERVER_ERROR when tenantDb is missing", async () => {
		const context = createMockContext({ tenantDb: undefined });

		await expect(
			call(
				memberRouter.retryGhlSync,
				{ organizationId: ORG_ID, memberId: MEMBER_ID },
				{ context },
			),
		).rejects.toBeInstanceOf(ORPCError);
	});
});
