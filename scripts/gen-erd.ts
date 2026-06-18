/**
 * Auto-generate ERD doc from live DB + schema source.
 *
 * Strategy:
 *  1. Live DB FKs = source of truth for what actually exists in prod.
 *  2. Schema source `.references()` calls (incl. `(): any =>` self-ref casts) = source of truth for INTENT.
 *  3. Diff = drift section.
 *  4. Domain grouping = hand-curated table-name → bucket map (config below). New tables fall into "Misc".
 *
 * Run: bun scripts/gen-erd.ts
 * Output: zhub/shared/schema-erd-auto.md
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { decrypt } from "@avantej-core/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import * as dotenv from "dotenv";
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
dotenv.config({ path: resolve(__dirname, "../apps/server/.env") });

const SCHEMA_ROOT = resolve(__dirname, "../packages/db/src/schema");
const OUT = resolve(__dirname, "../zhub/shared/schema-erd-auto.md");
const DRIFT_JSON_OUT = resolve(__dirname, "../zhub/shared/schema-drift.json");

// Domain bucket: table_name → bucket label. Add new mappings here when new tables land.
const DOMAINS: Record<string, string> = {
	// Identity & Hierarchy
	hierarchy_nodes: "Identity & Hierarchy",
	members: "Identity & Hierarchy",
	member_profiles: "Identity & Hierarchy",
	invitations: "Identity & Hierarchy",
	roles: "Identity & Hierarchy",
	permissions: "Identity & Hierarchy",
	role_permissions: "Identity & Hierarchy",
	organization_settings: "Identity & Hierarchy",
	trainer_tiers: "Identity & Hierarchy",

	// Services & Catalog
	services: "Services & Catalog",
	service_categories: "Services & Catalog",
	service_category_config: "Services & Catalog",
	service_members: "Services & Catalog",
	rooms: "Services & Catalog",
	brands: "Services & Catalog",
	products: "Services & Catalog",
	product_categories: "Services & Catalog",
	product_stock: "Services & Catalog",
	suppliers: "Services & Catalog",
	units_of_measure: "Services & Catalog",

	// Appointments & Scheduling
	appointments: "Appointments & Scheduling",
	appointment_clients: "Appointments & Scheduling",
	appointment_staff: "Appointments & Scheduling",
	recurrence_rules: "Appointments & Scheduling",
	class_slots: "Appointments & Scheduling",
	waitlist_entries: "Appointments & Scheduling",
	trainer_availability: "Appointments & Scheduling",
	coach_intake_availability: "Appointments & Scheduling",
	coach_intake_exceptions: "Appointments & Scheduling",
	preferred_times: "Appointments & Scheduling",
	member_category_buffer_overrides: "Appointments & Scheduling",
	member_service_buffer_overrides: "Appointments & Scheduling",
	check_ins: "Appointments & Scheduling",

	// Sales & Payments
	sales_orders: "Sales & Payments",
	sales_order_items: "Sales & Payments",
	invoices: "Sales & Payments",
	refunds: "Sales & Payments",
	payments: "Sales & Payments",
	payment_items: "Sales & Payments",
	package_instances: "Sales & Payments",
	package_instance_staff: "Sales & Payments",
	installments: "Sales & Payments",
	installment_events: "Sales & Payments",
	installment_plans: "Sales & Payments",
	promotions: "Sales & Payments",
	promotion_usages: "Sales & Payments",
	tax_rates: "Sales & Payments",
	walk_in_customers: "Sales & Payments",
	customer_profiles: "Sales & Payments",

	// Commission & Payouts
	category_commission_configs: "Commission & Payouts",
	commission_conditions: "Commission & Payouts",
	commission_condition_rates: "Commission & Payouts",
	commission_tier_rates: "Commission & Payouts",
	commission_coach_slots: "Commission & Payouts",
	commission_splits: "Commission & Payouts",
	payouts: "Commission & Payouts",
	partner_stripe_accounts: "Commission & Payouts",

	// Inventory Ops
	purchase_orders: "Inventory Ops",
	purchase_order_items: "Inventory Ops",
	stock_requests: "Inventory Ops",
	stock_request_items: "Inventory Ops",
	transfer_orders: "Inventory Ops",
	transfer_order_items: "Inventory Ops",

	// Engagement & Integrations
	announcements: "Engagement & Integrations",
	notifications: "Engagement & Integrations",
	notification_preferences: "Engagement & Integrations",
	expenses: "Engagement & Integrations",
	member_sessions: "Engagement & Integrations",
	ghl_contact_links: "Engagement & Integrations",
	ghl_sync_events: "Engagement & Integrations",
	ghl_user_links: "Engagement & Integrations",
	google_calendar_connections: "Engagement & Integrations",
	google_calendar_event_mappings: "Engagement & Integrations",
	audit_logs: "Engagement & Integrations",
	user_activity_log: "Engagement & Integrations",
	dashboard_snapshots: "Engagement & Integrations",
};

// Tables to ignore in ERD (internal / migration metadata)
const IGNORE = new Set(["drizzle_migrations", "__drizzle_migrations"]);

// FKs intentionally NOT declared in schema (enforced via raw migration to avoid circular imports).
// Listed here so they're flagged as "intentional" not "drift".
const INTENTIONAL_MIGRATION_ONLY_FKS = new Set([
	"commission_splits.payout_id",
	"refunds.payment_id",
]);

const FK_QUERY = `
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_col,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_col,
  rc.delete_rule AS on_delete
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY child_table, child_col;
`;

const TABLE_QUERY = `
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type='BASE TABLE'
ORDER BY table_name;
`;

type Fk = {
	child_table: string;
	child_col: string;
	parent_table: string;
	parent_col: string;
	on_delete: string;
};

async function fetchDb(url: string): Promise<{ tables: string[]; fks: Fk[] }> {
	const pool = new Pool({ connectionString: url });
	const db = drizzle({ client: pool });
	const fks = ((await db.execute(FK_QUERY)).rows as Fk[]).filter(
		(f) => !IGNORE.has(f.child_table) && !IGNORE.has(f.parent_table),
	);
	const tables = ((await db.execute(TABLE_QUERY)).rows as Array<{ table_name: string }>)
		.map((r) => r.table_name)
		.filter((t) => !IGNORE.has(t));
	await pool.end();
	return { tables, fks };
}

// Parse schema source for `.references(() => X.Y, { onDelete: ... })` AND `(): any => X.Y`.
// Returns map: child_table.child_col → { parent_table, parent_col, on_delete }
type SchemaFk = { child: string; col: string; parent: string; on_delete: string };
type LogicalRef = { child: string; col: string; target: string; source: string };

function camelToSnake(s: string): string {
	return s.replace(/([A-Z])/g, "_$1").toLowerCase().replace(/^_/, "");
}

function parseSchemaFks(): SchemaFk[] {
	const files: string[] = [];
	function walk(dir: string) {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".ts") && !e.name.endsWith("-schema.ts") && e.name !== "index.ts") {
				files.push(p);
			}
		}
	}
	walk(SCHEMA_ROOT);

	const result: SchemaFk[] = [];

	for (const file of files) {
		const src = readFileSync(file, "utf8");
		const lines = src.split("\n");

		// Track current pgTable as we scan. Multi-table files (auth.ts, purchase-orders.ts) need this.
		let currentTable: string | null = null;
		let pendingPgTable = false; // pgTable( seen, "name" not yet found

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Detect pgTable("name", ...) — possibly with newline between ( and "name"
			const sameLine = line.match(/pgTable\(\s*\"(\w+)\"/);
			if (sameLine) {
				currentTable = sameLine[1];
				pendingPgTable = false;
			} else if (line.includes("pgTable(") && !sameLine) {
				pendingPgTable = true;
			} else if (pendingPgTable) {
				const nameLine = line.match(/^\s*\"(\w+)\"/);
				if (nameLine) {
					currentTable = nameLine[1];
					pendingPgTable = false;
				}
			}

			// References call may span lines: `.references(` on line N, `() => X.Y` on line N+1.
			// Concatenate up to 3 lines forward for matching.
			const window = lines.slice(i, Math.min(lines.length, i + 4)).join(" ");
			const refMatch = window.match(/\.references\(\s*\(\s*\)\s*(?::\s*any)?\s*=>\s*(\w+)\.(\w+)/);
			if (!refMatch || !currentTable) continue;
			// Skip if the .references( anchor is not on the current line (avoid double-matching from later lines)
			if (!line.includes(".references(")) continue;
			const targetVar = refMatch[1];
			const tableName = currentTable;

			// Look back for column name
			let col: string | null = null;
			for (let j = i; j >= Math.max(0, i - 8); j--) {
				const cm = lines[j].match(/(?:uuid|text|integer|bigint)\(\s*\"(\w+)\"\s*\)/);
				if (cm) {
					col = cm[1];
					break;
				}
			}
			if (!col) continue;

			// Look forward for onDelete
			let onDelete = "no action";
			for (let j = i; j < Math.min(lines.length, i + 4); j++) {
				const om = lines[j].match(/onDelete:\s*\"([^\"]+)\"/);
				if (om) {
					onDelete = om[1];
					break;
				}
			}

			result.push({
				child: tableName,
				col,
				parent: camelToSnake(targetVar),
				on_delete: onDelete.toUpperCase().replace("_", " "),
			});
		}
	}
	// Dedupe (multiple refs in same file shouldn't double-count)
	const seen = new Set<string>();
	return result.filter((s) => {
		const k = `${s.child}.${s.col}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});
}

function bucket(t: string): string {
	return DOMAINS[t] ?? "Misc";
}

function mermaidEdge(f: Fk): string {
	const action = f.on_delete.toLowerCase();
	const label = `${f.child_col} ${action}`;
	return `  ${f.parent_table} ||--o{ ${f.child_table} : "${label}"`;
}

/**
 * Parse logical text-column refs (no FK constraint, by convention or comment hint).
 * Matches:
 *  1. `text("col_name")` followed by trailing comment containing `Reference` / `references` / `→` / `\w+\.\w+`
 *  2. Known conventional names (userId, createdBy, recipientId, etc.) — heuristic-only
 */
function parseLogicalRefs(): LogicalRef[] {
	const files: string[] = [];
	function walk(dir: string) {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.name.endsWith(".ts") && !e.name.endsWith("-schema.ts") && e.name !== "index.ts") files.push(p);
		}
	}
	walk(SCHEMA_ROOT);

	const result: LogicalRef[] = [];
	const seen = new Set<string>();

	for (const file of files) {
		const src = readFileSync(file, "utf8");
		const lines = src.split("\n");
		let currentTable: string | null = null;
		let pendingPgTable = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const sameLine = line.match(/pgTable\(\s*\"(\w+)\"/);
			if (sameLine) { currentTable = sameLine[1]; pendingPgTable = false; }
			else if (line.includes("pgTable(") && !sameLine) pendingPgTable = true;
			else if (pendingPgTable) {
				const nm = line.match(/^\s*\"(\w+)\"/);
				if (nm) { currentTable = nm[1]; pendingPgTable = false; }
			}

			if (!currentTable) continue;

			// Match text("col_name") declarations, skip if .references( on same/next line (real FK)
			const txt = line.match(/text\(\s*\"(\w+)\"\s*\)/);
			if (!txt) continue;
			const col = txt[1];
			// Skip if FK already declared in next 3 lines
			const window = lines.slice(i, Math.min(lines.length, i + 4)).join(" ");
			if (/\.references\(/.test(window)) continue;

			// Look for comment hint: "// References X.Y" or "// member.userId" etc.
			const trailing = line.split("//")[1] || "";
			const nextLine = lines[i + 1] || "";
			const nextComment = nextLine.match(/^\s*\/\/\s*(.*)$/)?.[1] ?? "";
			const hint = trailing + " " + nextComment;

			let target: string | null = null;
			let source = "";
			const m1 = hint.match(/(\w+)\.(\w+)/);
			if (m1 && /[Rr]eferenc|→|members\.|user\.|customer/.test(hint)) {
				target = `${camelToSnake(m1[1])}.${m1[2]}`;
				source = "comment";
			}

			// Convention fallback for known naming patterns (only if no comment match)
			if (!target) {
				if (col === "user_id" || /_user_id$/.test(col)) {
					target = "user.id (CP)";
					source = "convention";
				} else if (/^(created_by|requested_by|reviewed_by|processed_by|granted_by|invited_by|approved_by|recipient_id|partner_id|client_id|assigned_trainer_assigned_by|manual_payout_confirmed_by)$/.test(col)) {
					target = "members.userId (text)";
					source = "convention";
				}
			}

			if (!target) continue;
			const key = `${currentTable}.${col}`;
			if (seen.has(key)) continue;
			seen.add(key);
			result.push({ child: currentTable, col, target, source });
		}
	}
	return result;
}

async function main() {
	const cpUrl = process.env.DATABASE_URL!;
	const cpPool = new Pool({ connectionString: cpUrl });
	const cpDb = drizzle({ client: cpPool, schema: { organizations } });
	const orgs = await cpDb.query.organizations.findMany();
	if (!orgs.length) throw new Error("No orgs in control panel");
	// Pick the first org whose connection string actually decrypts. Placeholder /
	// unprovisioned orgs (e.g. billing test orgs) store a non-encrypted stub that
	// would throw "Invalid encrypted format" — skip them; we only need one real
	// tenant DB to diff the live schema against.
	let chosen: { name: string; url: string } | undefined;
	for (const org of orgs) {
		try {
			chosen = { name: org.name, url: decrypt(org.connectionString) };
			break;
		} catch {
			// org without a valid encrypted connection string — skip
		}
	}
	await cpPool.end();
	if (!chosen) {
		throw new Error(
			`No org with a decryptable connection string (checked ${orgs.length})`,
		);
	}
	const tenantUrl = chosen.url;

	console.log(`Using tenant: ${chosen.name}`);

	const [cp, tenant] = await Promise.all([fetchDb(cpUrl), fetchDb(tenantUrl)]);
	const schemaFks = parseSchemaFks();
	const logicalRefs = parseLogicalRefs();

	// Build live FK lookup: "child.col" → Fk
	const liveByCol = new Map<string, Fk>();
	for (const f of [...cp.fks, ...tenant.fks]) {
		liveByCol.set(`${f.child_table}.${f.child_col}`, f);
	}
	const schemaByCol = new Map<string, SchemaFk>();
	for (const s of schemaFks) {
		schemaByCol.set(`${s.child}.${s.col}`, s);
	}

	// Drift A: schema declares FK, live missing
	const missingInLive: SchemaFk[] = [];
	for (const s of schemaFks) {
		if (!liveByCol.has(`${s.child}.${s.col}`)) missingInLive.push(s);
	}
	// Drift B: action mismatch
	const actionDrift: Array<{ key: string; schema: string; live: string }> = [];
	for (const s of schemaFks) {
		const live = liveByCol.get(`${s.child}.${s.col}`);
		if (live && live.on_delete.toUpperCase() !== s.on_delete.toUpperCase()) {
			actionDrift.push({ key: `${s.child}.${s.col}`, schema: s.on_delete, live: live.on_delete });
		}
	}
	// Drift C: live has FK schema doesn't declare (split: intentional vs unexpected)
	const orphanLive: Fk[] = [];
	const intentionalLive: Fk[] = [];
	for (const f of [...cp.fks, ...tenant.fks]) {
		const key = `${f.child_table}.${f.child_col}`;
		if (schemaByCol.has(key)) continue;
		if (INTENTIONAL_MIGRATION_ONLY_FKS.has(key)) intentionalLive.push(f);
		else orphanLive.push(f);
	}

	// Domain group tenant tables
	const domainEdges = new Map<string, Fk[]>();
	const domainTables = new Map<string, Set<string>>();
	for (const f of tenant.fks) {
		const d = bucket(f.child_table);
		if (!domainEdges.has(d)) domainEdges.set(d, []);
		domainEdges.get(d)!.push(f);
		if (!domainTables.has(d)) domainTables.set(d, new Set());
		domainTables.get(d)!.add(f.child_table);
	}
	// Add ALL tenant tables to their domain (catches parent-only tables)
	for (const t of tenant.tables) {
		const d = bucket(t);
		if (d === "Misc" && !DOMAINS[t]) {
			// Unknown table → Misc bucket
		}
		if (!domainTables.has(d)) domainTables.set(d, new Set());
		domainTables.get(d)!.add(t);
	}

	// Build doc
	let out = `# Schema ERD (auto-generated)\n\n`;
	out += `> **Do not edit by hand.** Regenerate with \`bun scripts/gen-erd.ts\`.\n\n`;
	out += `Generated: ${new Date().toISOString()}\n`;
	out += `Tenant org: ${orgs[0].name}\n`;
	out += `Control panel: ${cp.tables.length} tables, ${cp.fks.length} FKs\n`;
	out += `Tenant: ${tenant.tables.length} tables, ${tenant.fks.length} FKs\n\n`;

	out += `## Control Panel\n\n\`\`\`mermaid\nerDiagram\n`;
	for (const f of cp.fks) out += mermaidEdge(f) + "\n";
	out += `\`\`\`\n\nTables: ${cp.tables.join(", ")}\n\n`;

	out += `## Tenant — by domain\n\n`;
	const domains = [...domainTables.keys()].sort();
	for (const d of domains) {
		const tablesInDomain = [...domainTables.get(d)!].sort();
		out += `### ${d}\n\n**Tables**: ${tablesInDomain.join(", ")}\n\n`;
		const edges = domainEdges.get(d) ?? [];
		if (edges.length) {
			out += `\`\`\`mermaid\nerDiagram\n`;
			for (const f of edges) out += mermaidEdge(f) + "\n";
			out += `\`\`\`\n\n`;
		} else {
			out += `_No internal FKs._\n\n`;
		}
	}

	// Standalone tables (no FKs in any direction)
	const tablesWithFks = new Set<string>();
	for (const f of tenant.fks) {
		tablesWithFks.add(f.child_table);
		tablesWithFks.add(f.parent_table);
	}
	const standalone = tenant.tables.filter((t) => !tablesWithFks.has(t));
	if (standalone.length) {
		out += `### Standalone (no FKs)\n\n${standalone.map((t) => `- ${t}`).join("\n")}\n\n`;
	}

	out += `## Logical Text-Column Refs (no pg_constraint)\n\nDetected via comment hints + naming conventions. Not enforced at DB level.\n\n`;
	if (logicalRefs.length) {
		out += `| Child | Col | → | Target | Source |\n|---|---|---|---|---|\n`;
		for (const r of logicalRefs.sort((a, b) => `${a.child}.${a.col}`.localeCompare(`${b.child}.${b.col}`))) {
			out += `| ${r.child} | ${r.col} | → | ${r.target} | ${r.source} |\n`;
		}
	} else out += `_None_\n`;
	out += "\n";

	out += `## Drift Report\n\n`;

	out += `### Schema declares FK, live missing (${missingInLive.length})\n\n`;
	if (missingInLive.length) {
		out += `| Child | Col | → | Parent | Action |\n|---|---|---|---|---|\n`;
		for (const s of missingInLive) {
			out += `| ${s.child} | ${s.col} | → | ${s.parent} | ${s.on_delete} |\n`;
		}
	} else out += `_None_\n`;
	out += "\n";

	out += `### onDelete action mismatch (${actionDrift.length})\n\n`;
	if (actionDrift.length) {
		out += `| FK | Schema | Live |\n|---|---|---|\n`;
		for (const d of actionDrift) out += `| ${d.key} | ${d.schema} | ${d.live} |\n`;
	} else out += `_None_\n`;
	out += "\n";

	out += `### Live has FK, schema doesn't declare — UNEXPECTED (${orphanLive.length})\n\n`;
	if (orphanLive.length) {
		out += `| Child | Col | → | Parent | Action |\n|---|---|---|---|---|\n`;
		for (const f of orphanLive) {
			out += `| ${f.child_table} | ${f.child_col} | → | ${f.parent_table} | ${f.on_delete} |\n`;
		}
	} else out += `_None_\n`;
	out += "\n";

	out += `### Live FKs intentionally migration-only (${intentionalLive.length})\n\nDeclared via raw migration to avoid Drizzle circular imports. Tracked in \`INTENTIONAL_MIGRATION_ONLY_FKS\` in \`scripts/gen-erd.ts\`.\n\n`;
	if (intentionalLive.length) {
		out += `| Child | Col | → | Parent | Action |\n|---|---|---|---|---|\n`;
		for (const f of intentionalLive) {
			out += `| ${f.child_table} | ${f.child_col} | → | ${f.parent_table} | ${f.on_delete} |\n`;
		}
	} else out += `_None_\n`;
	out += "\n";

	// Tables in live not in any schema file (orphan tables)
	const schemaTables = new Set(schemaFks.map((s) => s.child));
	// Also collect tables from pgTable() calls even if zero FKs
	function walkSchemaTables(dir: string, acc: Set<string>) {
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, e.name);
			if (e.isDirectory()) walkSchemaTables(p, acc);
			else if (e.name.endsWith(".ts") && e.name !== "index.ts") {
				const src = readFileSync(p, "utf8");
				for (const m of src.matchAll(/pgTable\(\s*\"(\w+)\"/g)) acc.add(m[1]);
			}
		}
	}
	walkSchemaTables(SCHEMA_ROOT, schemaTables);
	const orphanTables = tenant.tables.filter((t) => !schemaTables.has(t));
	const orphanTablesCp = cp.tables.filter((t) => !schemaTables.has(t));

	out += `### Tables in live, not in schema source (${orphanTables.length + orphanTablesCp.length})\n\n`;
	const all = [...orphanTables.map((t) => `tenant: ${t}`), ...orphanTablesCp.map((t) => `cp: ${t}`)];
	if (all.length) out += all.map((t) => `- ${t}`).join("\n") + "\n";
	else out += `_None_\n`;
	out += "\n";

	// Tables in schema not in live
	const liveTables = new Set([...cp.tables, ...tenant.tables]);
	const missingTables = [...schemaTables].filter((t) => !liveTables.has(t));
	out += `### Tables in schema source, not in live (${missingTables.length})\n\n`;
	if (missingTables.length) out += missingTables.map((t) => `- ${t}`).join("\n") + "\n";
	else out += `_None_\n`;
	out += "\n";

	writeFileSync(OUT, out);
	console.log(`Wrote → ${OUT}`);
	console.log(
		`Drift: ${missingInLive.length} missing-in-live, ${actionDrift.length} action-mismatch, ${orphanLive.length} orphan-live-FK, ${orphanTables.length + orphanTablesCp.length} orphan-tables, ${missingTables.length} missing-tables`,
	);

	// Per-database drift breakdown for machine-readable consumption (check-drift.ts)
	const cpTableSet = new Set(cp.tables);
	const tenantTableSet = new Set(tenant.tables);

	function bucketByDb<T extends { child?: string; child_table?: string }>(
		item: T,
	): "cp" | "tenant" | "unknown" {
		const t = (item as { child?: string }).child ?? (item as { child_table?: string }).child_table;
		if (!t) return "unknown";
		if (tenantTableSet.has(t)) return "tenant";
		if (cpTableSet.has(t)) return "cp";
		return "unknown";
	}

	const driftJson = {
		generated_at: new Date().toISOString(),
		tenant: {
			missing_in_live: missingInLive.filter((s) => bucketByDb(s) === "tenant"),
			extra_in_live: orphanLive.filter((f) => bucketByDb(f) === "tenant"),
			action_mismatches: actionDrift.filter((d) => {
				const child = d.key.split(".")[0]!;
				return tenantTableSet.has(child);
			}),
			orphan_tables: orphanTables,
			missing_tables: missingTables.filter((t) => !cpTableSet.has(t)),
		},
		controlPanel: {
			missing_in_live: missingInLive.filter((s) => bucketByDb(s) === "cp"),
			extra_in_live: orphanLive.filter((f) => bucketByDb(f) === "cp"),
			action_mismatches: actionDrift.filter((d) => {
				const child = d.key.split(".")[0]!;
				return cpTableSet.has(child);
			}),
			orphan_tables: orphanTablesCp,
			missing_tables: missingTables.filter((t) => cpTableSet.has(t)),
		},
	};
	writeFileSync(DRIFT_JSON_OUT, JSON.stringify(driftJson, null, 2));
	console.log(`Wrote → ${DRIFT_JSON_OUT}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
