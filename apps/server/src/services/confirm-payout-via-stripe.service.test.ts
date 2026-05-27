/**
 * Unit tests for confirmPayoutViaStripe.
 *
 * Strategy: stub the Stripe client + a minimal Drizzle-shaped tenantDb that
 * supports the chained calls the service exercises (select+for+limit,
 * update+set+where) plus transaction-callback delegation. The service runs
 * inside a single transaction, so the mock's `transaction(cb)` just calls
 * `cb(tx)` where `tx` IS the same mock — that's the same pattern as the
 * existing db-mock.factory in tests/helpers.
 */
import { describe, expect, it, mock } from "bun:test";
import {
	ConfirmPayoutError,
	confirmPayoutViaStripe,
	type StripeTransfersClient,
} from "./confirm-payout-via-stripe.service";

// ---------------------------------------------------------------------------
// Tenant-DB mock with transaction support
// ---------------------------------------------------------------------------

interface SelectResult {
	rows: unknown[];
}

function makeTx(opts: {
	payoutRow?: unknown[];
	partnerRow?: unknown[];
}) {
	// Each `tx.select()` call returns a fresh chain that resolves to the next
	// queued rows. The service calls select() twice: once for the payout, once
	// for the partner. We hand back payoutRow first, then partnerRow.
	const selectQueue: SelectResult[] = [
		{ rows: opts.payoutRow ?? [] },
		{ rows: opts.partnerRow ?? [] },
	];

	const recordedUpdates: Array<{ table: unknown; values: unknown }> = [];

	const makeSelectChain = (rows: unknown[]) => {
		const chain: Record<string, unknown> = {};
		chain.from = mock(() => chain);
		chain.where = mock(() => chain);
		chain.for = mock(() => chain);
		chain.limit = mock(() => Promise.resolve(rows));
		// The non-locked select for partner doesn't call .for(), so .limit alone
		// must also resolve to rows.
		return chain;
	};

	const tx = {
		select: mock(() => {
			const next = selectQueue.shift();
			return makeSelectChain(next?.rows ?? []);
		}),
		update: mock((table: unknown) => {
			const updateChain: Record<string, unknown> = {};
			updateChain.set = mock((values: unknown) => {
				recordedUpdates.push({ table, values });
				const setChain = { where: mock(() => Promise.resolve(undefined)) };
				return setChain;
			});
			return updateChain;
		}),
		insert: mock(() => ({
			values: mock(() => ({
				returning: mock(() => Promise.resolve([{ id: "audit-stub-id" }])),
				onConflictDoNothing: mock(() => Promise.resolve([])),
			})),
		})),
		// Transaction returns whatever the callback returns; tx === self.
		transaction: mock((cb: (t: unknown) => Promise<unknown>) => cb(tx)),
	} as const;

	return { tx, recordedUpdates };
}

function makeStripeOk(transferId = "tr_test_happy"): StripeTransfersClient {
	return {
		transfers: {
			create: mock(() => Promise.resolve({ id: transferId })),
		} as unknown as StripeTransfersClient["transfers"],
	};
}

function makeStripeFailing(message = "insufficient_funds"): StripeTransfersClient {
	return {
		transfers: {
			create: mock(() => Promise.reject(new Error(message))),
		} as unknown as StripeTransfersClient["transfers"],
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const BASE_PAYOUT = {
	id: "payout-uuid",
	recipientId: "partner-1",
	amount: 1000,
	currency: "myr",
	status: "pending",
	payoutMethod: "stripe_connect",
	description: null as string | null,
};

const BASE_PARTNER = {
	stripeConnectAccountId: "acct_test_123",
	payoutsEnabled: true,
	stripeConnectStatus: "active",
};

const ACTOR = { userId: "operator-1" };

describe("confirmPayoutViaStripe — guards", () => {
	it("NOT_FOUND when payout row is absent", async () => {
		const { tx } = makeTx({ payoutRow: [] });
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"missing-id",
				{ organizationId: "org-1", actor: ACTOR, stripeClient: makeStripeOk() },
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("BAD_REQUEST_STATUS when payout is already paid", async () => {
		const { tx } = makeTx({
			payoutRow: [{ ...BASE_PAYOUT, status: "paid" }],
			partnerRow: [BASE_PARTNER],
		});
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"payout-uuid",
				{ organizationId: "org-1", actor: ACTOR, stripeClient: makeStripeOk() },
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST_STATUS" });
	});

	it("BAD_REQUEST_METHOD when paymentMethod is cash (not stripe_connect)", async () => {
		const { tx } = makeTx({
			payoutRow: [{ ...BASE_PAYOUT, payoutMethod: "cash" }],
			partnerRow: [BASE_PARTNER],
		});
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"payout-uuid",
				{ organizationId: "org-1", actor: ACTOR, stripeClient: makeStripeOk() },
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST_METHOD" });
	});

	it("PARTNER_NOT_ONBOARDED when partner has no Stripe Connect row", async () => {
		const { tx } = makeTx({ payoutRow: [BASE_PAYOUT], partnerRow: [] });
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"payout-uuid",
				{ organizationId: "org-1", actor: ACTOR, stripeClient: makeStripeOk() },
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({ code: "PARTNER_NOT_ONBOARDED" });
	});

	it("PARTNER_NOT_PAYOUTS_ENABLED when partner is pending/restricted", async () => {
		const { tx } = makeTx({
			payoutRow: [BASE_PAYOUT],
			partnerRow: [
				{ ...BASE_PARTNER, payoutsEnabled: false, stripeConnectStatus: "restricted" },
			],
		});
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"payout-uuid",
				{ organizationId: "org-1", actor: ACTOR, stripeClient: makeStripeOk() },
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({ code: "PARTNER_NOT_PAYOUTS_ENABLED" });
	});
});

describe("confirmPayoutViaStripe — Stripe interactions", () => {
	it("STRIPE_TRANSFER_FAILED when stripe.transfers.create throws", async () => {
		const { tx } = makeTx({
			payoutRow: [BASE_PAYOUT],
			partnerRow: [BASE_PARTNER],
		});
		await expect(
			confirmPayoutViaStripe(
				tx as never,
				"payout-uuid",
				{
					organizationId: "org-1",
					actor: ACTOR,
					stripeClient: makeStripeFailing("balance_insufficient"),
				},
				() => makeStripeOk(),
			),
		).rejects.toMatchObject({
			code: "STRIPE_TRANSFER_FAILED",
			message: "balance_insufficient",
		});
	});

	it("happy path: returns paid + transfer id; calls Stripe with correct metadata + idempotency key", async () => {
		const { tx, recordedUpdates } = makeTx({
			payoutRow: [BASE_PAYOUT],
			partnerRow: [BASE_PARTNER],
		});
		const stripe = makeStripeOk("tr_happy_xyz");
		const result = await confirmPayoutViaStripe(
			tx as never,
			"payout-uuid",
			{ organizationId: "org-1", actor: ACTOR, stripeClient: stripe },
			() => makeStripeOk(),
		);
		expect(result).toEqual({
			payoutId: "payout-uuid",
			stripeTransferId: "tr_happy_xyz",
			status: "paid",
		});

		// Verify the Stripe call shape.
		const createMock = stripe.transfers.create as unknown as ReturnType<typeof mock>;
		expect(createMock).toHaveBeenCalledTimes(1);
		const [createArgs, createOpts] = createMock.mock.calls[0] as [
			Record<string, unknown>,
			{ idempotencyKey?: string },
		];
		expect(createArgs.amount).toBe(1000);
		expect(createArgs.currency).toBe("myr");
		expect(createArgs.destination).toBe("acct_test_123");
		expect((createArgs.metadata as Record<string, string>)?.organizationId).toBe("org-1");
		expect((createArgs.metadata as Record<string, string>)?.payoutId).toBe("payout-uuid");
		expect(createOpts.idempotencyKey).toBe("confirm-payout:payout-uuid");

		// Verify the payouts row was UPDATEd with the transfer id + status=paid.
		const payoutUpdate = recordedUpdates.find(
			(u) =>
				typeof u.values === "object" &&
				u.values !== null &&
				"stripeTransferId" in u.values,
		);
		expect(payoutUpdate).toBeDefined();
		const v = payoutUpdate?.values as Record<string, unknown>;
		expect(v.status).toBe("paid");
		expect(v.stripeTransferId).toBe("tr_happy_xyz");

		// Verify linked commission_splits flip to paid.
		const splitsUpdate = recordedUpdates.find(
			(u) =>
				typeof u.values === "object" &&
				u.values !== null &&
				"status" in u.values &&
				(u.values as Record<string, unknown>).status === "paid" &&
				!("stripeTransferId" in u.values),
		);
		expect(splitsUpdate).toBeDefined();
	});
});

describe("ConfirmPayoutError", () => {
	it("carries the code + message for downstream mapping to oRPC errors", () => {
		const err = new ConfirmPayoutError("PARTNER_NOT_PAYOUTS_ENABLED", "partner X not enabled");
		expect(err.code).toBe("PARTNER_NOT_PAYOUTS_ENABLED");
		expect(err.message).toBe("partner X not enabled");
		expect(err.name).toBe("ConfirmPayoutError");
	});
});
