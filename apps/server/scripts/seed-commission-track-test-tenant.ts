/**
 * Seed script: insert one org-scoped on_sale / sales / net_order commission track
 * for the Test Fitness Franchise tenant (id: 996febce-aaad-4ded-8f47-02d2b566c8ee).
 *
 * Idempotent: skips if an active org-scoped on_sale track already exists.
 *
 * Rate: 1000 bps (10 %) via commission_track_rates.
 * The rate row requires a tierId FK → trainer_tiers. We pick the first tier in
 * the tenant DB; the gather logic in commission-calculator.service.ts takes the
 * first rate row without filtering by tier, so any tier is valid.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/seed-commission-track-test-tenant.ts
 */

import { decrypt } from "@avantej-core/db";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { eq, and } from "drizzle-orm";
import { commissionTracks } from "@avantej-core/db/schema/tenant/commission-tracks";
import { commissionTrackRates } from "@avantej-core/db/schema/tenant/commission-track-rates";
import { commissionTrackVersions } from "@avantej-core/db/schema/tenant/commission-track-versions";
import { trainerTiers } from "@avantej-core/db/schema/tenant/trainer-tiers";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { getControlPanelDb } from "../src/lib/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_ORG_ID = "996febce-aaad-4ded-8f47-02d2b566c8ee";

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const eqIdx = trimmed.indexOf("=");
			if (eqIdx < 0) continue;
			const key = trimmed.slice(0, eqIdx).trim();
			const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
			process.env[key] = value;
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

loadDevVars();

async function main() {
	console.log("Seed: on_sale commission track for test tenant");
	console.log("Org:", TEST_ORG_ID);

	// ── 1. Resolve tenant connection string ──────────────────────────────────
	const controlPanelDb = getControlPanelDb();
	const [org] = await controlPanelDb
		.select({ connectionString: organizations.connectionString })
		.from(organizations)
		.where(eq(organizations.id, TEST_ORG_ID))
		.limit(1);

	if (!org) {
		console.error("ERROR: org not found in control panel DB");
		process.exit(1);
	}

	const connectionString = decrypt(org.connectionString);
	const pool = new Pool({ connectionString });
	const tenantDb = drizzle({ client: pool, schema: tenantSchema });

	try {
		// ── 2. Guard: if an org-scoped on_sale track already exists (active OR
		// inactive), reactivate it rather than inserting a duplicate. ──
		const existing = await tenantDb
			.select({ id: commissionTracks.id, isActive: commissionTracks.isActive })
			.from(commissionTracks)
			.where(
				and(
					eq(commissionTracks.scope, "org"),
					eq(commissionTracks.trigger, "on_sale"),
				),
			)
			.limit(1);

		if (existing.length > 0) {
			const row = existing[0]!;
			if (!row.isActive) {
				await tenantDb
					.update(commissionTracks)
					.set({ isActive: true })
					.where(eq(commissionTracks.id, row.id));
				console.log(`Track ${row.id} reactivated (was inactive).`);
			} else {
				console.log(`Track already active (id: ${row.id}) — nothing to do.`);
			}
			return;
		}

		// ── 3. Find the first trainer tier (required FK for commission_track_rates) ──
		const [firstTier] = await tenantDb
			.select({ id: trainerTiers.id, name: trainerTiers.name })
			.from(trainerTiers)
			.limit(1);

		if (!firstTier) {
			console.error(
				"ERROR: no trainer_tiers rows found in tenant DB — cannot create rate row",
			);
			process.exit(1);
		}
		console.log(`Using tier: ${firstTier.name} (${firstTier.id})`);

		// ── 4. Insert commission_tracks row ──────────────────────────────────
		const [track] = await tenantDb
			.insert(commissionTracks)
			.values({
				scope: "org",
				roleType: "sales",
				trigger: "on_sale",
				basis: "net_order",
				paymentType: "variable",
				poolPolicy: "separate",
				maxBeneficiaries: 1,
				isActive: true,
				// categoryId left null = org-scoped (no category restriction)
			})
			.returning({ id: commissionTracks.id });

		if (!track) {
			console.error("ERROR: failed to insert commission_tracks row");
			process.exit(1);
		}
		console.log(`Inserted commission_tracks: ${track.id}`);

		// ── 5. Insert commission_track_rates row (1000 bps = 10 %) ───────────
		const [rateRow] = await tenantDb
			.insert(commissionTrackRates)
			.values({
				trackId: track.id,
				tierId: firstTier.id,
				amount: 1000, // 1000 basis points = 10 %
			})
			.returning({ id: commissionTrackRates.id });

		console.log(
			`Inserted commission_track_rates: ${rateRow?.id} (1000 bps = 10 %)`,
		);

		// ── 6. Insert commission_track_versions row (provenance) ─────────────
		const snapshot = {
			scope: "org",
			roleType: "sales",
			trigger: "on_sale",
			basis: "net_order",
			paymentType: "variable",
			rateBps: 1000,
			tierId: firstTier.id,
			tierName: firstTier.name,
		};

		const [versionRow] = await tenantDb
			.insert(commissionTrackVersions)
			.values({
				trackId: track.id,
				versionNumber: 1,
				snapshot,
			})
			.returning({ id: commissionTrackVersions.id });

		console.log(`Inserted commission_track_versions: ${versionRow?.id} (v1)`);

		console.log("\nDone. Track summary:");
		console.log(`  Track ID  : ${track.id}`);
		console.log(`  Scope     : org`);
		console.log(`  Trigger   : on_sale`);
		console.log(`  RoleType  : sales`);
		console.log(`  Basis     : net_order`);
		console.log(`  Rate      : 1000 bps (10 %)`);
		console.log(`  Tier used : ${firstTier.name}`);
	} finally {
		await pool.end();
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("ERROR:", err);
		process.exit(1);
	});
