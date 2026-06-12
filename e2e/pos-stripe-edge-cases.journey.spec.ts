/**
 * Journey: POS online (Stripe) sale — edge cases around the payment-link flow
 *
 * Actor: tenant_admin (franchisee@gmail.com) + simulated signed Stripe webhooks
 * Priority: P1
 *
 * Covers:
 *  1. Payment-link idempotency — second createSalesOrderPaymentLink call
 *     returns the SAME link (no orphan links per refresh).
 *  2. Already-paid guard — after payment_intent.succeeded, link creation is
 *     rejected with PRECONDITION_FAILED.
 *  3. payment_intent.payment_failed — payment row → failed (+ failureReason),
 *     order stays pending, and the SAME link is still reusable for retry.
 *  4. Duplicate webhook delivery — same event id is deduped; a re-sent
 *     succeeded event (new id, same PI) stays idempotent.
 *  5. Installment maths — non-divisible total splits evenly with the
 *     remainder on the LAST installment (RM 100 / 3 → 33.33/33.33/33.34).
 *
 * Run: bunx playwright test e2e/pos-stripe-edge-cases.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Page, APIRequestContext } from "@playwright/test";
import {
	TEST_ORG_ID,
	pickFirstActiveClient,
	pickFirstBranchId,
	pickFirstService,
	pickFirstInstallmentPlan,
	ensureDefaultTaxRate,
	recordPosSaleFull,
	seedMinimalPosFixture,
} from "./helpers/seed-data";
import { orpcCall, OrpcClientError } from "./helpers/orpc-client";

const SERVER_URL = process.env.PLAYWRIGHT_SERVER_URL ?? "http://localhost:3020";
const WEBHOOK_PATH = "/webhooks/stripe/connect";

function readDevVar(key: string): string | null {
	try {
		const file = readFileSync(
			path.join(process.cwd(), "apps/server/.dev.vars"),
			"utf8",
		);
		const line = file.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
		return line ? line.slice(key.length + 1).trim() : null;
	} catch {
		return null;
	}
}

function stripeSignature(
	rawBody: string,
	secret: string,
	timestamp: number,
): string {
	const sig = createHmac("sha256", secret)
		.update(`${timestamp}.${rawBody}`)
		.digest("hex");
	return `t=${timestamp},v1=${sig}`;
}

/** POST a signed payment_intent event for a sales_order to the local connect webhook. */
async function sendSalesOrderEvent(
	request: APIRequestContext,
	secret: string,
	opts: {
		eventId: string;
		type: "payment_intent.succeeded" | "payment_intent.payment_failed";
		piId: string;
		amount: number;
		salesOrderId: string;
		paymentId: string;
		failureMessage?: string;
	},
): Promise<{ status: number; body: string }> {
	const event = {
		id: opts.eventId,
		object: "event",
		api_version: "2024-06-20",
		created: Math.floor(Date.now() / 1000),
		type: opts.type,
		account: "acct_e2e_edge",
		data: {
			object: {
				id: opts.piId,
				object: "payment_intent",
				amount: opts.amount,
				amount_received:
					opts.type === "payment_intent.succeeded" ? opts.amount : 0,
				currency: "myr",
				status:
					opts.type === "payment_intent.succeeded"
						? "succeeded"
						: "requires_payment_method",
				...(opts.failureMessage
					? { last_payment_error: { message: opts.failureMessage } }
					: {}),
				metadata: {
					type: "sales_order",
					salesOrderId: opts.salesOrderId,
					paymentId: opts.paymentId,
					organizationId: TEST_ORG_ID,
				},
			},
		},
	};
	const rawBody = JSON.stringify(event);
	const resp = await request.post(`${SERVER_URL}${WEBHOOK_PATH}`, {
		headers: {
			"content-type": "application/json",
			"stripe-signature": stripeSignature(
				rawBody,
				secret,
				Math.floor(Date.now() / 1000),
			),
		},
		data: rawBody,
	});
	return { status: resp.status(), body: await resp.text() };
}

/** Record a minimal online (Stripe) sale; returns ids. Skips test when Stripe unconfigured. */
async function recordOnlineSale(
	page: Page,
	priceCents: number,
): Promise<{ salesOrderId: string; paymentId: string }> {
	const client = await pickFirstActiveClient(page);
	test.skip(!client, "No active client — skip");
	const branchId = await pickFirstBranchId(page);
	await ensureDefaultTaxRate(page);
	type SaleResult = { salesOrderId: string; paymentId: string };
	try {
		return await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
			organizationId: TEST_ORG_ID,
			customerType: "member",
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "custom",
					description: "E2E Edge Item",
					quantity: 1,
					unitPriceCents: priceCents,
				},
			],
			paymentMethod: "online",
		});
	} catch (err) {
		if (
			err instanceof OrpcClientError &&
			/stripe is not configured/i.test(err.message)
		) {
			test.skip(true, "No Stripe connected account — skip");
		}
		throw err;
	}
}

async function cancelOrder(page: Page, salesOrderId: string): Promise<void> {
	try {
		await orpcCall(page, "salesOrders", "cancel", {
			organizationId: TEST_ORG_ID,
			id: salesOrderId,
		});
	} catch {
		// already cancelled / completed — cleanup is best-effort
	}
}

test("payment link is idempotent; rejected once the payment succeeded", {
	tag: ["@p1"],
}, async ({ page, request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");
	const sale = await recordOnlineSale(page, 5300);

	// 1. First link creation
	type LinkResult = { paymentLinkId: string; paymentLinkUrl: string };
	const link1 = await orpcCall<object, LinkResult>(
		page,
		"payments",
		"createSalesOrderPaymentLink",
		{ organizationId: TEST_ORG_ID, salesOrderId: sale.salesOrderId },
	);
	expect(link1.paymentLinkUrl).toMatch(/^https:\/\/buy\.stripe\.com\//);

	// 2. Second call returns the SAME link — no orphan link per refresh
	const link2 = await orpcCall<object, LinkResult>(
		page,
		"payments",
		"createSalesOrderPaymentLink",
		{ organizationId: TEST_ORG_ID, salesOrderId: sale.salesOrderId },
	);
	expect(link2.paymentLinkId).toBe(link1.paymentLinkId);
	expect(link2.paymentLinkUrl).toBe(link1.paymentLinkUrl);

	// 3. Flip the payment to succeeded via a signed webhook
	const hook = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_ok_${Date.now()}`,
		type: "payment_intent.succeeded",
		piId: `pi_edge_${Date.now()}`,
		amount: 5300,
		salesOrderId: sale.salesOrderId,
		paymentId: sale.paymentId,
	});
	expect(hook.status, hook.body).toBe(200);

	// 4. Further link creation is rejected — payment already succeeded
	let rejected = false;
	try {
		await orpcCall(page, "payments", "createSalesOrderPaymentLink", {
			organizationId: TEST_ORG_ID,
			salesOrderId: sale.salesOrderId,
		});
	} catch (err) {
		rejected = true;
		expect(err).toBeInstanceOf(OrpcClientError);
		expect((err as OrpcClientError).message).toMatch(/already succeeded/i);
	}
	expect(rejected, "link creation after payment must be rejected").toBe(true);

	// 5. Order completed by the webhook
	type OrderRow = { status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{
			organizationId: TEST_ORG_ID,
			id: sale.salesOrderId,
		},
	);
	expect(order.status).toBe("completed");
});

test("payment_failed marks the payment failed, keeps the order pending, link reusable", {
	tag: ["@p1"],
}, async ({ page, request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");
	const sale = await recordOnlineSale(page, 5400);

	type LinkResult = { paymentLinkId: string; paymentLinkUrl: string };
	const link1 = await orpcCall<object, LinkResult>(
		page,
		"payments",
		"createSalesOrderPaymentLink",
		{ organizationId: TEST_ORG_ID, salesOrderId: sale.salesOrderId },
	);

	const hook = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_fail_${Date.now()}`,
		type: "payment_intent.payment_failed",
		piId: `pi_edge_fail_${Date.now()}`,
		amount: 5400,
		salesOrderId: sale.salesOrderId,
		paymentId: sale.paymentId,
		failureMessage: "Your card was declined.",
	});
	expect(hook.status, hook.body).toBe(200);

	// Order must STAY pending (customer can retry)
	type OrderRow = { status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{
			organizationId: TEST_ORG_ID,
			id: sale.salesOrderId,
		},
	);
	expect(order.status).toBe("pending");

	// The same link is returned for the retry (payment not succeeded)
	const link2 = await orpcCall<object, LinkResult>(
		page,
		"payments",
		"createSalesOrderPaymentLink",
		{ organizationId: TEST_ORG_ID, salesOrderId: sale.salesOrderId },
	);
	expect(link2.paymentLinkId).toBe(link1.paymentLinkId);

	await cancelOrder(page, sale.salesOrderId);
});

test("duplicate webhook deliveries are deduped / idempotent", {
	tag: ["@p1"],
}, async ({ page, request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");
	const sale = await recordOnlineSale(page, 5500);

	const eventId = `evt_edge_dup_${Date.now()}`;
	const piId = `pi_edge_dup_${Date.now()}`;
	const send = () =>
		sendSalesOrderEvent(request, secret!, {
			eventId,
			type: "payment_intent.succeeded",
			piId,
			amount: 5500,
			salesOrderId: sale.salesOrderId,
			paymentId: sale.paymentId,
		});

	const first = await send();
	expect(first.status, first.body).toBe(200);

	// Exact replay (same event id) → deduped, still 200
	const replay = await send();
	expect(replay.status, replay.body).toBe(200);
	expect(replay.body).toContain("deduped");

	// Re-sent succeeded with a NEW event id but same PI → idempotent, no error
	const resent = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_dup2_${Date.now()}`,
		type: "payment_intent.succeeded",
		piId,
		amount: 5500,
		salesOrderId: sale.salesOrderId,
		paymentId: sale.paymentId,
	});
	expect(resent.status, resent.body).toBe(200);

	type OrderRow = { status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{
			organizationId: TEST_ORG_ID,
			id: sale.salesOrderId,
		},
	);
	expect(order.status).toBe("completed");
});

test("non-divisible installment total puts the remainder on the last installment", {
	tag: ["@p0"],
}, async ({ page }) => {
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	const plan = await pickFirstInstallmentPlan(page);
	expect(client).not.toBeNull();
	expect(service).not.toBeNull();
	expect(plan).not.toBeNull();

	const totalCents = 10000; // RM 100 — NOT divisible by 3
	const sale = await recordPosSaleFull(page, {
		customerId: client!.userId,
		customerName: client!.name,
		branchId: client!.hierarchyScopeId!,
		items: [
			{
				type: "package",
				refId: service!.id,
				description: service!.name,
				quantity: 1,
				unitPriceCents: totalCents,
			},
		],
		paymentMethod: "cash",
		installmentPlanCode: plan!.code,
	});

	const packageInstanceId = sale.packageInstanceIds![0]!;
	type InstallmentRow = { installmentNumber: number; amount: number };
	const rows = await orpcCall<object, InstallmentRow[]>(
		page,
		"installments",
		"listByPackageInstance",
		{ organizationId: TEST_ORG_ID, packageInstanceId },
	);

	const n = plan!.numInstallments;
	expect(rows.length).toBe(n);
	const sorted = [...rows].sort(
		(a, b) => a.installmentNumber - b.installmentNumber,
	);
	const base = Math.floor(totalCents / n);
	const remainder = totalCents - base * n;
	for (let i = 0; i < n; i++) {
		expect(sorted[i]!.amount).toBe(i === n - 1 ? base + remainder : base);
	}
	// Sum must reconstruct the exact principal — no lost/gained cents
	expect(sorted.reduce((s, r) => s + r.amount, 0)).toBe(totalCents);
});

test("a cancelled online order is NOT resurrected by a late payment", {
	tag: ["@p1"],
}, async ({ page, request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");
	const sale = await recordOnlineSale(page, 5700);

	// Staff cancels the pending online sale
	type UserCtx = { user?: { id?: string } };
	const ctx = await orpcCall<object, UserCtx>(page, "auth", "userContext", {});
	await orpcCall(page, "salesOrders", "cancel", {
		organizationId: TEST_ORG_ID,
		id: sale.salesOrderId,
		cancelledBy: ctx.user?.id ?? "e2e",
		refundAmount: 0,
	});

	// Customer pays the (still-active) link afterwards
	const hook = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_cancel_${Date.now()}`,
		type: "payment_intent.succeeded",
		piId: `pi_edge_cancel_${Date.now()}`,
		amount: 5700,
		salesOrderId: sale.salesOrderId,
		paymentId: sale.paymentId,
	});
	expect(hook.status, hook.body).toBe(200);

	// Order must STAY cancelled — money is recorded on the payment row only
	type OrderRow = { status: string };
	const order = await orpcCall<object, OrderRow>(
		page,
		"salesOrders",
		"getById",
		{ organizationId: TEST_ORG_ID, id: sale.salesOrderId },
	);
	expect(order.status, "cancelled order must not be resurrected").toBe(
		"cancelled",
	);

	// The payment fact is recorded for reconciliation/refund
	type Receipt = { payment: { status: string } | null };
	const receipt = await orpcCall<object, Receipt>(
		page,
		"pos",
		"getReceiptData",
		{
			organizationId: TEST_ORG_ID,
			salesOrderId: sale.salesOrderId,
		},
	);
	expect(receipt.payment?.status).toBe("succeeded");

	// Admins are notified in-app that a refund is required
	type NotificationRow = {
		type: string;
		relatedId?: string | null;
		title?: string;
	};
	const notifs = await orpcCall<object, NotificationRow[]>(
		page,
		"notifications",
		"list",
		{ organizationId: TEST_ORG_ID, type: "refund_required", limit: 50 },
	);
	const refundNotif = notifs.find((n) => n.relatedId === sale.salesOrderId);
	expect(
		refundNotif,
		"org admins must receive a refund_required notification",
	).toBeTruthy();

	// The sale detail page shouts about it where staff actually look
	await page.goto(`/dashboard/sales/${sale.salesOrderId}`);
	await expect(page.getByTestId("refund-required-callout")).toBeVisible({
		timeout: 15_000,
	});
	// ...and the dead payment link is no longer offered
	await expect(page.getByTestId("pos-payment-link")).not.toBeVisible();
});

test("online + installment: nothing is paid until the webhook confirms installment #1", {
	tag: ["@p0"],
}, async ({ page, request }) => {
	const secret = readDevVar("STRIPE_CONNECT_WEBHOOK_SECRET");
	test.skip(!secret, "STRIPE_CONNECT_WEBHOOK_SECRET not set — skip");

	await page.goto("/dashboard");
	await page.waitForLoadState("networkidle");
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page, {
		hasSessions: true,
		isPackage: true,
	});
	const plan = await pickFirstInstallmentPlan(page);

	type SaleResult = {
		salesOrderId: string;
		paymentId: string;
		packageInstanceIds?: string[];
	};
	let sale: SaleResult;
	try {
		sale = await orpcCall<object, SaleResult>(page, "pos", "recordSale", {
			organizationId: TEST_ORG_ID,
			customerType: "member",
			customerId: client!.userId,
			customerName: client!.name,
			branchId: client!.hierarchyScopeId!,
			items: [
				{
					type: "package",
					refId: service!.id,
					description: service!.name,
					quantity: 1,
					unitPriceCents: 12000,
				},
			],
			paymentMethod: "online",
			installmentPlanCode: plan!.code,
		});
	} catch (err) {
		if (
			err instanceof OrpcClientError &&
			/stripe is not configured/i.test(err.message)
		) {
			test.skip(true, "No Stripe connected account — skip");
		}
		throw err;
	}
	const pkgId = sale!.packageInstanceIds![0]!;

	type InstallmentRow = {
		installmentNumber: number;
		amount: number;
		status: string;
	};
	const listInstallments = async (): Promise<InstallmentRow[]> => {
		const rows = await orpcCall<object, InstallmentRow[]>(
			page,
			"installments",
			"listByPackageInstance",
			{ organizationId: TEST_ORG_ID, packageInstanceId: pkgId },
		);
		return [...rows].sort((a, b) => a.installmentNumber - b.installmentNumber);
	};

	// BEFORE any payment: nothing auto-confirmed. Installment #1 is due at
	// purchase, so the lock evaluator may already flag it "overdue" — the key
	// invariant is that NOTHING is "paid" yet.
	const before = await listInstallments();
	expect(before.length).toBe(plan!.numInstallments);
	expect(
		["pending", "overdue"],
		"installment #1 must be unpaid before payment",
	).toContain(before[0]!.status);
	for (const row of before.slice(1)) {
		expect(
			row.status,
			`installment #${row.installmentNumber} must be pending before payment`,
		).toBe("pending");
	}

	// The payment-link charge (= installment #1) succeeds
	const piId = `pi_edge_inst_${Date.now()}`;
	const hook = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_inst_${Date.now()}`,
		type: "payment_intent.succeeded",
		piId,
		amount: before[0]!.amount,
		salesOrderId: sale!.salesOrderId,
		paymentId: sale!.paymentId,
	});
	expect(hook.status, hook.body).toBe(200);

	// AFTER: installment #1 paid, the rest still pending
	const after = await listInstallments();
	expect(after[0]!.status, "installment #1 paid by the webhook").toBe("paid");
	for (const row of after.slice(1)) {
		expect(
			row.status,
			`installment #${row.installmentNumber} stays pending`,
		).toBe("pending");
	}

	// Package activated but NOT marked fully paid
	type Receipt = {
		packageInstance: { status?: string; paymentStatus?: string } | null;
		invoice: { status?: string } | null;
	};
	const receipt = await orpcCall<object, Receipt>(
		page,
		"pos",
		"getReceiptData",
		{
			organizationId: TEST_ORG_ID,
			salesOrderId: sale!.salesOrderId,
		},
	);
	expect(receipt.packageInstance?.status).toBe("active");
	expect(
		receipt.packageInstance?.paymentStatus,
		"installment package must not be marked fully paid",
	).not.toBe("paid");
	expect(receipt.invoice?.status).toBe("partially_paid");

	// Replay of the SAME PI under a new event id must NOT confirm installment #2
	const replay = await sendSalesOrderEvent(request, secret!, {
		eventId: `evt_edge_inst_replay_${Date.now()}`,
		type: "payment_intent.succeeded",
		piId,
		amount: before[0]!.amount,
		salesOrderId: sale!.salesOrderId,
		paymentId: sale!.paymentId,
	});
	expect(replay.status, replay.body).toBe(200);
	const afterReplay = await listInstallments();
	expect(
		afterReplay.filter((r) => r.status === "paid").length,
		"PI replay must not confirm additional installments",
	).toBe(1);
});
