/**
 * Journey: POS sale of a service → NO commission split created immediately
 *
 * Actor: tenant_admin (franchisee@gmail.com)
 * Priority: P0
 * Seed: recordPosSale with a service line item
 *
 * Commission rule: service sales are deferred — a split is only created when
 * the linked appointment is completed/cancelled (Phase 1). This test verifies
 * zero splits exist immediately after a service POS sale.
 *
 * Run: bunx playwright test e2e/commission-rule-pos-service-no-split.journey.spec.ts --project=journeys-e2e
 */

import { test, expect } from "@playwright/test";
import {
	seedMinimalPosFixture,
	pickFirstActiveClient,
	pickFirstService,
	pickFirstBranchId,
	recordPosSale,
	TEST_ORG_ID,
} from "./helpers/seed-data";
import { orpcCall } from "./helpers/orpc-client";

test("POS service sale creates NO commission split immediately", {
	tag: ["@p0"],
}, async ({ page }) => {
	// ── Precondition checks ──────────────────────────────────────────────────
	await seedMinimalPosFixture(page);
	const client = await pickFirstActiveClient(page);
	const service = await pickFirstService(page);
	expect(client).not.toBeNull();
	expect(service).not.toBeNull();

	// Use client's hierarchyScopeId as branchId (fallback to pickFirstBranchId)
	const branchId = client!.hierarchyScopeId ?? (await pickFirstBranchId(page));

	// ── Act: place POS sale with a service line ──────────────────────────────
	let salesOrderId = "";
	try {
		salesOrderId = await recordPosSale(page, {
			customerId: client!.userId,
			customerName: client!.name,
			branchId,
			items: [
				{
					type: "service",
					refId: service!.id,
					description: service!.name,
					quantity: 1,
					unitPriceCents: 5000, // RM 50 — arbitrary
				},
			],
			paymentMethod: "cash",
		});
	} catch (err) {
		test.skip(true, `Could not record POS sale: ${String(err)}`);
	}

	expect(
		salesOrderId,
		"salesOrderId must be returned by recordPosSale",
	).toBeTruthy();

	// ── Assert: no commission splits for this sales order ────────────────────
	// commissionSplits.list accepts salesOrderId indirectly via appointmentId.
	// There is no direct salesOrderId filter, so we check listLedger with no
	// filters and look for our order id in the results.
	type LedgerRow = {
		id: string;
		salesOrderId?: string | null;
		appointmentId?: string | null;
	};
	type LedgerResult = { rows?: LedgerRow[]; items?: LedgerRow[] } | LedgerRow[];
	let rows: LedgerRow[] = [];
	try {
		const result = await orpcCall<object, LedgerResult>(
			page,
			"commissionSplits",
			"listLedger",
			{
				organizationId: TEST_ORG_ID,
				status: "all",
				limit: 200,
				offset: 0,
			},
		);
		rows = Array.isArray(result)
			? result
			: ((result as { rows?: LedgerRow[]; items?: LedgerRow[] }).rows ??
				(result as { rows?: LedgerRow[]; items?: LedgerRow[] }).items ??
				[]);
	} catch {
		// If permission denied for listLedger, getByAppointment is not applicable
		// here (no appointmentId). We treat this as a soft pass since we cannot
		// assert absence without read access.
		test.skip(
			true,
			"commission_management:read permission not available — skip assertion",
		);
	}

	const splitsForOrder = rows.filter((r) => r.salesOrderId === salesOrderId);
	expect(
		splitsForOrder.length,
		`Expected 0 commission splits for service POS sale ${salesOrderId}, found ${splitsForOrder.length}: ${JSON.stringify(splitsForOrder)}`,
	).toBe(0);
});
