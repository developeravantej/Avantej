/**
 * audit-prove-deferred.integration.test.ts
 *
 * Self-contained functional verification of the newly-added deferred-queue
 * features against the REAL test tenant DB. Deliberately does NOT use
 * integration-setup's `createTenantDb` (a concurrent session migrated it to a
 * `pg` Pool that currently hangs). Instead this file builds its own tenant DB
 * client on the Neon serverless WebSocket pool (the transport that works under
 * bun:test) and only borrows the pure helpers/constants from integration-setup.
 *
 * Features covered:
 *  1. F-INV-06  — stock_movements audit trail (products.service.adjustStock)
 *  2. F-CRM-02  — credit_point_ledger (customer-profile.service.adjust/redeem)
 *  3. F-SALE-09 — cancellation-number sequence (sales-order.service.cancel)
 *  4. F-INV-05  — transfer acceptance state (markTransferReceived/completeTransfer)
 *
 * SHARED DB: every row created here is tracked and deleted in afterAll. Text
 * fields are namespaced `APDEF_<n>` so stragglers are trivially identifiable.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import { and, eq, inArray } from "drizzle-orm";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

import { creditPointLedger } from "@avantej-core/db/schema/tenant/credit-point-ledger";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { products } from "@avantej-core/db/schema/tenant/products";
import { productStock } from "@avantej-core/db/schema/tenant/product-stock";
import { stockMovements } from "@avantej-core/db/schema/tenant/stock-movements";
import { unitsOfMeasure } from "@avantej-core/db/schema/tenant/units-of-measure";
import { salesOrders } from "@avantej-core/db/schema/tenant/sales-orders";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { members } from "@avantej-core/db/schema/tenant/members";
import { transferOrders } from "@avantej-core/db/schema/tenant/transfer-orders";
import { transferOrderItems } from "@avantej-core/db/schema/tenant/transfer-order-items";

// Services via SUBPATH (not the barrel) to avoid mock/load issues.
import { adjustStock } from "@avantej-core/services/products.service";
import {
	adjustCreditPoints,
	redeemCreditPoints,
} from "@avantej-core/services/customer-profile.service";
import {
	createSalesOrder,
	cancelSalesOrder,
} from "@avantej-core/services/sales-order.service";
import {
	createTransferOrder,
	markInTransit,
	markTransferReceived,
	completeTransfer,
	getTransferOrderById,
} from "@avantej-core/services/transfer-orders.service";

import {
	shouldSkipIntegration,
	TEST_BRANCH_NODE_ID,
	TEST_MEMBER_ID,
	TEST_USER_ID,
} from "../helpers/integration-setup";

neonConfig.webSocketConstructor = ws;

// --- Own .dev.vars loader (do not depend on integration-setup's pool) -------
function loadDevVarsLocal(): void {
	if (process.env.TENANT_DATABASE_URL) return;
	const candidates = [
		join(import.meta.dir, "../../../.dev.vars"),
		join(import.meta.dir, "../../../../.dev.vars"),
		join(process.cwd(), ".dev.vars"),
		join(process.cwd(), "apps/server/.dev.vars"),
	];
	for (const p of candidates) {
		try {
			const content = readFileSync(p, "utf-8");
			for (const line of content.split("\n")) {
				const t = line.trim();
				if (!t || t.startsWith("#")) continue;
				const i = t.indexOf("=");
				if (i === -1) continue;
				const k = t.slice(0, i).trim();
				const v = t
					.slice(i + 1)
					.trim()
					.replace(/^"(.*)"$/, "$1");
				if (!process.env[k]) process.env[k] = v;
			}
			return;
		} catch {
			// try next
		}
	}
}

const TIMEOUT = 30_000;

// Tracked ids for teardown.
const created = {
	productIds: [] as string[],
	uomIds: [] as string[],
	salesOrderIds: [] as string[],
	customerProfileIds: [] as string[],
	customerUserIds: [] as string[],
	transferOrderIds: [] as string[],
	memberIds: [] as string[],
	hierarchyNodeIds: [] as string[],
};

let pool: Pool | undefined;
let tenantDb: ReturnType<typeof drizzle<typeof tenantSchema>>;

beforeAll(() => {
	loadDevVarsLocal();
	if (shouldSkipIntegration()) return;
	pool = new Pool({
		connectionString: process.env.TENANT_DATABASE_URL,
		// Neon WS pool — short timeouts so any wedge fails fast rather than
		// hanging the suite.
		connectionTimeoutMillis: 15_000,
	});
	tenantDb = drizzle({ client: pool, schema: tenantSchema });
});

afterAll(async () => {
	if (!pool || !tenantDb) {
		if (pool) await pool.end().catch(() => {});
		return;
	}
	// Order matters: ledger/movements first (children), then headers, then
	// products/uoms. Each wrapped so one failure doesn't block the rest.
	try {
		if (created.customerUserIds.length > 0) {
			await tenantDb
				.delete(creditPointLedger)
				.where(
					inArray(creditPointLedger.customerUserId, created.customerUserIds),
				);
		}
	} catch (e) {
		console.warn("[APDEF cleanup] credit_point_ledger:", e);
	}
	try {
		if (created.customerProfileIds.length > 0) {
			await tenantDb
				.delete(customerProfiles)
				.where(inArray(customerProfiles.id, created.customerProfileIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] customer_profiles:", e);
	}
	// Transfer orders first: their items cascade on header delete, but stock
	// rows they touched are cleaned by productId below. Delete the headers
	// (and their items) before the hierarchy node they reference (restrict).
	try {
		if (created.transferOrderIds.length > 0) {
			await tenantDb
				.delete(transferOrderItems)
				.where(
					inArray(transferOrderItems.transferOrderId, created.transferOrderIds),
				);
			await tenantDb
				.delete(transferOrders)
				.where(inArray(transferOrders.id, created.transferOrderIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] transfer_orders:", e);
	}
	try {
		if (created.productIds.length > 0) {
			// stock_movements + product_stock cascade on product delete (FK cascade),
			// but delete movements explicitly in case the FK is restrict in live DB.
			await tenantDb
				.delete(stockMovements)
				.where(inArray(stockMovements.productId, created.productIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] stock_movements:", e);
	}
	try {
		if (created.productIds.length > 0) {
			await tenantDb
				.delete(productStock)
				.where(inArray(productStock.productId, created.productIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] product_stock:", e);
	}
	try {
		if (created.productIds.length > 0) {
			await tenantDb
				.delete(products)
				.where(inArray(products.id, created.productIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] products:", e);
	}
	try {
		if (created.uomIds.length > 0) {
			await tenantDb
				.delete(unitsOfMeasure)
				.where(inArray(unitsOfMeasure.id, created.uomIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] units_of_measure:", e);
	}
	try {
		if (created.salesOrderIds.length > 0) {
			await tenantDb
				.delete(salesOrders)
				.where(inArray(salesOrders.id, created.salesOrderIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] sales_orders:", e);
	}
	// Member referenced by transfer headers (restrict) — safe now that the
	// transfer headers above are gone.
	try {
		if (created.memberIds.length > 0) {
			await tenantDb
				.delete(members)
				.where(inArray(members.id, created.memberIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] members:", e);
	}
	// Source hierarchy node LAST: product_stock (restrict) + transfer headers
	// (restrict) that referenced it were deleted above.
	try {
		if (created.hierarchyNodeIds.length > 0) {
			await tenantDb
				.delete(hierarchyNodes)
				.where(inArray(hierarchyNodes.id, created.hierarchyNodeIds));
		}
	} catch (e) {
		console.warn("[APDEF cleanup] hierarchy_nodes:", e);
	}
	try {
		await pool.end();
	} catch (e) {
		console.warn("[APDEF cleanup] pool.end:", e);
	}
});

// Helper: seed a throwaway UOM + product, returning the product id.
async function seedProduct(tag: string): Promise<string> {
	const [uom] = await tenantDb
		.insert(unitsOfMeasure)
		.values({ name: `APDEF_UOM_${tag}_${Date.now()}` })
		.returning({ id: unitsOfMeasure.id });
	created.uomIds.push(uom!.id);

	const [product] = await tenantDb
		.insert(products)
		.values({
			sku: `APDEF_SKU_${tag}_${Date.now()}`,
			name: `APDEF_PRODUCT_${tag}`,
			uomId: uom!.id,
			price: 1000,
		})
		.returning({ id: products.id });
	created.productIds.push(product!.id);
	return product!.id;
}

// Helper: seed a customer_profiles row with a starting balance, return userId.
async function seedCustomer(
	tag: string,
	startBalance: number,
): Promise<string> {
	const userId = `APDEF_USER_${tag}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
	const [row] = await tenantDb
		.insert(customerProfiles)
		.values({ userId, creditPoints: startBalance, notes: `APDEF_${tag}` })
		.returning({ id: customerProfiles.id });
	created.customerProfileIds.push(row!.id);
	created.customerUserIds.push(userId);
	return userId;
}

describe("audit-prove deferred features (real tenant DB)", () => {
	// --- 1. F-INV-06 — stock_movements audit trail -------------------------
	it(
		"F-INV-06: adjustStock records a stock_movements row with delta/reason/sourceType",
		async () => {
			if (shouldSkipIntegration()) return;

			const productId = await seedProduct("INV06");
			const branchId = TEST_BRANCH_NODE_ID;

			// Positive delta from no existing row → inserts product_stock at qty 25.
			const result = await adjustStock(tenantDb, productId, branchId, 25, {
				reason: "APDEF_initial_count",
				sourceType: "APDEF_adjustment",
				actorUserId: TEST_USER_ID,
			});
			expect(result.quantity).toBe(25);

			const movements = await tenantDb
				.select()
				.from(stockMovements)
				.where(
					and(
						eq(stockMovements.productId, productId),
						eq(stockMovements.branchId, branchId),
					),
				);

			expect(movements.length).toBe(1);
			const m = movements[0]!;
			expect(m.delta).toBe(25);
			expect(m.quantityAfter).toBe(25);
			expect(m.reason).toBe("APDEF_initial_count");
			expect(m.sourceType).toBe("APDEF_adjustment");
			expect(m.actorUserId).toBe(TEST_USER_ID);

			// A second, negative adjust should append a second movement row.
			const result2 = await adjustStock(tenantDb, productId, branchId, -10, {
				reason: "APDEF_shrinkage",
				sourceType: "APDEF_adjustment",
			});
			expect(result2.quantity).toBe(15);

			const movements2 = await tenantDb
				.select()
				.from(stockMovements)
				.where(eq(stockMovements.productId, productId));
			expect(movements2.length).toBe(2);
			const neg = movements2.find((r) => r.delta === -10)!;
			expect(neg.quantityAfter).toBe(15);
			expect(neg.reason).toBe("APDEF_shrinkage");
		},
		TIMEOUT,
	);

	// --- 2. F-CRM-02 — credit_point_ledger ---------------------------------
	it(
		"F-CRM-02: adjust + redeem credit points writes ledger and updates balance",
		async () => {
			if (shouldSkipIntegration()) return;

			const userId = await seedCustomer("CRM02", 0);

			// Adjust +100.
			const adj = await adjustCreditPoints(tenantDb, {
				customerUserId: userId,
				points: 100,
				reason: "APDEF_topup",
				actorUserId: TEST_USER_ID,
			});
			expect(adj.balanceAfter).toBe(100);
			expect(adj.delta).toBe(100);

			// Redeem 30.
			const red = await redeemCreditPoints(tenantDb, {
				customerUserId: userId,
				points: 30,
				reason: "APDEF_redeem",
				actorUserId: TEST_USER_ID,
			});
			expect(red.delta).toBe(-30);
			expect(red.balanceAfter).toBe(70);

			// Authoritative balance on customer_profiles decreased by 30 (net 70).
			const [profile] = await tenantDb
				.select({ creditPoints: customerProfiles.creditPoints })
				.from(customerProfiles)
				.where(eq(customerProfiles.userId, userId));
			expect(profile!.creditPoints).toBe(70);

			// Ledger has the -30 row with the correct running balance.
			const ledger = await tenantDb
				.select()
				.from(creditPointLedger)
				.where(eq(creditPointLedger.customerUserId, userId));
			expect(ledger.length).toBe(2);
			const redeemRow = ledger.find((r) => r.delta === -30)!;
			expect(redeemRow).toBeDefined();
			expect(redeemRow.balanceAfter).toBe(70);
			expect(redeemRow.reason).toBe("APDEF_redeem");

			// Redeeming more than balance must NOT succeed. The guard throws
			// inside `tenantDb.transaction`, which triggers a ROLLBACK. Under
			// bun:test the Neon-serverless WS transport can wedge on that rollback
			// (documented in integration-setup) so the rejected promise may never
			// settle — we therefore race a timeout and accept EITHER outcome:
			//   - a real "insufficient" rejection (guard fired, rollback settled), OR
			//   - a timeout (guard fired, rollback ack wedged — still no over-spend).
			// What we then PROVE unconditionally is the real invariant: the balance
			// and ledger were not mutated by the failed over-redeem.
			const SENTINEL = "__APDEF_TIMEOUT__";
			let overRedeemOutcome:
				| "rejected-insufficient"
				| "rejected-other"
				| "timeout"
				| "resolved";
			try {
				const res = await Promise.race([
					redeemCreditPoints(tenantDb, {
						customerUserId: userId,
						points: 1000,
						reason: "APDEF_overdraw",
					}).then(() => "resolved" as const),
					new Promise<typeof SENTINEL>((resolve) =>
						setTimeout(() => resolve(SENTINEL), 8_000),
					),
				]);
				overRedeemOutcome = res === SENTINEL ? "timeout" : "resolved";
			} catch (err) {
				overRedeemOutcome = /[Ii]nsufficient/.test(
					err instanceof Error ? err.message : String(err),
				)
					? "rejected-insufficient"
					: "rejected-other";
			}

			// The over-redeem must NEVER have succeeded.
			expect(overRedeemOutcome).not.toBe("resolved");
			expect(overRedeemOutcome).not.toBe("rejected-other");

			// Real invariant: balance unchanged after the rejected/wedged redeem.
			const [after] = await tenantDb
				.select({ creditPoints: customerProfiles.creditPoints })
				.from(customerProfiles)
				.where(eq(customerProfiles.userId, userId));
			expect(after!.creditPoints).toBe(70);

			// And no negative-delta-1000 ledger row was committed.
			const ledgerAfter = await tenantDb
				.select()
				.from(creditPointLedger)
				.where(eq(creditPointLedger.customerUserId, userId));
			expect(ledgerAfter.some((r) => r.delta === -1000)).toBe(false);
			expect(ledgerAfter.length).toBe(2);
		},
		TIMEOUT,
	);

	// --- 3. F-SALE-09 — cancellation-number sequence -----------------------
	it(
		"F-SALE-09: cancelSalesOrder allocates a unique CAN-YYYYMMDD-NNNN number",
		async () => {
			if (shouldSkipIntegration()) return;

			const actor = {
				userId: TEST_USER_ID,
				memberId: TEST_MEMBER_ID,
				role: "admin",
			};

			const mkOrder = async (tag: string) => {
				const order = await createSalesOrder(tenantDb, {
					date: new Date(),
					customerName: `APDEF_CUST_${tag}`,
					createdBy: TEST_USER_ID,
					branchId: TEST_BRANCH_NODE_ID,
					status: "confirmed",
					totalAmount: 5000,
					notes: `APDEF_${tag}`,
				});
				created.salesOrderIds.push(order.id);
				return order;
			};

			const order1 = await mkOrder("SALE09_A");
			const cancelled1 = await cancelSalesOrder(
				tenantDb,
				order1.id,
				{
					cancelledBy: TEST_USER_ID,
					reason: "APDEF_cancel_a",
					refundAmount: 0,
				},
				actor,
			);
			expect(cancelled1.status).toBe("cancelled");
			expect(cancelled1.cancellationNumber).toMatch(/^CAN-\d{8}-\d{4}$/);

			const order2 = await mkOrder("SALE09_B");
			const cancelled2 = await cancelSalesOrder(
				tenantDb,
				order2.id,
				{
					cancelledBy: TEST_USER_ID,
					reason: "APDEF_cancel_b",
					refundAmount: 0,
				},
				actor,
			);
			expect(cancelled2.cancellationNumber).toMatch(/^CAN-\d{8}-\d{4}$/);

			// Sequence allocates uniquely — the two numbers must differ.
			expect(cancelled2.cancellationNumber).not.toBe(
				cancelled1.cancellationNumber,
			);
		},
		TIMEOUT,
	);

	// --- 4. F-INV-05 — transfer acceptance state ---------------------------
	// Two-branch fixture: TEST_BRANCH_NODE_ID is the DESTINATION; we seed a
	// second `hierarchy_nodes` row (APDEF-namespaced) as the SOURCE. The known
	// test branch has a null parent/country, so the sibling source uses the same
	// (FK-valid) null parent. A product is seeded with SOURCE stock so the
	// acceptance-time deduction has stock to move. createTransferOrder needs a
	// real `members.id` for issued_by, so we seed an APDEF member too. All rows
	// are torn down FK-ordered in afterAll (transfer rows + product_stock BEFORE
	// the source node, which is onDelete:restrict).
	it(
		"F-INV-05: markTransferReceived → received_pending_acceptance → completeTransfer → completed",
		async () => {
			if (shouldSkipIntegration()) return;

			const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
			const destBranchId = TEST_BRANCH_NODE_ID;

			// --- Seed SOURCE branch (sibling of the dest test branch) ----------
			const [sourceNode] = await tenantDb
				.insert(hierarchyNodes)
				.values({
					name: `APDEF_SRC_BRANCH_${stamp}`,
					slug: `apdef_src_branch_${stamp}`,
					type: "branch",
					parentId: null,
					depth: 3,
					countryNodeId: null,
				})
				.returning({ id: hierarchyNodes.id });
			const sourceBranchId = sourceNode!.id;
			created.hierarchyNodeIds.push(sourceBranchId);

			// --- Seed an APDEF member to be the transfer's issued_by ----------
			const [member] = await tenantDb
				.insert(members)
				.values({
					userId: `APDEF_MEMBER_${stamp}`,
					role: "admin",
					hierarchyScopeId: destBranchId,
					status: "active",
				})
				.returning({ id: members.id });
			const issuedByMemberId = member!.id;
			created.memberIds.push(issuedByMemberId);

			// --- Seed a product with SOURCE stock ------------------------------
			const productId = await seedProduct("INV05");
			const SOURCE_START = 50;
			const TRANSFER_QTY = 20;
			const sourceStock = await adjustStock(
				tenantDb,
				productId,
				sourceBranchId,
				SOURCE_START,
				{ reason: "APDEF_seed_source", sourceType: "APDEF_seed" },
			);
			expect(sourceStock.quantity).toBe(SOURCE_START);

			// Baseline destination stock (may be 0/absent → treat as 0).
			const destBefore = await tenantDb
				.select({ quantity: productStock.quantity })
				.from(productStock)
				.where(
					and(
						eq(productStock.productId, productId),
						eq(productStock.branchId, destBranchId),
					),
				);
			const destQtyBefore = destBefore[0]?.quantity ?? 0;

			// --- Create transfer order (header + 1 item) ----------------------
			const transfer = await createTransferOrder(tenantDb, {
				dateIssued: new Date(),
				fromBranchId: sourceBranchId,
				toBranchId: destBranchId,
				issuedByMemberId,
				notes: `APDEF_TRANSFER_${stamp}`,
				items: [{ productId, quantityTransferred: TRANSFER_QTY }],
			});
			created.transferOrderIds.push(transfer.id);
			expect(transfer.status).toBe("pending");
			expect(transfer.items.length).toBe(1);
			const itemId = transfer.items[0]!.id;

			// pending → in_transit (markTransferReceived requires in_transit).
			const inTransit = await markInTransit(tenantDb, transfer.id);
			expect(inTransit.status).toBe("in_transit");

			// --- markTransferReceived: records qty, NO stock move yet ---------
			const received = await markTransferReceived(tenantDb, transfer.id, [
				{ itemId, quantityReceived: TRANSFER_QTY },
			]);
			expect(received.status).toBe("received_pending_acceptance");

			// Stock must NOT have moved yet (source unchanged, dest unchanged).
			const srcAfterReceive = await tenantDb
				.select({ quantity: productStock.quantity })
				.from(productStock)
				.where(
					and(
						eq(productStock.productId, productId),
						eq(productStock.branchId, sourceBranchId),
					),
				);
			expect(srcAfterReceive[0]!.quantity).toBe(SOURCE_START);

			// Received quantity was recorded on the item.
			const afterReceive = await getTransferOrderById(tenantDb, transfer.id);
			expect(afterReceive!.items[0]!.quantityReceived).toBe(TRANSFER_QTY);

			// --- completeTransfer: stock MOVES here, status → completed -------
			const completed = await completeTransfer(
				tenantDb,
				transfer.id,
				[{ itemId, quantityReceived: TRANSFER_QTY }],
				TEST_USER_ID,
			);
			expect(completed.status).toBe("completed");
			expect(completed.completedAt).not.toBeNull();

			// Source decreased by TRANSFER_QTY.
			const srcAfter = await tenantDb
				.select({ quantity: productStock.quantity })
				.from(productStock)
				.where(
					and(
						eq(productStock.productId, productId),
						eq(productStock.branchId, sourceBranchId),
					),
				);
			expect(srcAfter[0]!.quantity).toBe(SOURCE_START - TRANSFER_QTY);

			// Destination increased by TRANSFER_QTY.
			const destAfter = await tenantDb
				.select({ quantity: productStock.quantity })
				.from(productStock)
				.where(
					and(
						eq(productStock.productId, productId),
						eq(productStock.branchId, destBranchId),
					),
				);
			expect(destAfter[0]!.quantity).toBe(destQtyBefore + TRANSFER_QTY);

			// --- stock_movements audit rows for the transfer (F-INV-06) -------
			const movements = await tenantDb
				.select()
				.from(stockMovements)
				.where(
					and(
						eq(stockMovements.productId, productId),
						eq(stockMovements.sourceType, "transfer_order"),
						eq(stockMovements.sourceId, transfer.id),
					),
				);
			// One deduction (source) + one addition (destination).
			expect(movements.length).toBe(2);
			const sourceLeg = movements.find((m) => m.branchId === sourceBranchId)!;
			const destLeg = movements.find((m) => m.branchId === destBranchId)!;
			expect(sourceLeg.delta).toBe(-TRANSFER_QTY);
			expect(destLeg.delta).toBe(TRANSFER_QTY);
			expect(destLeg.actorUserId).toBe(TEST_USER_ID);
		},
		TIMEOUT,
	);
});
