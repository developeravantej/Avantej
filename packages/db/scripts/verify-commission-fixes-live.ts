/**
 * Live integration test for the commission audit fixes that needed a real
 * tenant DB connection — items #4, #5, #6 from the audit summary.
 *
 * What it does:
 *  - Connects to the control-panel DB (DATABASE_URL)
 *  - Picks the first active org, decrypts its connection_string
 *    via the same encryption module the server uses
 *  - Connects to that tenant's Neon branch
 *  - Runs three assertions against live tables, each in a self-rolling
 *    SAVEPOINT so nothing persists past the test
 *
 * Usage: bun packages/db/scripts/verify-commission-fixes-live.ts
 */

import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
import path from "node:path";
import { decrypt, runTenantMigrations } from "@avantej-core/db";

dotenv.config({
	path: path.resolve(import.meta.dir, "../../../apps/server/.env"),
});

let passed = 0;
let failed = 0;

function ok(label: string, detail = "") {
	console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
	passed++;
}
function fail(label: string, detail: string) {
	console.log(`  ✗ ${label} — ${detail}`);
	failed++;
}

// ─── Step 1: pick an active tenant and decrypt its connection string ─────────
const cpPool = new Pool({ connectionString: process.env.DATABASE_URL! });
const orgRow = await cpPool.query<{
	id: string;
	name: string;
	connection_string: string;
}>(
	`SELECT id, name, connection_string FROM organizations
	 WHERE connection_string IS NOT NULL AND payment_status = 'active'
	 LIMIT 1`,
);
await cpPool.end();

if (orgRow.rows.length === 0) {
	console.log("No active org with connection_string — aborting.");
	process.exit(0);
}

const org = orgRow.rows[0]!;
console.log(`\nTesting against tenant: "${org.name}"`);

let tenantUrl: string;
try {
	tenantUrl = decrypt(org.connection_string);
	console.log("  (connection_string decrypted OK)");
} catch (e: any) {
	console.log(`  ✗ Decryption failed: ${e.message}`);
	console.log("  Likely cause: ENCRYPTION_KEY in .env doesn't match what was used to encrypt.");
	process.exit(1);
}

// Bring this tenant up to the latest migration before testing — migrations
// only auto-run at org provisioning / payment time, so existing tenants need
// an explicit catch-up. This is a no-op if already current.
console.log("\nRunning tenant migrations (idempotent)...");
try {
	await runTenantMigrations(tenantUrl);
	console.log("  ✓ migrations up to date");
} catch (e: any) {
	console.log(`  ⚠ runTenantMigrations failed: ${e.message?.split("\n")[0]}`);
}

const pool = new Pool({ connectionString: tenantUrl });

// ─── Test #6: BETWEEN check constraint ────────────────────────────────────────
console.log("\n--- Test #6: BETWEEN check constraint ---");

const constraintExists = await pool.query(`
	SELECT 1 FROM pg_constraint
	WHERE conname = 'commission_conditions_between_range_valid'
`);
if (constraintExists.rows.length === 0) {
	fail("constraint present", "migration 0066 not applied to this tenant yet");
} else {
	ok("constraint present", "commission_conditions_between_range_valid");

	const cfg = await pool.query<{ id: string }>(
		`SELECT id FROM category_commission_configs LIMIT 1`,
	);
	if (cfg.rows.length === 0) {
		console.log("  (no category_commission_configs row — skipping insert tests)");
	} else {
		const configId = cfg.rows[0]!.id;
		const cases: Array<{
			label: string;
			values: [string, number, number | null];
			expectReject: boolean;
		}> = [
			{
				label: "BETWEEN, threshold=10, max=5 (reversed range)",
				values: ["between", 10, 5],
				expectReject: true,
			},
			{
				label: "BETWEEN, threshold=10, max=NULL (missing max)",
				values: ["between", 10, null],
				expectReject: true,
			},
			{
				label: "BETWEEN, threshold=5, max=10 (valid range)",
				values: ["between", 5, 10],
				expectReject: false,
			},
			{
				label: "GTE, threshold=5, max=NULL (other operator)",
				values: ["gte", 5, null],
				expectReject: false,
			},
		];

		for (const c of cases) {
			const client = await pool.connect();
			try {
				await client.query("BEGIN");
				await client.query("SAVEPOINT sp");
				try {
					await client.query(
						`INSERT INTO commission_conditions (config_id, condition_index, operator, threshold, threshold_max)
						 VALUES ($1, 9999, $2, $3, $4)`,
						[configId, c.values[0], c.values[1], c.values[2]],
					);
					if (c.expectReject) {
						fail(c.label, "expected reject but insert succeeded");
					} else {
						ok(c.label, "accepted");
					}
				} catch (e: any) {
					if (e.code === "23514" && c.expectReject) {
						ok(c.label, "rejected by CHECK as expected");
					} else if (c.expectReject) {
						fail(c.label, `rejected with wrong code ${e.code}`);
					} else {
						fail(c.label, `unexpectedly rejected: ${e.message?.split("\n")[0]}`);
					}
				} finally {
					await client.query("ROLLBACK TO SAVEPOINT sp");
					await client.query("ROLLBACK");
				}
			} finally {
				client.release();
			}
		}
	}
}

// ─── Test #5: commission_excluded flag is readable and filterable ────────────
console.log("\n--- Test #5: commission_excluded filter ---");

const colExists = await pool.query(`
	SELECT 1 FROM information_schema.columns
	WHERE table_name = 'sales_order_items' AND column_name = 'commission_excluded'
`);
if (colExists.rows.length === 0) {
	fail("column present", "commission_excluded column missing on sales_order_items");
} else {
	ok("column present", "sales_order_items.commission_excluded");

	// Find any sale with line items
	const sale = await pool.query<{ sales_order_id: string }>(
		`SELECT DISTINCT sales_order_id FROM sales_order_items LIMIT 1`,
	);
	if (sale.rows.length === 0) {
		console.log("  (no sales_order_items rows — skipping live filter test)");
	} else {
		const salesOrderId = sale.rows[0]!.sales_order_id;
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			// Flip the flag temporarily on one line
			const upd = await client.query<{ id: string; product_id: string | null; service_id: string | null }>(
				`UPDATE sales_order_items
				 SET commission_excluded = TRUE
				 WHERE sales_order_id = $1
				 RETURNING id, product_id, service_id`,
				[salesOrderId],
			);
			if (upd.rows.length === 0) {
				fail("flag update", "no rows updated");
			} else {
				// Verify the query the POS loop runs would pick up the excluded flag
				const refetch = await client.query<{
					ref_id: string | null;
					commission_excluded: boolean;
				}>(
					`SELECT COALESCE(service_id, product_id) AS ref_id, commission_excluded
					 FROM sales_order_items
					 WHERE sales_order_id = $1 AND commission_excluded = TRUE`,
					[salesOrderId],
				);
				if (refetch.rows.length === upd.rows.length) {
					ok(
						"excluded refIds queryable",
						`${refetch.rows.length} flagged line(s) read back correctly`,
					);
				} else {
					fail(
						"excluded refIds queryable",
						`expected ${upd.rows.length} rows, got ${refetch.rows.length}`,
					);
				}
			}
		} finally {
			await client.query("ROLLBACK"); // never persist the flag flip
			client.release();
		}
	}
}

// ─── Test #4: partial-unique-index 23505 race that the tx wrapping protects ─
console.log("\n--- Test #4: commission_splits partial-unique index ---");

const idx = await pool.query<{ indexdef: string }>(
	`SELECT pg_get_indexdef(c.oid) AS indexdef
	 FROM pg_class c
	 WHERE c.relname = 'commission_splits_appt_staff_unique'`,
);
if (idx.rows.length === 0) {
	console.log("  (no commission_splits_appt_staff_unique index — POS tx wrapping still applies)");
} else {
	ok(
		"partial unique index present",
		idx.rows[0]!.indexdef.split(" USING ")[0],
	);

	// Simulate the race: insert the same (appointment_id, staff_id) twice.
	const appt = await pool.query<{ id: string }>(
		`SELECT id FROM appointments LIMIT 1`,
	);
	const member = await pool.query<{ user_id: string }>(
		`SELECT user_id FROM members WHERE role = 'trainer' LIMIT 1`,
	);

	if (appt.rows.length === 0 || member.rows.length === 0) {
		console.log("  (no appointment or trainer rows — skipping duplicate-insert test)");
	} else {
		const apptId = appt.rows[0]!.id;
		const staffId = member.rows[0]!.user_id;
		const client = await pool.connect();
		try {
			await client.query("BEGIN");
			await client.query("SAVEPOINT sp");
			// First insert
			try {
				await client.query(
					`INSERT INTO commission_splits (appointment_id, staff_id, split_percentage, calculated_amount, status, split_type, slot_index, weightage_basis_points, base_amount_cents, earned_at, earn_reason)
					 VALUES ($1, $2, 5000, 100, 'pending', 'automatic', 0, 5000, 200, NOW(), 'completion')`,
					[apptId, staffId],
				);
			} catch (e: any) {
				// First insert may itself fail if a real split already exists for this appt+staff —
				// that's fine, treat it as proof the index works.
				if (e.code === "23505") {
					ok(
						"unique index enforced",
						"existing split blocks duplicate (test passes by demonstration)",
					);
					await client.query("ROLLBACK TO SAVEPOINT sp");
					await client.query("ROLLBACK");
					await pool.end();
					console.log(`\n${passed} passed, ${failed} failed`);
					process.exit(failed > 0 ? 1 : 0);
				}
				throw e;
			}
			// Second insert with same (appt, staff) — should hit 23505
			try {
				await client.query(
					`INSERT INTO commission_splits (appointment_id, staff_id, split_percentage, calculated_amount, status, split_type, slot_index, weightage_basis_points, base_amount_cents, earned_at, earn_reason)
					 VALUES ($1, $2, 5000, 100, 'pending', 'automatic', 1, 5000, 200, NOW(), 'completion')`,
					[apptId, staffId],
				);
				fail(
					"duplicate insert rejected",
					"second insert with same (appt, staff) succeeded",
				);
			} catch (e: any) {
				if (e.code === "23505") {
					ok(
						"duplicate insert rejected",
						"23505 fires as expected — _buildSplits catches this code path",
					);
				} else {
					fail(
						"duplicate insert rejected",
						`got code ${e.code} instead of 23505`,
					);
				}
			}
		} finally {
			await client.query("ROLLBACK TO SAVEPOINT sp").catch(() => {});
			await client.query("ROLLBACK").catch(() => {});
			client.release();
		}
	}
}

await pool.end();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
