#!/usr/bin/env bun
import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { Pool } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

const cp = getControlPanelDb();
const org = await cp.query.organizations.findFirst({ where: eq(organizations.slug, "test-fitness-franchise") });
const pool = new Pool({ connectionString: decrypt(org!.connectionString as string) });
const ins = (targets: string, type: string) =>
	`INSERT INTO commission_splits (${targets ? targets + ", " : ""}staff_id, split_percentage, calculated_amount, notes, status, split_type, manual_note, earned_at, created_by_user_id) VALUES (${targets ? "'9c6db4bd-4ed2-4121-af64-4cec3ed2a92d', " : ""}'probe', 0, 1500, 'n', 'pending', '${type}', 'n', now(), 'u')`;

async function run(label: string, drop: boolean, targets: string, type: string) {
	const c = await pool.connect();
	try {
		await c.query("BEGIN");
		if (drop) await c.query(`ALTER TABLE commission_splits DROP CONSTRAINT IF EXISTS commission_splits_must_target_one`);
		await c.query(ins(targets, type));
		console.log("[" + label + "] OK (inserted)");
	} catch (e) {
		console.log("[" + label + "] BLOCKED:", (e as Error).message.slice(0, 100));
	} finally {
		try { await c.query("ROLLBACK"); } catch {}
		c.release();
	}
}

await run("before-drop: no-target manual", false, "", "manual");
await run("after-drop: no-target manual (want OK)", true, "", "manual");
await run("after-drop: 0-target AUTOMATIC (source_check should BLOCK)", true, "", "automatic");
await run("after-drop: 1-target manual (want OK)", true, "appointment_id", "manual");
await pool.end();
process.exit(0);
