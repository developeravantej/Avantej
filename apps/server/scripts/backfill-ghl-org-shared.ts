/**
 * Backfill script for org-shared GHL tenants connected BEFORE the round-trip
 * fix. Two parts:
 *
 *   1. PROVISION — for an org-shared tenant whose organizations row predates the
 *      fix: ensure the global custom fields exist and persist their ids into
 *      ghlGlobalFieldMap (was discarded at connect), and generate a
 *      ghlWebhookSecret if missing. Without this, outbound never stamps
 *      gender/emergency/designated_* and inbound auth has no secret.
 *
 *   2. RE-STAMP — re-run syncCustomerToGhl(update) for every linked contact so
 *      the now-wired custom fields (incl. designated_country/designated_branch)
 *      land on existing contacts. Rate-limited (GHL: 100 req/10s per location).
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/backfill-ghl-org-shared.ts --tenant "<name>" --dry-run
 *   bun run scripts/backfill-ghl-org-shared.ts --tenant "<name>" --provision-only
 *   bun run scripts/backfill-ghl-org-shared.ts --tenant "<name>"   # provision + re-stamp
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { ghlBranchLinks } from "@avantej-core/db/schema/control-panel/ghl-branch-links";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { ghlContactLinks } from "@avantej-core/db/schema/tenant/ghl-contact-links";
import { members } from "@avantej-core/db/schema/tenant/members";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import { ensureCustomFieldsExist } from "../src/services/ghl/setup";
import { syncCustomerToGhl } from "../src/services/ghl/sync-customer";

neonConfig.webSocketConstructor = ws;

const SLEEP_MS = 150; // ~6.6 contacts/s → well under 100 req/10s per location
const sleep = (ms: number) =>
	new Promise<void>((r) => setTimeout(() => r(), ms));

function parseArgs() {
	const args = process.argv.slice(2);
	const ti = args.indexOf("--tenant");
	if (ti === -1 || !args[ti + 1]) {
		console.error(
			'Usage: bun run backfill-ghl-org-shared.ts --tenant "<name>" [--dry-run] [--provision-only]',
		);
		process.exit(1);
	}
	return {
		tenant: args[ti + 1]!,
		dryRun: args.includes("--dry-run"),
		provisionOnly: args.includes("--provision-only"),
	};
}

async function main() {
	const { tenant, dryRun, provisionOnly } = parseArgs();
	const cpUrl = process.env.DATABASE_URL;
	if (!cpUrl) throw new Error("DATABASE_URL not set");

	const cpPool = new Pool({ connectionString: cpUrl });
	const cpDb = drizzle({ client: cpPool, schema: controlPanelSchema });

	const org = await cpDb.query.organizations.findFirst({
		where: eq(organizations.name, tenant),
	});
	if (!org) {
		await cpPool.end();
		throw new Error(`Tenant not found: ${tenant}`);
	}
	console.log(`\nTenant: ${org.name} (${org.id})`);
	console.log(`Sync model: ${org.ghlSyncModel ?? "NULL"}`);
	if (
		org.ghlSyncModel !== "org-shared" ||
		!org.ghlLocationId ||
		!org.ghlApiKeyEncrypted
	) {
		await cpPool.end();
		throw new Error("Tenant is not a provisioned org-shared GHL connection.");
	}

	const apiKey = decrypt(org.ghlApiKeyEncrypted);

	// ── Part 1: PROVISION ────────────────────────────────────────────────
	const hasGlobalMap =
		org.ghlGlobalFieldMap &&
		Object.keys(org.ghlGlobalFieldMap as Record<string, unknown>).length > 0;
	const hasSecret = !!org.ghlWebhookSecret;
	console.log(
		`\n[provision] ghlGlobalFieldMap=${hasGlobalMap ? "present" : "MISSING"}  ghlWebhookSecret=${hasSecret ? "present" : "MISSING"}`,
	);

	if (dryRun) {
		console.log("  🔍 DRY RUN — would ensure fields + persist ids + secret.");
	} else if (!hasGlobalMap || !hasSecret) {
		const globalFieldIds = await ensureCustomFieldsExist({
			apiKey,
			locationId: org.ghlLocationId,
		});
		// Reuse an existing secret so GHL never needs reconfiguring:
		//   (1) the org row, (2) a prior per-branch link's secret (GHL is already
		//   configured with it), else (3) generate a fresh one.
		let webhookSecret = org.ghlWebhookSecret ?? null;
		if (!webhookSecret) {
			const linkRows = await cpDb
				.select({ secret: ghlBranchLinks.webhookSecret })
				.from(ghlBranchLinks)
				.where(eq(ghlBranchLinks.organizationId, org.id));
			webhookSecret = linkRows.find((r) => r.secret)?.secret ?? null;
		}
		if (!webhookSecret) {
			webhookSecret = `ghlwh_${crypto.randomUUID().replace(/-/g, "")}${crypto
				.randomUUID()
				.replace(/-/g, "")}`;
		}
		await cpDb
			.update(organizations)
			.set({
				ghlGlobalFieldMap: globalFieldIds,
				ghlWebhookSecret: webhookSecret,
				updatedAt: new Date(),
			})
			.where(eq(organizations.id, org.id));
		console.log(
			`  ✅ persisted ${Object.keys(globalFieldIds).length} field ids + webhook secret.`,
		);
		if (!hasSecret) {
			console.log(
				`\n  ℹ️  Org webhook secret (ensure GHL's webhook automation sends it):\n     ${webhookSecret}\n`,
			);
		}
	} else {
		console.log("  ✓ already provisioned — nothing to do.");
	}

	if (provisionOnly) {
		await cpPool.end();
		console.log("\n--provision-only: done.");
		return;
	}

	// ── Part 2: RE-STAMP contacts ────────────────────────────────────────
	let tenantConn: string;
	try {
		tenantConn = decrypt(org.connectionString);
	} catch {
		tenantConn = org.connectionString;
	}
	const tPool = new Pool({ connectionString: tenantConn });
	const tDb = drizzle({ client: tPool, schema: tenantSchema });

	const links = await tDb
		.select()
		.from(ghlContactLinks)
		.where(eq(ghlContactLinks.syncStatus, "active"));
	console.log(`\n[re-stamp] ${links.length} active linked contact(s).`);

	if (dryRun) {
		console.log("  🔍 DRY RUN — would re-sync each contact. No GHL calls.");
		await tPool.end();
		await cpPool.end();
		return;
	}

	let synced = 0;
	let skipped = 0;
	let errored = 0;
	for (const link of links) {
		if (!link.customerProfileId) {
			skipped++;
			continue;
		}
		const [profile] = await tDb
			.select()
			.from(customerProfiles)
			.where(eq(customerProfiles.id, link.customerProfileId))
			.limit(1);
		if (!profile) {
			skipped++;
			continue;
		}
		const [member] = await tDb
			.select()
			.from(members)
			.where(and(eq(members.userId, link.userId), eq(members.role, "client")))
			.limit(1);
		if (!member) {
			skipped++;
			continue;
		}
		const [u] = await cpDb
			.select()
			.from(userTable)
			.where(eq(userTable.id, link.userId))
			.limit(1);
		if (!u) {
			skipped++;
			continue;
		}

		const result = await syncCustomerToGhl({
			controlPanelDb: cpDb,
			tenantDb: tDb,
			organizationId: org.id,
			branchNodeId: member.hierarchyScopeId,
			customerProfile: profile as never,
			user: {
				id: u.id,
				email: u.email,
				firstName: u.firstName,
				lastName: u.lastName,
				name: u.name,
			},
			memberStatus: member.status === "active" ? "active" : "inactive",
			operation: "update",
			decryptApiKey: decrypt,
		});
		if (result.status === "synced") synced++;
		else if (result.status === "skipped") skipped++;
		else {
			errored++;
			console.log(`  ❌ ${link.customerProfileId}: ${result.error}`);
		}
		await sleep(SLEEP_MS);
	}

	console.log(
		`\nSummary: ${synced} synced, ${skipped} skipped, ${errored} error(s)`,
	);
	await tPool.end();
	await cpPool.end();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
