/**
 * Script: Clean up undecryptable (dead) tenant org rows from the control-panel DB
 *
 * Some leftover test orgs were created under a previous DB_ENCRYPTION_KEY, so their
 * `organizations.connection_string` can no longer be decrypted with the current key.
 * They are unreachable (no migrations can run against them) and only clutter
 * `migrate-all-tenants.ts --dry-run` output.
 *
 * This script deletes ONLY orgs whose connection string PROVABLY fails to decrypt.
 * It never deletes an org we can still reach. Dependent rows (FK children) are
 * resolved dynamically from information_schema and removed first, inside a
 * per-org transaction, so a failure on one org rolls back cleanly and is reported.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/cleanup-undecryptable-orgs.ts            # DRY RUN (default) — lists, deletes nothing
 *   bun run scripts/cleanup-undecryptable-orgs.ts --apply    # actually delete
 */

import { decrypt } from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { sql, eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APPLY = process.argv.slice(2).includes("--apply");

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const [key, ...valueParts] = trimmed.split("=");
			if (key && valueParts.length > 0) {
				process.env[key.trim()] = valueParts
					.join("=")
					.trim()
					.replace(/^["']|["']$/g, "");
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}
loadDevVars();

async function main() {
	const db = getControlPanelDb();

	// Resolve every control-panel table+column with a FK -> organizations.id
	const fkRows = (await db.execute(sql`
		SELECT tc.table_name AS table_name, kcu.column_name AS column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
			ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
		JOIN information_schema.constraint_column_usage ccu
			ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
		WHERE tc.constraint_type = 'FOREIGN KEY'
			AND ccu.table_name = 'organizations'
			AND ccu.column_name = 'id'
	`)) as unknown as {
		rows: Array<{ table_name: string; column_name: string }>;
	};
	const dependents = fkRows.rows ?? [];
	console.log(
		`FK dependents of organizations.id: ${dependents.length} (${dependents
			.map((d) => `${d.table_name}.${d.column_name}`)
			.join(", ")})`,
	);

	const allOrgs = await db
		.select({
			id: organizations.id,
			name: organizations.name,
			slug: organizations.slug,
			connectionString: organizations.connectionString,
		})
		.from(organizations);

	const dead: Array<{
		id: string;
		name: string;
		slug: string;
		reason: string;
	}> = [];
	for (const org of allOrgs) {
		try {
			decrypt(org.connectionString);
		} catch (e) {
			dead.push({
				id: org.id,
				name: org.name,
				slug: org.slug,
				reason: e instanceof Error ? e.message : String(e),
			});
		}
	}

	console.log(
		`\n${allOrgs.length} orgs total; ${dead.length} undecryptable (dead):`,
	);
	for (const d of dead) console.log(`  - ${d.name} (${d.slug}) — ${d.reason}`);

	if (!APPLY) {
		console.log(
			`\nDRY RUN. Nothing deleted. Re-run with --apply to delete the ${dead.length} dead org(s).`,
		);
		return;
	}

	console.log(`\nDeleting ${dead.length} dead org(s)...`);
	let ok = 0;
	let fail = 0;
	for (const d of dead) {
		try {
			await db.transaction(async (tx) => {
				for (const dep of dependents) {
					await tx.execute(
						sql`DELETE FROM ${sql.identifier(dep.table_name)} WHERE ${sql.identifier(dep.column_name)} = ${d.id}`,
					);
				}
				await tx.delete(organizations).where(eq(organizations.id, d.id));
			});
			console.log(`  [OK]   ${d.name} (${d.slug})`);
			ok++;
		} catch (e) {
			console.log(
				`  [FAIL] ${d.name} (${d.slug}) — ${e instanceof Error ? e.message : String(e)}`,
			);
			fail++;
		}
	}
	console.log(
		`\nDeleted: ${ok} | Failed: ${fail} | Total dead: ${dead.length}`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
