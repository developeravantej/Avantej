#!/usr/bin/env bun
/**
 * P7 — wire commission for the "move" tenant (post-migration).
 *
 * The harness seeded 70 services with NO category and staff with NO trainer tier,
 * so commission would skip with no_tier_rate. This script closes that chain:
 *   1. service_categories from distinct offering_category (org-wide, branchId null)
 *   2. backfill services.category_id (offering_id → service via mig_xwalk)
 *   3. 4 trainer_tiers (Master/Lead/Senior/Junior) + assign members.trainerTierId by coach_tier
 *   4. category_commission_configs + coach slot 0 (Primary,100%) + per-tier commission_tier_rates
 *
 * ⚠️ RATES ARE MOCK: Master 15% / Lead 12% / Senior 10% / Junior 8% (rank Master=top).
 *    Replace with real rates before go-live.
 *
 * Idempotent. Non-transactional (each write stands alone → safe to re-run after a
 * transient Neon WS drop). Reads coach_tier + offering_category from the
 * consolidated source.xlsx built by the move migration.
 *
 * Usage (from apps/server):
 *   DATABASE_URL=<control-panel-conn> bun run scripts/seed-move-commission.ts          # dry run
 *   DATABASE_URL=<control-panel-conn> bun run scripts/seed-move-commission.ts --apply  # write
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
	services,
	trainerTiers,
} from "@avantej-core/db/schema/tenant/index";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { readSheet } from "./migration/adapters/xlsx";

neonConfig.webSocketConstructor = ws;
const __dirname = dirname(fileURLToPath(import.meta.url));

const ORG_SLUG = "move";
// MOCK rates — rank Master(top) → Junior(bottom). Replace before go-live.
const TIERS = [
	{ name: "Master", rank: 4, rateBp: 1500 },
	{ name: "Lead", rank: 3, rateBp: 1200 },
	{ name: "Senior", rank: 2, rateBp: 1000 },
	{ name: "Junior", rank: 1, rateBp: 800 },
];

function loadDevVars(): void {
	try {
		const content = readFileSync(join(__dirname, "../.dev.vars"), "utf-8");
		for (const line of content.split("\n")) {
			const t = line.trim();
			if (!t || t.startsWith("#")) continue;
			const m = t.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined && !process.env[m[1]])
				process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
		}
	} catch {
		/* rely on process.env */
	}
}

async function main(): Promise<void> {
	loadDevVars();
	const apply = process.argv.includes("--apply");
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL required");

	const sourceFile = join(
		__dirname,
		"migration/adapters/clients/move/data/source.xlsx",
	);
	const staffRows = await readSheet(sourceFile, "staff");
	const productRows = await readSheet(sourceFile, "product");

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cpDb = drizzle({ client: cpPool, schema: cps });
	const org = await cpDb.query.organizations.findFirst({
		where: (o, { eq }) => eq(o.slug, ORG_SLUG),
	});
	if (!org) throw new Error(`org "${ORG_SLUG}" not found`);
	const tPool = new Pool({ connectionString: decrypt(org.connectionString) });
	const tDb = drizzle({ client: tPool, schema: ts });

	console.log(
		`mode: ${apply ? "APPLY" : "DRY RUN"}  org: ${org.name} (${org.id})`,
	);

	try {
		// 1. categories ----------------------------------------------------------
		const catNames = [
			...new Set(
				productRows
					.map((r) => (r.offering_category ?? "").trim())
					.filter(Boolean),
			),
		];
		console.log(`categories (${catNames.length}): ${catNames.join(", ")}`);
		const catId = new Map<string, string>();
		for (const name of catNames) {
			let row = await tDb.query.serviceCategories.findFirst({
				where: (c, { eq, and, isNull }) =>
					and(eq(c.name, name), isNull(c.branchId)),
			});
			if (!row && apply) {
				const [c] = await tDb
					.insert(serviceCategories)
					.values({ name, isActive: true })
					.returning();
				row = c;
			}
			if (row) catId.set(name, row.id);
		}

		// 2. assign services.category_id -----------------------------------------
		const xs = await tDb.execute(
			sql`SELECT source_id, target_id FROM mig_xwalk WHERE source_table = 'product'`,
		);
		const offeringToService = new Map<string, string>();
		for (const r of xs.rows as Array<{ source_id: string; target_id: string }>)
			offeringToService.set(String(r.source_id), String(r.target_id));
		let assigned = 0;
		for (const p of productRows) {
			const sid = offeringToService.get((p.offering_id ?? "").trim());
			const cid = catId.get((p.offering_category ?? "").trim());
			if (sid && cid) {
				if (apply)
					await tDb
						.update(services)
						.set({ categoryId: cid })
						.where(eq(services.id, sid));
				assigned++;
			}
		}
		console.log(`services → category assigned: ${assigned}`);

		// 3. tiers ----------------------------------------------------------------
		const tierId = new Map<string, string>();
		for (const t of TIERS) {
			let row = await tDb.query.trainerTiers.findFirst({
				where: (x, { eq }) => eq(x.name, t.name),
			});
			if (!row && apply) {
				const [c] = await tDb
					.insert(trainerTiers)
					.values({
						name: t.name,
						rank: t.rank,
						isActive: true,
						description: `MOVE ${t.name} (MOCK ${t.rateBp / 100}%)`,
					})
					.returning();
				row = c;
			}
			if (row) tierId.set(t.name.toLowerCase(), row.id);
		}

		// 4. assign trainerTierId by coach_tier ----------------------------------
		const xm = await tDb.execute(
			sql`SELECT source_id, target_id FROM mig_xwalk WHERE source_table = 'staff_member'`,
		);
		const staffToMember = new Map<string, string>();
		for (const r of xm.rows as Array<{ source_id: string; target_id: string }>)
			staffToMember.set(String(r.source_id), String(r.target_id));
		let tierAssigned = 0;
		let tierUnmatched = 0;
		for (const s of staffRows) {
			// only actual coaches get a tier (is_coach), regardless of member role —
			// a manager-coach is role=admin but still earns coaching commission (decision #3).
			const isCoach = ["true", "1", "yes"].includes(
				(s.is_coach ?? "").trim().toLowerCase(),
			);
			const tier = (s.coach_tier ?? "").trim().toLowerCase();
			if (!isCoach || !tier) continue;
			const mid = staffToMember.get((s.staff_code ?? "").trim());
			const tid = tierId.get(tier);
			if (mid && tid) {
				if (apply)
					await tDb
						.update(members)
						.set({ trainerTierId: tid })
						.where(eq(members.id, mid));
				tierAssigned++;
			} else if (!tid) tierUnmatched++;
		}
		console.log(
			`trainers tier-assigned: ${tierAssigned}${tierUnmatched ? `  (unmatched coach_tier: ${tierUnmatched})` : ""}`,
		);

		// 5. configs + slots + rates ---------------------------------------------
		let cfgN = 0;
		let rateN = 0;
		for (const [, cid] of catId) {
			let cfg = await tDb.query.categoryCommissionConfigs.findFirst({
				where: (c, { eq }) => eq(c.categoryId, cid),
			});
			if (!cfg && apply) {
				const [c] = await tDb
					.insert(categoryCommissionConfigs)
					.values({
						categoryId: cid,
						paymentType: "variable",
						isConditional: false,
						maxCoaches: 1,
						isActive: true,
					})
					.returning();
				cfg = c;
				cfgN++;
			}
			if (!cfg) continue;

			const slot = await tDb.query.commissionCoachSlots.findFirst({
				where: (sl, { and, eq }) =>
					and(eq(sl.configId, cfg!.id), eq(sl.slotIndex, 0)),
			});
			if (!slot && apply)
				await tDb.insert(commissionCoachSlots).values({
					configId: cfg.id,
					slotIndex: 0,
					label: "Primary",
					weightageBasisPoints: 10000,
				});

			for (const t of TIERS) {
				const tid = tierId.get(t.name.toLowerCase());
				if (!tid) continue;
				const ex = await tDb.query.commissionTierRates.findFirst({
					where: (r, { and, eq }) =>
						and(eq(r.configId, cfg!.id), eq(r.trainerTierId, tid)),
				});
				if (!ex && apply) {
					await tDb
						.insert(commissionTierRates)
						.values({ configId: cfg.id, trainerTierId: tid, amount: t.rateBp });
					rateN++;
				}
			}
		}
		console.log(`configs created: ${cfgN}   tier rates created: ${rateN}`);
		console.log(
			apply ? "\n=== P7 APPLIED ===" : "\n(dry run — pass --apply to write)",
		);
	} finally {
		await tPool.end();
		await cpPool.end();
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("P7-ERROR", e);
		process.exit(1);
	});
