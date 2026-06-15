/**
 * Scheduled Reports Cron — happy path + Resend failure tests.
 *
 * Uses mock.module (hoisted) to replace @avantej-core/services so that
 * getDashboardKpis, listDueScheduledReports, markScheduledReportSent, and
 * markScheduledReportFailed are controlled. sendEmail is tested via the
 * built-in email capture (NODE_ENV=test activates capture automatically).
 *
 * Note: mock.module must appear before the dynamic import of the service.
 * The cron service is dynamically imported inside each test so that the mock
 * registry is populated before the module resolves.
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: test stubs
type AnyDb = any;

// ── Mock Resend so sendEmail never hits the real API ──────────────────────
const mockResendSend = mock(() =>
	Promise.resolve({ data: { id: "email-mock-id" }, error: null }),
);

mock.module("resend", () => {
	class MockResend {
		emails = { send: mockResendSend };
	}
	return { Resend: MockResend };
});

// Reset resend client cache so it picks up the mock on next call
import { __resetResendClient } from "@/lib/email";
__resetResendClient();

import { __setEmailCaptureEnabled, __clearEmailCaptures } from "@/lib/email";

// ── Service function mocks ─────────────────────────────────────────────────

const mockListDue = mock(() => Promise.resolve([]));
const mockGetKpis = mock(() =>
	Promise.resolve({
		totalSales: 120000,
		previousPeriodSales: 100000,
		activeMembersCount: 42,
		completedAppointments: 80,
		totalAppointments: 95,
		from: new Date("2026-04-01T00:00:00Z"),
		to: new Date("2026-04-07T23:59:59Z"),
		revenueByBranch: [],
	}),
);
const mockMarkSent = mock(() => Promise.resolve());
const mockMarkFailed = mock(() => Promise.resolve());

mock.module("@avantej-core/services", () => ({
	listDueScheduledReports: mockListDue,
	getDashboardKpis: mockGetKpis,
	markScheduledReportSent: mockMarkSent,
	markScheduledReportFailed: mockMarkFailed,
	// Other exports the service file may pull in
	createScheduledReport: mock(() => Promise.resolve({})),
	deleteScheduledReport: mock(() => Promise.resolve()),
	listScheduledReports: mock(() => Promise.resolve([])),
	toggleScheduledReportActive: mock(() => Promise.resolve({})),
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const REPORT_ROW = {
	id: "rpt-0001",
	reportName: "Weekly Summary",
	recipients: "owner@gym.com",
	windowKey: "7D",
	format: "csv",
	frequency: "weekly",
	isActive: true,
	nextRunAt: new Date("2026-01-01T06:00:00Z"),
	createdAt: new Date(),
	updatedAt: new Date(),
	lastSentAt: null,
	lastError: null,
	createdBy: "user-1",
};

function makeControlPanelDb(orgs: unknown[]): AnyDb {
	return {
		select: () => ({
			from: () => ({
				where: () => Promise.resolve(orgs),
			}),
		}),
	};
}

function makeTenantDb(): AnyDb {
	// listDueScheduledReports → select().from().where() → resolves via mock above
	// hierarchyNodes → select().from()
	const nodeSelectChain: AnyDb = {
		from: () => Promise.resolve([{ id: "node-1" }]),
	};
	return {
		select: () => nodeSelectChain,
		update: () => ({
			set: () => ({
				where: () => Promise.resolve([]),
			}),
		}),
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runScheduledReports — happy path (one due report)", () => {
	beforeEach(() => {
		mockListDue.mockClear();
		mockGetKpis.mockClear();
		mockMarkSent.mockClear();
		mockMarkFailed.mockClear();
		mockResendSend.mockClear();
		__setEmailCaptureEnabled(true);
		__clearEmailCaptures();
	});

	afterEach(() => {
		__clearEmailCaptures();
	});

	it("sends one email and calls markScheduledReportSent", async () => {
		// One org, one due report
		// biome-ignore lint/suspicious/noExplicitAny: mock typed as never[] due to @avantej-core/services mock
		mockListDue.mockResolvedValueOnce([REPORT_ROW] as any);

		const getTenantDb = mock(() => Promise.resolve(makeTenantDb()));
		const controlPanelDb = makeControlPanelDb([
			{ id: "org-1", name: "Fit Studio KL", paymentStatus: "active" },
		]);

		const { runScheduledReports } = await import("./scheduled-reports.service");

		const result = await runScheduledReports({
			controlPanelDb,
			getTenantDb,
			dashboardUrl: "https://app.avantej.com",
			now: new Date("2026-01-01T07:00:00Z"),
		});

		expect(result.orgsScanned).toBe(1);
		expect(result.reportsDue).toBe(1);
		expect(result.emailsSent).toBe(1);
		expect(result.errors).toBe(0);

		// markScheduledReportSent should have been called with the report id
		expect(mockMarkSent).toHaveBeenCalledTimes(1);
		// biome-ignore lint/suspicious/noExplicitAny: mock call args are typed as never[]
		const markSentArgs = mockMarkSent.mock.calls[0] as any[];
		expect(markSentArgs[1]).toBe(REPORT_ROW.id);

		// Resend mock confirms sendEmail was called with correct recipient/subject
		expect(mockResendSend).toHaveBeenCalledTimes(1);
		// biome-ignore lint/suspicious/noExplicitAny: mock call args are typed as never[]
		const sendCallArgs = mockResendSend.mock.calls[0] as any[];
		const sendCall = sendCallArgs[0] as { to: string[]; subject: string };
		expect(sendCall.to).toContain("owner@gym.com");
		expect(sendCall.subject).toContain("Weekly Summary");
	});
});

describe("runScheduledReports — Resend failure path", () => {
	beforeEach(() => {
		mockListDue.mockClear();
		mockGetKpis.mockClear();
		mockMarkSent.mockClear();
		mockMarkFailed.mockClear();
		mockResendSend.mockClear();
		__setEmailCaptureEnabled(true);
		__clearEmailCaptures();
	});

	afterEach(() => {
		__clearEmailCaptures();
	});

	it("calls markScheduledReportFailed when getDashboardKpis throws", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: mock typed as never[] due to @avantej-core/services mock
		mockListDue.mockResolvedValueOnce([REPORT_ROW] as any);
		// Simulate a KPI query failure (e.g. tenant DB unreachable for analytics)
		mockGetKpis.mockRejectedValueOnce(new Error("analytics query timeout"));

		const getTenantDb = mock(() => Promise.resolve(makeTenantDb()));
		const controlPanelDb = makeControlPanelDb([
			{ id: "org-1", name: "Fit Studio KL", paymentStatus: "active" },
		]);

		const { runScheduledReports } = await import("./scheduled-reports.service");

		const result = await runScheduledReports({
			controlPanelDb,
			getTenantDb,
			dashboardUrl: "https://app.avantej.com",
			now: new Date("2026-01-01T07:00:00Z"),
		});

		expect(result.orgsScanned).toBe(1);
		expect(result.reportsDue).toBe(1);
		expect(result.emailsSent).toBe(0);
		expect(result.errors).toBe(1);

		// markScheduledReportFailed should have been called with the error message
		expect(mockMarkFailed).toHaveBeenCalledTimes(1);
		// biome-ignore lint/suspicious/noExplicitAny: mock call args are typed as never[]
		const markFailedArgs = mockMarkFailed.mock.calls[0] as any[];
		expect(markFailedArgs[1]).toBe(REPORT_ROW.id);
		expect(typeof markFailedArgs[2]).toBe("string");
		expect((markFailedArgs[2] as string).length).toBeGreaterThan(0);

		// markScheduledReportSent must NOT have been called
		expect(mockMarkSent).not.toHaveBeenCalled();

		// Resend must NOT have been called
		expect(mockResendSend).not.toHaveBeenCalled();
	});
});
