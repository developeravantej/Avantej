import { describe, test, expect, mock, beforeEach } from "bun:test";

// Mock the Resend domains wrapper so no network/env is needed.
const mockGetDomain = mock(
	async (_id: string): Promise<{ id: string; name: string; status: string; records?: unknown[] }> => ({
		id: "d_1",
		name: "mail.example.com",
		status: "verified",
	}),
);
const mockVerifyDomain = mock(async (_id: string): Promise<void> => {});

mock.module("@/lib/resend-domains", () => ({
	getResendDomain: mockGetDomain,
	verifyResendDomain: mockVerifyDomain,
}));

// Mock the persistence service so we can drive the stale list + observe updates.
const mockListStale = mock(async (..._args: unknown[]): Promise<unknown[]> => []);
const mockUpdateStatus = mock(async (..._args: unknown[]): Promise<unknown> => ({}));

mock.module("@avantej-core/services/email-domain.service", () => ({
	listStaleEmailDomains: mockListStale,
	updateEmailDomainStatus: mockUpdateStatus,
}));

import { runEmailDomainRefresh } from "./email-domain-refresh.service";

const fakeDb = {} as never;

function staleRow(over: Record<string, unknown> = {}) {
	return {
		id: "11111111-1111-4111-8111-111111111111",
		resendDomainId: "d_resend_1",
		domain: "mail.example.com",
		status: "pending",
		...over,
	};
}

beforeEach(() => {
	mockGetDomain.mockClear();
	mockVerifyDomain.mockClear();
	mockListStale.mockClear();
	mockUpdateStatus.mockClear();
	// default: one pending row
	mockListStale.mockReturnValue(Promise.resolve([staleRow()]) as never);
	mockGetDomain.mockReturnValue(
		Promise.resolve({ id: "d_1", name: "mail.example.com", status: "verified" }) as never,
	);
});

describe("runEmailDomainRefresh", () => {
	test("promotes a pending row to verified when Resend reports verified", async () => {
		const res = await runEmailDomainRefresh({ controlPanelDb: fakeDb });

		expect(res).toEqual({ checked: 1, updated: 1, failed: 0 });
		expect(mockVerifyDomain).toHaveBeenCalledTimes(1);
		expect(mockUpdateStatus).toHaveBeenCalledTimes(1);
		const call = mockUpdateStatus.mock.calls[0]![1] as { id: string; status: string };
		expect(call.status).toBe("verified");
	});

	test("does NOT update when live status maps to the same value", async () => {
		mockListStale.mockReturnValue(Promise.resolve([staleRow({ status: "pending" })]) as never);
		mockGetDomain.mockReturnValue(
			Promise.resolve({ id: "d_1", name: "mail.example.com", status: "not_started" }) as never,
		); // not_started → pending, unchanged

		const res = await runEmailDomainRefresh({ controlPanelDb: fakeDb });

		expect(res).toEqual({ checked: 1, updated: 0, failed: 0 });
		expect(mockUpdateStatus).not.toHaveBeenCalled();
	});

	test("counts a row as failed when Resend get throws, and continues", async () => {
		mockListStale.mockReturnValue(
			Promise.resolve([staleRow({ id: "a", resendDomainId: "bad" }), staleRow({ id: "b" })]) as never,
		);
		mockGetDomain.mockImplementationOnce(async () => {
			throw new Error("resend boom");
		});

		const res = await runEmailDomainRefresh({ controlPanelDb: fakeDb });

		expect(res.checked).toBe(2);
		expect(res.failed).toBe(1);
		expect(res.updated).toBe(1); // second row still processed → verified
	});

	test("a verify nudge failure is non-fatal (status still read)", async () => {
		mockVerifyDomain.mockImplementationOnce(async () => {
			throw new Error("verify rate-limited");
		});

		const res = await runEmailDomainRefresh({ controlPanelDb: fakeDb });

		expect(res).toEqual({ checked: 1, updated: 1, failed: 0 });
		expect(mockGetDomain).toHaveBeenCalledTimes(1);
	});

	test("no stale rows → no-op summary", async () => {
		mockListStale.mockReturnValue(Promise.resolve([]) as never);

		const res = await runEmailDomainRefresh({ controlPanelDb: fakeDb });

		expect(res).toEqual({ checked: 0, updated: 0, failed: 0 });
		expect(mockGetDomain).not.toHaveBeenCalled();
	});
});
