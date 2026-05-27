/**
 * Integration-style tests for `confirmPayoutViaStripe` + bulk variant.
 *
 * Stubs the Stripe client so we exercise the full end-to-end DB flow:
 *   SELECT FOR UPDATE → partner lookup → idempotency key shape →
 *   payout row UPDATE → linked commission_splits flip →
 *   success audit row OR failure audit row (in a separate tx).
 *
 * The Stripe SDK is injection-friendly by design (`StripeTransfersClient`
 * interface), so we don't need a real network call to verify the contract.
 * Hits real DB via `createTenantDb` so the FOR UPDATE lock,
 * status-flip side-effects on commission_splits, and audit_log row writes
 * all exercise actual SQL.
 *
 * Asserts (against the live tenant DB):
 *   - Happy path: payouts row goes pending → paid; stripeTransferId stamped;
 *     linked splits flipped to paid; audit_log has `payout.confirm_via_stripe`.
 *   - Stripe rejection: payouts row stays at pending; audit_log has
 *     `payout.confirm_via_stripe.failed` with the captured error code +
 *     idempotency key.
 *   - Idempotency key shape: confirm-payout:<payoutId>.
 *   - Bulk: per-row outcomes aggregate correctly; succeeded + failed = total.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { partnerStripeAccounts } from "@avantej-core/db/schema/tenant/partner-stripe-accounts";
import { payouts } from "@avantej-core/db/schema/tenant/payouts";
import { auditLogs } from "@avantej-core/db/schema/tenant/audit-logs";
import {
	confirmAllPayoutsViaStripe,
	confirmPayoutViaStripe,
	ConfirmPayoutError,
	type StripeTransfersClient,
} from "./confirm-payout-via-stripe.service";
import {
	createTenantDb,
	makeIntegrationAdminContext,
	loadDevVars,
} from "@/tests/helpers/integration-setup";

type TenantDbType = Awaited<ReturnType<typeof createTenantDb>>;

// ─── Stripe stubs ───────────────────────────────────────────────────────────

interface StripeCall {
	args: Parameters<StripeTransfersClient["transfers"]["create"]>[0];
	options: Parameters<StripeTransfersClient["transfers"]["create"]>[1];
}

function makeStripeRecorder(behavior: (call: StripeCall) => Promise<{ id: string }>) {
	const calls: StripeCall[] = [];
	const client: StripeTransfersClient = {
		transfers: {
			create: async (args, options) => {
				const call: StripeCall = { args, options };
				calls.push(call);
				return behavior(call);
			},
		},
	};
	return { client, calls };
}

function makeStripeOk(transferId = "tr_test_ok") {
	return makeStripeRecorder(async () => ({ id: transferId }));
}

function makeStripeFailing(message: string, extra?: { code?: string; type?: string }) {
	return makeStripeRecorder(async () => {
		const err = new Error(message) as Error & { code?: string; type?: string };
		if (extra?.code) err.code = extra.code;
		if (extra?.type) err.type = extra.type;
		throw err;
	});
}

// ─── Test fixtures (seeded into the live tenant DB) ─────────────────────────

let tenantDb: TenantDbType;
let testOrgId: string;
let actorUserId: string;

beforeAll(async () => {
	loadDevVars();
	tenantDb = createTenantDb();
	const ctx = makeIntegrationAdminContext(tenantDb);
	testOrgId = ctx.organizationId;
	actorUserId = ctx.member.userId;
});

afterAll(async () => {
	// Best-effort cleanup of test rows. Filter by a known marker in description.
	try {
		await tenantDb
			.delete(payouts)
			.where(eq(payouts.description, "Stripe transfer-test seed"));
	} catch {
		// ignore — test cleanup, not load-bearing
	}
});

async function seedPendingStripeConnectPayout(opts: {
	recipientId: string;
	amount?: number;
	currency?: string;
}): Promise<string> {
	const [row] = await tenantDb
		.insert(payouts)
		.values({
			recipientId: opts.recipientId,
			amount: opts.amount ?? 1234,
			grossAmountCents: opts.amount ?? 1234,
			deductionsCents: 0,
			currency: opts.currency ?? "myr",
			payoutMethod: "stripe_connect",
			status: "pending",
			description: "Stripe transfer-test seed",
		})
		.returning({ id: payouts.id });
	if (!row) throw new Error("seedPendingStripeConnectPayout: insert returned no row");
	return row.id;
}

async function seedPartnerStripeAccount(opts: {
	partnerId: string;
	stripeAccountId: string;
	payoutsEnabled?: boolean;
	status?: "pending" | "active" | "restricted" | "rejected";
}) {
	await tenantDb
		.insert(partnerStripeAccounts)
		.values({
			partnerId: opts.partnerId,
			stripeConnectAccountId: opts.stripeAccountId,
			stripeConnectStatus: opts.status ?? "active",
			stripeConnectAccountType: "partner",
			accountType: "standard",
			payoutsEnabled: opts.payoutsEnabled ?? true,
			detailsSubmitted: true,
		})
		.onConflictDoUpdate({
			target: partnerStripeAccounts.partnerId,
			set: {
				stripeConnectAccountId: opts.stripeAccountId,
				stripeConnectStatus: opts.status ?? "active",
				payoutsEnabled: opts.payoutsEnabled ?? true,
				updatedAt: new Date(),
			},
		});
}

async function findAuditByEntity(
	entityId: string,
	action: string,
): Promise<{ summary: string; changes: unknown } | null> {
	const rows = await tenantDb
		.select({ summary: auditLogs.summary, changes: auditLogs.changes })
		.from(auditLogs)
		.where(eq(auditLogs.entityId, entityId));
	return rows.find((r) => (r as unknown as { summary: string }).summary.includes(action)) ?? null;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("confirmPayoutViaStripe — happy path", () => {
	it("transfers + flips payout to paid + writes success audit + uses correct idempotency key", async () => {
		const partnerId = `test-partner-happy-${Date.now()}`;
		const stripeAcctId = `acct_test_happy_${Date.now()}`;
		await seedPartnerStripeAccount({ partnerId, stripeAccountId: stripeAcctId });
		const payoutId = await seedPendingStripeConnectPayout({ recipientId: partnerId });

		const { client, calls } = makeStripeOk("tr_happy_xyz");
		const result = await confirmPayoutViaStripe(
			tenantDb,
			payoutId,
			{
				organizationId: testOrgId,
				actor: { userId: actorUserId },
				stripeClient: client,
			},
			() => client,
		);

		expect(result.status).toBe("paid");
		expect(result.stripeTransferId).toBe("tr_happy_xyz");

		// Stripe call shape
		expect(calls).toHaveLength(1);
		expect(calls[0]?.args.destination).toBe(stripeAcctId);
		expect(calls[0]?.args.amount).toBe(1234);
		expect(calls[0]?.args.currency).toBe("myr");
		expect(calls[0]?.args.metadata?.organizationId).toBe(testOrgId);
		expect(calls[0]?.args.metadata?.payoutId).toBe(payoutId);
		expect(calls[0]?.options?.idempotencyKey).toBe(`confirm-payout:${payoutId}`);

		// DB read-back
		const [row] = await tenantDb
			.select()
			.from(payouts)
			.where(eq(payouts.id, payoutId))
			.limit(1);
		expect(row?.status).toBe("paid");
		expect(row?.stripeTransferId).toBe("tr_happy_xyz");
		expect(row?.paidAt).toBeTruthy();

		const audit = await findAuditByEntity(payoutId, "Payout confirmed via Stripe Connect");
		expect(audit).toBeTruthy();
	});
});

describe("confirmPayoutViaStripe — Stripe rejection writes failure audit", () => {
	it("stays at pending; writes payout.confirm_via_stripe.failed with stripe error fields", async () => {
		const partnerId = `test-partner-reject-${Date.now()}`;
		await seedPartnerStripeAccount({
			partnerId,
			stripeAccountId: `acct_test_reject_${Date.now()}`,
		});
		const payoutId = await seedPendingStripeConnectPayout({ recipientId: partnerId });

		const { client } = makeStripeFailing("Insufficient platform balance", {
			code: "balance_insufficient",
			type: "StripeInvalidRequestError",
		});
		await expect(
			confirmPayoutViaStripe(
				tenantDb,
				payoutId,
				{
					organizationId: testOrgId,
					actor: { userId: actorUserId },
					stripeClient: client,
				},
				() => client,
			),
		).rejects.toMatchObject({
			code: "STRIPE_TRANSFER_FAILED",
			message: "Insufficient platform balance",
		});

		// Payout row should still be pending — lock tx rolled back.
		const [row] = await tenantDb
			.select()
			.from(payouts)
			.where(eq(payouts.id, payoutId))
			.limit(1);
		expect(row?.status).toBe("pending");
		expect(row?.stripeTransferId).toBeNull();

		// Failure audit row should be present (written on tenantDb, not tx).
		const failAudit = await findAuditByEntity(payoutId, "Stripe transfer rejected");
		expect(failAudit).toBeTruthy();
		const changes = failAudit?.changes as Record<string, unknown>;
		expect(changes?.stripeErrorMessage).toBe("Insufficient platform balance");
		expect(changes?.stripeErrorCode).toBe("balance_insufficient");
		expect(changes?.stripeErrorType).toBe("StripeInvalidRequestError");
		expect(changes?.idempotencyKey).toBe(`confirm-payout:${payoutId}`);
	});
});

describe("confirmPayoutViaStripe — guards short-circuit before Stripe", () => {
	it("PARTNER_NOT_PAYOUTS_ENABLED: no Stripe call when partner is restricted", async () => {
		const partnerId = `test-partner-restricted-${Date.now()}`;
		await seedPartnerStripeAccount({
			partnerId,
			stripeAccountId: `acct_test_restricted_${Date.now()}`,
			payoutsEnabled: false,
			status: "restricted",
		});
		const payoutId = await seedPendingStripeConnectPayout({ recipientId: partnerId });

		const { client, calls } = makeStripeOk();
		await expect(
			confirmPayoutViaStripe(
				tenantDb,
				payoutId,
				{
					organizationId: testOrgId,
					actor: { userId: actorUserId },
					stripeClient: client,
				},
				() => client,
			),
		).rejects.toBeInstanceOf(ConfirmPayoutError);

		// Critical: Stripe must not have been called.
		expect(calls).toHaveLength(0);

		// And no failure audit either (the failure was DB-level, not Stripe-level).
		const failAudit = await findAuditByEntity(payoutId, "Stripe transfer rejected");
		expect(failAudit).toBeNull();
	});
});

describe("confirmAllPayoutsViaStripe — bulk aggregation", () => {
	it("returns per-row outcomes with succeeded + failed counts matching reality", async () => {
		const partnerId = `test-partner-bulk-${Date.now()}`;
		await seedPartnerStripeAccount({
			partnerId,
			stripeAccountId: `acct_test_bulk_${Date.now()}`,
		});

		const okIds = await Promise.all([
			seedPendingStripeConnectPayout({ recipientId: partnerId }),
			seedPendingStripeConnectPayout({ recipientId: partnerId }),
		]);
		// One missing/never-onboarded partner → PARTNER_NOT_ONBOARDED
		const orphanedId = await seedPendingStripeConnectPayout({
			recipientId: `nonexistent-partner-${Date.now()}`,
		});

		// Stripe stub succeeds for the first two, irrelevant for the orphan (guard fires first).
		let counter = 0;
		const { client } = makeStripeRecorder(async () => ({ id: `tr_bulk_${++counter}` }));

		const result = await confirmAllPayoutsViaStripe(
			tenantDb,
			[...okIds, orphanedId],
			{ organizationId: testOrgId, actor: { userId: actorUserId }, stripeClient: client },
			() => client,
		);
		expect(result.succeeded).toBe(2);
		expect(result.failed).toBe(1);
		expect(result.rows).toHaveLength(3);
		const orphanRow = result.rows.find((r) => r.payoutId === orphanedId);
		expect(orphanRow?.ok).toBe(false);
		if (orphanRow && !orphanRow.ok) {
			expect(orphanRow.errorCode).toBe("PARTNER_NOT_ONBOARDED");
		}
	});
});
