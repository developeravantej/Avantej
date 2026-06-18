/**
 * Scheduled Reports Sender — Smoke Test
 *
 * Verifies the public shape of runScheduledReports. The function is heavy on
 * IO (controlPanelDb queries + per-tenant DB lookups + Resend dispatch); a full
 * integration test requires a Neon test branch and Resend test mode and is
 * deferred to the integration suite. This file exists so a missing import or
 * signature regression fails fast in unit tests.
 *
 * Run: bun test src/services/scheduled-reports.service.test.ts
 */

import { describe, expect, mock, test } from "bun:test";
import { runScheduledReports } from "./scheduled-reports.service";

// biome-ignore lint/suspicious/noExplicitAny: smoke test stubs
type AnyDb = any;

describe("runScheduledReports (smoke)", () => {
	test("returns the expected report shape when no orgs exist", async () => {
		const fromMock = mock(() => ({
			where: () => Promise.resolve([]),
		}));
		const controlPanelDb: AnyDb = {
			select: () => ({ from: fromMock }),
		};

		const getTenantDb = mock(() =>
			Promise.reject(new Error("should not be called when no orgs")),
		);

		const report = await runScheduledReports({
			controlPanelDb,
			getTenantDb,
			dashboardUrl: "https://app.avantej.com",
		});

		expect(report).toEqual({
			orgsScanned: 0,
			reportsDue: 0,
			emailsSent: 0,
			errors: 0,
		});
		expect(getTenantDb).not.toHaveBeenCalled();
	});

	test("increments errors when getTenantDb throws for an org", async () => {
		const controlPanelDb: AnyDb = {
			select: () => ({
				from: () => ({
					where: () =>
						Promise.resolve([
							{ id: "org-1", name: "Org 1", paymentStatus: "active" },
						]),
				}),
			}),
		};

		const getTenantDb = mock(() =>
			Promise.reject(new Error("tenant DB unreachable")),
		);

		const report = await runScheduledReports({
			controlPanelDb,
			getTenantDb,
			dashboardUrl: "https://app.avantej.com",
		});

		expect(report.orgsScanned).toBe(1);
		expect(report.errors).toBe(1);
		expect(report.emailsSent).toBe(0);
	});
});
