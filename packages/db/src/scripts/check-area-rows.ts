/**
 * One-shot read-only check: count hierarchy_nodes rows by type across all tenants.
 * Used to decide whether hierarchy refactor migration can proceed safely.
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

interface Organization {
	id: string;
	name: string;
	connectionString: string;
}

async function getOrganizations(
	controlPanelUrl: string,
): Promise<Organization[]> {
	const pool = new Pool({ connectionString: controlPanelUrl });
	try {
		const result = await pool.query(
			`SELECT id, name, connection_string FROM organizations ORDER BY name ASC`,
		);
		return result.rows.map((row: any) => ({
			id: row.id,
			name: row.name,
			connectionString: (() => {
				try {
					return decrypt(row.connection_string);
				} catch {
					return row.connection_string;
				}
			})(),
		}));
	} finally {
		await pool.end();
	}
}

async function countByType(tenantUrl: string): Promise<Record<string, number>> {
	const pool = new Pool({ connectionString: tenantUrl });
	try {
		const result = await pool.query(
			`SELECT type, count(*)::int AS n FROM hierarchy_nodes GROUP BY type ORDER BY type`,
		);
		const out: Record<string, number> = {};
		for (const row of result.rows) {
			out[row.type as string] = row.n as number;
		}
		return out;
	} finally {
		await pool.end();
	}
}

async function main() {
	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const orgs = await getOrganizations(controlPanelUrl);
	console.log(
		`\nChecking ${orgs.length} tenants for hierarchy node type counts:\n`,
	);

	const ALL_TYPES = ["organization", "country", "region", "area", "branch"];
	let totalAreas = 0;
	let totalRegions = 0;

	console.log(
		`${"Tenant".padEnd(30)} ${ALL_TYPES.map((t) => t.padStart(7)).join(" ")}`,
	);
	console.log("-".repeat(30 + ALL_TYPES.length * 8));

	for (const org of orgs) {
		try {
			const counts = await countByType(org.connectionString);
			const cells = ALL_TYPES.map((t) =>
				String(counts[t] ?? 0).padStart(7),
			).join(" ");
			console.log(`${org.name.padEnd(30)} ${cells}`);
			totalAreas += counts["area"] ?? 0;
			totalRegions += counts["region"] ?? 0;
		} catch (err) {
			console.log(
				`${org.name.padEnd(30)} ERROR: ${err instanceof Error ? err.message : "unknown"}`,
			);
		}
	}

	console.log("\nSummary:");
	console.log(`  area rows total:   ${totalAreas}`);
	console.log(`  region rows total: ${totalRegions}`);
	if (totalAreas === 0) {
		console.log(`\n✅ No 'area' rows. Refactor migration safe to run.`);
	} else {
		console.log(
			`\n⚠️  ${totalAreas} 'area' row(s) found. Manual flatten required before refactor.`,
		);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
