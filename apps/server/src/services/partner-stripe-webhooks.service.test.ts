/**
 * Unit tests for partner-stripe-webhooks.service handlers.
 *
 * Strategy: hand-rolled minimal mocks for the chained Drizzle calls.
 * The handlers exercise a narrow surface (`select().from().where().limit()`
 * + `update().set().where()`) so a small mock factory is clearer than
 * importing the full db-mock factory and configuring per-table state.
 *
 * Mutations to the linked state machine (markPayoutPaid/markPayoutFailed)
 * are NOT mocked here — the state-machine has its own integration test
 * (`gap-prove-payouts-state-machine.spec.ts`). These tests cover the
 * routing decision: did the handler resolve the right tenant + payout +
 * call the right transition?
 */
import { describe, expect, it, mock } from "bun:test";
import {
	handleAccountUpdatedForPartner,
	handleTransferEvent,
	type StripeAccountShape,
	type StripeTransferShape,
} from "./partner-stripe-webhooks.service";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/** Minimal select chain returning a fixed array. */
function makeSelectChain(rows: unknown[]) {
	const chain: Record<string, unknown> = {};
	chain.from = mock(() => chain);
	chain.where = mock(() => chain);
	chain.limit = mock(() => Promise.resolve(rows));
	return chain;
}

/** Minimal update chain that records what was passed to .set(). */
function makeUpdateChain(setRecorder: { value: unknown }) {
	const setChain = { where: mock(() => Promise.resolve(undefined)) };
	return {
		set: mock((v: unknown) => {
			setRecorder.value = v;
			return setChain;
		}),
	};
}

/**
 * Make a tiny tenantDb stub that returns the queued rows on the next select
 * and records the next update's .set() payload.
 */
function makeTenantDb({
	selectRows = [] as unknown[],
}: { selectRows?: unknown[] } = {}) {
	const setRecorder: { value: unknown } = { value: null };
	const db = {
		select: mock(() => makeSelectChain(selectRows)),
		update: mock(() => makeUpdateChain(setRecorder)),
	} as unknown as Parameters<typeof handleAccountUpdatedForPartner>[0];
	return { db, setRecorder };
}

// ---------------------------------------------------------------------------
// handleAccountUpdatedForPartner
// ---------------------------------------------------------------------------

describe("handleAccountUpdatedForPartner", () => {
	it("returns unmatched when account.metadata.partnerId is missing", async () => {
		const { db } = makeTenantDb();
		const acct: StripeAccountShape = { id: "acct_test_1" };
		const res = await handleAccountUpdatedForPartner(db, acct);
		expect(res).toEqual({ matched: false, reason: "no_partner_metadata" });
	});

	it("returns unmatched when no partner_stripe_accounts row matches the account id", async () => {
		const { db } = makeTenantDb({ selectRows: [] });
		const acct: StripeAccountShape = {
			id: "acct_orphan",
			metadata: { partnerId: "p1" },
		};
		const res = await handleAccountUpdatedForPartner(db, acct);
		expect(res).toEqual({ matched: false, reason: "no_partner_row_for_account" });
	});

	it("updates capability state to active when payouts_enabled is true", async () => {
		const { db, setRecorder } = makeTenantDb({
			selectRows: [{ id: "psa-uuid", onboardingCompletedAt: null }],
		});
		const acct: StripeAccountShape = {
			id: "acct_my_partner",
			metadata: { partnerId: "p1", organizationId: "org-1" },
			payouts_enabled: true,
			details_submitted: true,
			country: "MY",
			default_currency: "myr",
			requirements: { currently_due: [], eventually_due: [], disabled_reason: null },
		};
		const res = await handleAccountUpdatedForPartner(db, acct);
		expect(res.matched).toBe(true);
		// Inspect the set payload
		const payload = setRecorder.value as Record<string, unknown>;
		expect(payload.stripeConnectStatus).toBe("active");
		expect(payload.payoutsEnabled).toBe(true);
		expect(payload.detailsSubmitted).toBe(true);
		expect(payload.countryCode).toBe("MY");
		expect(payload.defaultCurrency).toBe("myr");
		// onboardingCompletedAt should be set since prior was null + detailsSubmitted is true
		expect(payload.onboardingCompletedAt).toBeInstanceOf(Date);
	});

	it("derives status=restricted when requirements.disabled_reason is present (non-rejected)", async () => {
		const { db, setRecorder } = makeTenantDb({
			selectRows: [{ id: "psa-uuid", onboardingCompletedAt: new Date("2026-01-01") }],
		});
		const acct: StripeAccountShape = {
			id: "acct_restricted",
			metadata: { partnerId: "p2" },
			payouts_enabled: false,
			details_submitted: true,
			requirements: { disabled_reason: "requirements.past_due", currently_due: ["external_account"] },
		};
		const res = await handleAccountUpdatedForPartner(db, acct);
		expect(res.matched).toBe(true);
		const payload = setRecorder.value as Record<string, unknown>;
		expect(payload.stripeConnectStatus).toBe("restricted");
		expect(payload.payoutsEnabled).toBe(false);
		expect(payload.requirementsDisabledReason).toBe("requirements.past_due");
		expect(payload.requirementsCurrentlyDue).toEqual(["external_account"]);
	});

	it("derives status=rejected when requirements.disabled_reason starts with 'rejected.'", async () => {
		const { db, setRecorder } = makeTenantDb({
			selectRows: [{ id: "psa-uuid", onboardingCompletedAt: null }],
		});
		const acct: StripeAccountShape = {
			id: "acct_rejected",
			metadata: { partnerId: "p3" },
			payouts_enabled: false,
			details_submitted: true,
			requirements: { disabled_reason: "rejected.fraud" },
		};
		const res = await handleAccountUpdatedForPartner(db, acct);
		expect(res.matched).toBe(true);
		const payload = setRecorder.value as Record<string, unknown>;
		expect(payload.stripeConnectStatus).toBe("rejected");
	});

	it("clears onboardingCompletedAt when details_submitted flips back to false", async () => {
		const { db, setRecorder } = makeTenantDb({
			selectRows: [{ id: "psa-uuid", onboardingCompletedAt: new Date("2026-01-01") }],
		});
		const acct: StripeAccountShape = {
			id: "acct_back_to_pending",
			metadata: { partnerId: "p4" },
			payouts_enabled: false,
			details_submitted: false,
		};
		await handleAccountUpdatedForPartner(db, acct);
		const payload = setRecorder.value as Record<string, unknown>;
		expect(payload.onboardingCompletedAt).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// handleTransferEvent
// ---------------------------------------------------------------------------

describe("handleTransferEvent — routing", () => {
	it("returns unmatched when transfer.metadata.payoutId is missing", async () => {
		const { db } = makeTenantDb();
		const transfer: StripeTransferShape = { id: "tr_no_meta" };
		const res = await handleTransferEvent(db, "transfer.created", transfer, "system-user");
		expect(res).toEqual({ matched: false, reason: "no_payout_id_metadata" });
	});

	it("returns unmatched when payoutId points at a non-existent row", async () => {
		const { db } = makeTenantDb({ selectRows: [] });
		const transfer: StripeTransferShape = {
			id: "tr_missing",
			metadata: { payoutId: "00000000-0000-0000-0000-000000000000" },
		};
		const res = await handleTransferEvent(db, "transfer.created", transfer, "system-user");
		expect(res.matched).toBe(false);
		if (!res.matched) {
			expect(res.reason).toContain("not_found");
		}
	});

	it("transfer.created stamps stripeTransferId on already-paid payout (no state transition)", async () => {
		const { db, setRecorder } = makeTenantDb({
			selectRows: [{ id: "payout-uuid", status: "paid" }],
		});
		const transfer: StripeTransferShape = {
			id: "tr_created_123",
			metadata: { payoutId: "payout-uuid" },
		};
		const res = await handleTransferEvent(db, "transfer.created", transfer, "system-user");
		// Already paid → stamp transfer id, don't call markPayoutPaid (would
		// hit the state guard). The note distinguishes this from the recovery case.
		expect(res).toEqual({ matched: true, updated: true, note: "transfer_id_stamped" });
		const payload = setRecorder.value as Record<string, unknown>;
		expect(payload.stripeTransferId).toBe("tr_created_123");
	});

	it("transfer.reversed on canceled payout no-ops (guard fires before markPayoutFailed)", async () => {
		const { db } = makeTenantDb({
			selectRows: [{ id: "payout-uuid", status: "canceled" }],
		});
		const transfer: StripeTransferShape = {
			id: "tr_reversed_late",
			metadata: { payoutId: "payout-uuid" },
		};
		const res = await handleTransferEvent(
			db,
			"transfer.reversed",
			transfer,
			"system-user",
			"reversed by Stripe",
		);
		expect(res).toMatchObject({ matched: true, updated: false });
		if (res.matched) {
			expect(res.note).toContain("not_failable");
		}
	});
});
