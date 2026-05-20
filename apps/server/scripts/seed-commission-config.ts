#!/usr/bin/env bun
/**
 * seed-commission-config.ts — ensure every tenant has a baseline commission configuration.
 *
 * WHAT IT DOES (per tenant, fully idempotent)
 * ===========================================
 *  1. Ensures a "Standard" trainer tier (rank 1) exists.
 *  2. Assigns the Standard tier to every active trainer that has NO tier set.
 *  3. For every active trainer tier × every service category:
 *       - ensures a `category_commission_configs` row exists (variable, 10%, maxCoaches=1)
 *       - ensures a coach slot 0 ("Primary", 100% weightage) exists for that config
 *       - ensures a `commission_tier_rates` row exists (1000 bp = 10%) via ON CONFLICT DO NOTHING
 *
 * The tier-rate loop covers ALL active tiers (not just Standard), so pre-existing
 * tiers like "Gold" or "Elite" also get a default 10% rate if they are missing one.
 *
 * USAGE
 * =====
 *   cd apps/server
 *
 *   # Dry-run (DEFAULT — scans and reports, no writes)
 *   bun run scripts/seed-commission-config.ts
 *
 *   # Apply to the default test tenant
 *   bun run scripts/seed-commission-config.ts --apply
 *
 *   # Apply to a specific org
 *   bun run scripts/seed-commission-config.ts --apply --org=<orgId>
 *
 *   # Apply to all tenants
 *   bun run scripts/seed-commission-config.ts --apply --all
 *
 *   # Help
 *   bun run scripts/seed-commission-config.ts --help
 *
 * PRODUCTION USE
 * ==============
 * Safe to run against production tenants — all writes are idempotent.
 * Recommended flow:
 *   1. Dry-run across all tenants to see what is missing.
 *   2. Apply to a single test tenant and verify in Drizzle Studio.
 *   3. Apply to all: --apply --all
 */

import { decrypt } from "@avantej-core/db";
import * as cps from "@avantej-core/db/schema/control-panel-schema";
import * as ts from "@avantej-core/db/schema/tenant-schema";
import {
	categoryCommissionConfigs,
	commissionCoachSlots,
	commissionTierRates,
	members,
	serviceCategories,
	trainerTiers,
} from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
	dryRun: boolean;
	orgId: string | null;
	allOrgs: boolean;
	help: boolean;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const opts: CliOptions = {
		dryRun: true, // DEFAULT: dry-run
		orgId: null,
		allOrgs: false,
		help: false,
	};

	const valueOf = (i: number, arg: string): string | undefined => {
		const eq = arg.indexOf("=");
		return eq >= 0 ? arg.slice(eq + 1) : args[i + 1];
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg) continue;
		if (arg === "--help" || arg === "-h") {
			opts.help = true;
		} else if (arg === "--apply") {
			opts.dryRun = false;
		} else if (arg === "--dry-run") {
			opts.dryRun = true;
		} else if (arg === "--all") {
			opts.allOrgs = true;
		} else if (arg === "--org" || arg.startsWith("--org=")) {
			opts.orgId = valueOf(i, arg) ?? null;
			if (!arg.includes("=")) i++;
			if (!opts.orgId) {
				console.error("ERROR: --org requires an organization id");
				process.exit(1);
			}
		} else if (arg.startsWith("--")) {
			console.error(`ERROR: unknown flag ${arg}`);
			process.exit(1);
		}
	}

	return opts;
}

function printHelp(): void {
	console.log(`
seed-commission-config.ts — ensure every tenant has a baseline commission configuration.

USAGE
  bun run scripts/seed-commission-config.ts [options]

OPTIONS
  --dry-run      Scan and report only; write nothing (DEFAULT)
  --apply        Commit inserts/updates
  --org <id>     Restrict to one organization ID
  --all          Run across all tenants in the control panel
  --help         Show this message

EXAMPLES
  # See what is missing (safe — no writes)
  bun run scripts/seed-commission-config.ts

  # Apply to the default test tenant
  bun run scripts/seed-commission-config.ts --apply

  # Apply to a specific org
  bun run scripts/seed-commission-config.ts --apply --org=996febce-aaad-4ded-8f47-02d2b566c8ee

  # Apply to all tenants
  bun run scripts/seed-commission-config.ts --apply --all
`);
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined) {
				const key = m[1].trim();
				const value = m[2].trim().replace(/^["']|["']$/g, "");
				if (!process.env[key]) process.env[key] = value;
			}
		}
	} catch {
		console.warn("Could not load .dev.vars — relying on process.env");
	}
}

// ---------------------------------------------------------------------------
// Per-tenant result
// ---------------------------------------------------------------------------

interface TenantResult {
	orgId: string;
	orgName: string;
	tiersFound: number;
	trainersUpdated: number;
	configsCreated: number;
	configsExisted: number;
	tierRatesCreated: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

async function processTenant(
	org: { id: string; name: string; connectionString: string },
	dryRun: boolean,
): Promise<TenantResult> {
	const result: TenantResult = {
		orgId: org.id,
		orgName: org.name,
		tiersFound: 0,
		trainersUpdated: 0,
		configsCreated: 0,
		configsExisted: 0,
		tierRatesCreated: 0,
	};

	let tPool: Pool | null = null;
	try {
		tPool = new Pool({ connectionString: decrypt(org.connectionString) });
		const tDb = drizzle({ client: tPool, schema: ts });

		// ----------------------------------------------------------------
		// 1. Ensure "Standard" trainer tier exists
		// ----------------------------------------------------------------
		let standardTier = await tDb.query.trainerTiers.findFirst({
			where: (t, { eq }) => eq(t.name, "Standard"),
		});
		if (!standardTier) {
			if (!dryRun) {
				const [created] = await tDb
					.insert(trainerTiers)
					.values({
						name: "Standard",
						description: "Default tier for trainers (seeded by commission config script)",
						rank: 1,
						isActive: true,
					})
					.returning();
				standardTier = created!;
				console.log(`  [${org.name}] CREATED trainer tier: Standard (${standardTier.id})`);
			} else {
				console.log(`  [${org.name}] WOULD CREATE trainer tier: Standard`);
			}
		} else {
			console.log(`  [${org.name}] EXISTS  trainer tier: Standard (${standardTier.id})`);
		}

		// ----------------------------------------------------------------
		// 2. Enumerate ALL active tiers (Standard + any pre-existing ones)
		// ----------------------------------------------------------------
		const activeTiers = await tDb
			.select()
			.from(trainerTiers)
			.where(eq(trainerTiers.isActive, true));

		// Include the just-created Standard tier in dry-run (it won't be in DB yet)
		const effectiveTiers =
			activeTiers.length === 0 && standardTier
				? [standardTier]
				: activeTiers;

		result.tiersFound = effectiveTiers.length;
		console.log(`  [${org.name}] Active tier(s): ${effectiveTiers.map((t) => t.name).join(", ")}`);

		// ----------------------------------------------------------------
		// 3. Assign Standard tier to trainers that have no tier
		// ----------------------------------------------------------------
		if (standardTier) {
			const trainersWithoutTier = await tDb
				.select({ id: members.id })
				.from(members)
				.where(
					and(
						eq(members.role, "trainer"),
						eq(members.status, "active"),
						isNull(members.trainerTierId),
					),
				);

			if (trainersWithoutTier.length > 0) {
				if (!dryRun) {
					for (const m of trainersWithoutTier) {
						await tDb
							.update(members)
							.set({ trainerTierId: standardTier.id })
							.where(eq(members.id, m.id));
					}
					console.log(
						`  [${org.name}] UPDATED ${trainersWithoutTier.length} trainer(s) → tier=Standard`,
					);
				} else {
					console.log(
						`  [${org.name}] WOULD UPDATE ${trainersWithoutTier.length} trainer(s) → tier=Standard`,
					);
				}
				result.trainersUpdated = trainersWithoutTier.length;
			} else {
				console.log(`  [${org.name}] All active trainers already have a tier`);
			}
		}

		// ----------------------------------------------------------------
		// 4. Per-category config + slot + tier rate for EVERY active tier
		// ----------------------------------------------------------------
		const categories = await tDb
			.select()
			.from(serviceCategories);

		console.log(`  [${org.name}] Service categories: ${categories.length}`);

		for (const cat of categories) {
			const existing = await tDb.query.categoryCommissionConfigs.findFirst({
				where: (c, { eq }) => eq(c.categoryId, cat.id),
			});

			let config = existing;
			if (!config) {
				if (!dryRun) {
					const [created] = await tDb
						.insert(categoryCommissionConfigs)
						.values({
							categoryId: cat.id,
							paymentType: "variable",
							isConditional: false,
							maxCoaches: 1,
							isActive: true,
						})
						.returning();
					config = created!;
					result.configsCreated++;
					console.log(`    [${org.name}] CREATED config for "${cat.name}" (${config.id})`);
				} else {
					result.configsCreated++;
					console.log(`    [${org.name}] WOULD CREATE config for "${cat.name}"`);
					// Can't create tier rates without a real config in dry-run
					continue;
				}
			} else {
				result.configsExisted++;
				console.log(`    [${org.name}] EXISTS  config for "${cat.name}" (${config.id})`);
			}

			// Coach slot 0 — one per config
			const existingSlot = await tDb.query.commissionCoachSlots.findFirst({
				where: (s, { and, eq }) =>
					and(eq(s.configId, config!.id), eq(s.slotIndex, 0)),
			});
			if (!existingSlot) {
				if (!dryRun) {
					await tDb.insert(commissionCoachSlots).values({
						configId: config.id,
						slotIndex: 0,
						label: "Primary",
						weightageBasisPoints: 10000,
					});
					console.log(`      → coach slot 0 (Primary, 100%) created`);
				} else {
					console.log(`      → WOULD CREATE coach slot 0 (Primary, 100%)`);
				}
			}

			// Tier rate — one per (config × tier)
			for (const tier of effectiveTiers) {
				const existingRate = await tDb.query.commissionTierRates.findFirst({
					where: (r, { and, eq }) =>
						and(
							eq(r.configId, config!.id),
							eq(r.trainerTierId, tier.id),
						),
				});
				if (!existingRate) {
					if (!dryRun) {
						await tDb.insert(commissionTierRates).values({
							configId: config.id,
							trainerTierId: tier.id,
							amount: 1000, // 1000bp = 10%
						});
						result.tierRatesCreated++;
						console.log(`      → tier rate ${tier.name}=10% created`);
					} else {
						result.tierRatesCreated++;
						console.log(`      → WOULD CREATE tier rate ${tier.name}=10%`);
					}
				}
			}
		}
	} catch (err) {
		result.error = err instanceof Error ? err.message : String(err);
		console.error(`  [${org.name}] ERROR: ${result.error}`);
	} finally {
		if (tPool) {
			try {
				await tPool.end();
			} catch {
				// ignore cleanup errors
			}
		}
	}

	return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	const opts = parseArgs();

	if (opts.help) {
		printHelp();
		process.exit(0);
	}

	loadDevVars();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error("ERROR: DATABASE_URL is not set. Load .dev.vars or export the variable.");
		process.exit(1);
	}

	// Banner
	console.log("\nCommission Config Seed");
	console.log("======================");
	if (opts.dryRun) {
		console.log("MODE: DRY RUN — no changes written. Use --apply to commit.");
	} else {
		console.log("MODE: APPLY — changes will be committed.");
	}
	console.log("");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: cps });

	try {
		let orgs: Array<{ id: string; name: string; connectionString: string }>;

		if (opts.allOrgs) {
			orgs = await cpDb.query.organizations.findMany({
				columns: { id: true, name: true, connectionString: true },
				orderBy: (t, { asc }) => asc(t.name),
			});
		} else {
			const targetId = opts.orgId ?? DEFAULT_ORG_ID;
			const org = await cpDb.query.organizations.findFirst({
				where: (o, { eq }) => eq(o.id, targetId),
				columns: { id: true, name: true, connectionString: true },
			});
			if (!org) {
				console.error(`ERROR: organization ${targetId} not found`);
				process.exit(1);
			}
			orgs = [org];
		}

		console.log(`Found ${orgs.length} tenant(s)\n`);

		const results: TenantResult[] = [];
		for (const org of orgs) {
			console.log(`Processing: ${org.name} (${org.id})`);
			const r = await processTenant(org, opts.dryRun);
			results.push(r);
			console.log("");
		}

		// Summary table
		console.log("--- Summary ---\n");
		const colW = [36, 6, 8, 8, 8, 10, 10];
		const header = [
			"Tenant".padEnd(colW[0]!),
			"Tiers".padEnd(colW[1]!),
			"Trainers".padEnd(colW[2]!),
			"CfgNew".padEnd(colW[3]!),
			"CfgOld".padEnd(colW[4]!),
			"RatesNew".padEnd(colW[5]!),
			"Status".padEnd(colW[6]!),
		].join(" | ");
		console.log(header);
		console.log("-".repeat(header.length));

		for (const r of results) {
			const status = r.error ? "ERROR" : opts.dryRun ? "dry-run" : "ok";
			console.log(
				[
					r.orgName.slice(0, colW[0]!).padEnd(colW[0]!),
					String(r.tiersFound).padEnd(colW[1]!),
					String(r.trainersUpdated).padEnd(colW[2]!),
					String(r.configsCreated).padEnd(colW[3]!),
					String(r.configsExisted).padEnd(colW[4]!),
					String(r.tierRatesCreated).padEnd(colW[5]!),
					status.padEnd(colW[6]!),
				].join(" | "),
			);
		}

		if (opts.dryRun) {
			console.log("\nDRY RUN — no changes written. Use --apply to commit.");
		} else {
			console.log("\nDone.");
		}
	} finally {
		await cpPool.end();
	}
}

if (import.meta.main) {
	main()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error("\nFatal error:", err);
			process.exit(1);
		});
}
