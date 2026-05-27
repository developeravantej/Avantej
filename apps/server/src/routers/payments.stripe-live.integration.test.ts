/**
 * Payments Router — LIVE Stripe Integration Tests
 *
 * Hits the real Stripe API in test mode using the real Connect account
 * onboarded for TEST_ORG_ID (acct_1TWwNZGk6ShaTZfV, MY, charges_enabled).
 *
 * Why this layer exists — the unit tests mock Stripe entirely; the
 * router integration tests use a real DB but mock Stripe. This file is
 * the ONLY test that confirms the actual Stripe API accepts the
 * parameters the refactored procedures send. If Stripe deprecates a
 * field, renames an option, or changes a constraint, this catches it
 * while the others pass against a frozen mock.
 *
 * Driver note — uses the Neon HTTP (fetch-based) driver via
 * drizzle-orm/neon-http instead of the WebSocket pool. The WS pool
 * deadlocks in Bun when test-body queries follow procedure-internal
 * UPDATEs, per the documented hang in customer-profiles.integration.test.ts.
 * HTTP is stateless — no pool, no carry-over, no hang.
 *
 * Cost — each test creates real (but test-mode) Stripe objects. They
 * are NOT billable. Test-mode objects don't appear in live mode.
 *
 * Skipped when SKIP_INTEGRATION_TESTS=true (default in bun test:unit).
 *
 * Run: cd apps/server && bun test src/routers/payments.stripe-live.integration.test.ts
 */

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { appointments } from "@avantej-core/db/schema/tenant/appointments";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	TEST_ORG_ID,
	TEST_MEMBER_ID,
	TEST_USER_ID,
	loadDevVars,
	shouldSkipIntegration,
} from "../tests/helpers/integration-setup";

loadDevVars();

function makeTenantHttpDb() {
	const url = process.env.TENANT_DATABASE_URL;
	if (!url) throw new Error("TENANT_DATABASE_URL not set");
	const client = neon(url);
	return drizzleHttp({ client, schema: tenantSchema });
}

function makeControlPanelHttpDb() {
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL not set");
	const client = neon(url);
	return drizzleHttp({ client, schema: controlPanelSchema });
}

// Track seeded data for cleanup
const seededAppointmentIds: string[] = [];

afterAll(async () => {
	if (shouldSkipIntegration()) return;
	const db = makeTenantHttpDb();
	for (const id of seededAppointmentIds) {
		try {
			await db.delete(appointments).where(eq(appointments.id, id));
		} catch {
			// best-effort
		}
	}
});

// Each Stripe round-trip can take 2–5s; allow extra headroom.
const T = 30_000;

describe.skipIf(shouldSkipIntegration())(
	"paymentsRouter — LIVE Stripe (test mode)",
	() => {
		let tenantDb: ReturnType<typeof makeTenantHttpDb>;
		let controlPanelDb: ReturnType<typeof makeControlPanelHttpDb>;

		beforeAll(() => {
			tenantDb = makeTenantHttpDb();
			controlPanelDb = makeControlPanelHttpDb();
		});

		async function findBranchId(): Promise<string> {
			const rows = await tenantDb.execute(
				sql`SELECT id FROM hierarchy_nodes LIMIT 1`,
			);
			// Neon HTTP returns { rows: [...] } when a query has results
			const row = (rows as unknown as { rows?: { id: string }[]; id?: string }[])[0]
				?? (rows as unknown as { rows: { id: string }[] }).rows?.[0];
			if (!row?.id) throw new Error("No hierarchy_nodes in tenant DB");
			return row.id;
		}

		async function seedAppointment(opts?: {
			paymentStatus?: string;
			sessionTotal?: number;
		}): Promise<string> {
			const id = crypto.randomUUID();
			seededAppointmentIds.push(id);
			const branchId = await findBranchId();
			const sessionTotal = opts?.sessionTotal ?? 5000;
			const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
			const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);

			await tenantDb.execute(sql`
				INSERT INTO appointments (
					id, type, branch_id, status,
					start_time, duration, end_time,
					session_total, price_per_client,
					payment_status, currency, created_by,
					created_at, updated_at
				) VALUES (
					${id}, 'private', ${branchId}, 'confirmed',
					${startTime.toISOString()}, 60, ${endTime.toISOString()},
					${sessionTotal}, ${sessionTotal},
					${opts?.paymentStatus ?? "pending"}, 'MYR', ${TEST_USER_ID},
					NOW(), NOW()
				)
			`);
			return id;
		}

		function makeContext() {
			return {
				organizationId: TEST_ORG_ID,
				accessibleNodeIds: [] as string[],
				member: {
					id: TEST_MEMBER_ID,
					userId: TEST_USER_ID,
					organizationId: TEST_ORG_ID,
					role: "admin" as const,
					status: "active" as const,
					hierarchyScopeId: null,
				},
				session: {
					user: { id: TEST_USER_ID, email: "franchisee@gmail.com", name: "Test Admin" },
				},
				tenantDb,
				honoContext: {
					get: (key: string) =>
						key === "controlPanelDb" ? controlPanelDb : undefined,
				},
			};
		}

		async function callProc(procedure: unknown, input: unknown): Promise<unknown> {
			// biome-ignore lint/suspicious/noExplicitAny: orpc handler shape
			return await (procedure as any)["~orpc"].handler({
				input,
				context: makeContext(),
			});
		}

		// ── createPaymentIntent ────────────────────────────────────────────────
		it(
			"createPaymentIntent creates a real Stripe PaymentIntent on the Connect account",
			async () => {
				const { createPaymentsRouter } = await import("./payments");
				const router = createPaymentsRouter();
				const appointmentId = await seedAppointment();

				const result = (await callProc(router.createPaymentIntent, {
					organizationId: TEST_ORG_ID,
					appointmentId,
				})) as {
					clientSecret: string;
					paymentIntentId: string;
					stripeAccountId: string;
					amount: number;
					currency: string;
					applicationFeeAmount: number;
				};

				expect(result.paymentIntentId).toMatch(/^pi_/);
				expect(result.clientSecret).toMatch(/^pi_.+_secret_/);
				expect(result.stripeAccountId).toMatch(/^acct_/);
				expect(result.amount).toBe(5000);
				expect(result.currency).toBe("MYR");
				expect(result.applicationFeeAmount).toBeGreaterThan(0);
				expect(result.applicationFeeAmount).toBeLessThanOrEqual(result.amount);
			},
			T,
		);

		it(
			"createPaymentIntent rejects an already-paid appointment with PRECONDITION_FAILED",
			async () => {
				const { createPaymentsRouter } = await import("./payments");
				const router = createPaymentsRouter();
				const appointmentId = await seedAppointment({ paymentStatus: "paid" });

				await expect(
					callProc(router.createPaymentIntent, {
						organizationId: TEST_ORG_ID,
						appointmentId,
					}),
				).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
			},
			T,
		);

		// ── sendPaymentLink ────────────────────────────────────────────────────
		it(
			"sendPaymentLink creates a real Stripe Price + PaymentLink on the Connect account",
			async () => {
				const { createPaymentsRouter } = await import("./payments");
				const router = createPaymentsRouter();
				const appointmentId = await seedAppointment();

				const result = (await callProc(router.sendPaymentLink, {
					organizationId: TEST_ORG_ID,
					appointmentId,
				})) as {
					paymentLinkId: string;
					paymentLinkUrl: string;
					amount: number;
					currency: string;
				};

				expect(result.paymentLinkId).toMatch(/^plink_/);
				expect(result.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);
				expect(result.amount).toBe(5000);
				expect(result.currency).toBe("MYR");
			},
			T,
		);

		it(
			"sendPaymentLink is idempotent — second call without regenerate returns same link",
			async () => {
				const { createPaymentsRouter } = await import("./payments");
				const router = createPaymentsRouter();
				const appointmentId = await seedAppointment();

				const first = (await callProc(router.sendPaymentLink, {
					organizationId: TEST_ORG_ID,
					appointmentId,
				})) as { paymentLinkId: string; paymentLinkUrl: string };

				const second = (await callProc(router.sendPaymentLink, {
					organizationId: TEST_ORG_ID,
					appointmentId,
				})) as { paymentLinkId: string; paymentLinkUrl: string };

				expect(second.paymentLinkId).toBe(first.paymentLinkId);
				expect(second.paymentLinkUrl).toBe(first.paymentLinkUrl);
			},
			T * 2,
		);
	},
);
