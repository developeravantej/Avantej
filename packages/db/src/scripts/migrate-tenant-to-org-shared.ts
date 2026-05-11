/**
 * Migrate a single tenant from per-branch GHL sync model to org-shared.
 *
 * Picks the active ghl_branch_links row (or one specified by --branch <uuid>)
 * to source the locationId + apiKey, copies them up to the organizations
 * row, sets ghl_sync_model = 'org-shared', and seeds an empty
 * ghl_country_field_map. The legacy branch_links row stays in place but is
 * marked is_active = false so it won't be picked up by the old code path.
 *
 * Existing ghl_contact_links / ghl_user_links rows remain intact. On the
 * NEXT contact/staff sync for each of them, the new orchestrator
 * (Phase G.4b) will re-route through the org-shared path automatically.
 *
 * Country custom fields + branch dropdown options are created lazily by
 * the new orchestrator on first sync, so no immediate GHL API calls are
 * needed.
 *
 * Usage:
 *   bun run migrate-tenant-to-org-shared.ts --tenant "<name>" --dry-run
 *   bun run migrate-tenant-to-org-shared.ts --tenant "<name>"
 *   bun run migrate-tenant-to-org-shared.ts --tenant "<name>" --branch <uuid>
 */
import { Pool } from "@neondatabase/serverless";
import { decrypt } from "../lib/encryption";

interface CliArgs {
	tenant: string;
	dryRun: boolean;
	branchHint?: string;
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2);
	const tenantIdx = args.indexOf("--tenant");
	if (tenantIdx === -1 || !args[tenantIdx + 1]) {
		console.error(
			'Usage: bun run migrate-tenant-to-org-shared.ts --tenant "<name>" [--dry-run] [--branch <uuid>]',
		);
		process.exit(1);
	}
	const branchIdx = args.indexOf("--branch");
	return {
		tenant: args[tenantIdx + 1]!,
		dryRun: args.includes("--dry-run"),
		branchHint:
			branchIdx !== -1 && args[branchIdx + 1] ? args[branchIdx + 1]! : undefined,
	};
}

async function main() {
	const { tenant, dryRun, branchHint } = parseArgs();
	const controlPanelUrl = process.env.DATABASE_URL;
	if (!controlPanelUrl) throw new Error("DATABASE_URL not set");

	const cp = new Pool({ connectionString: controlPanelUrl });
	const client = await cp.connect();

	try {
		await client.query("BEGIN");

		// 1. Find the org
		const orgRes = await client.query(
			"SELECT id, name, ghl_sync_model FROM organizations WHERE name = $1",
			[tenant],
		);
		if (orgRes.rows.length === 0) {
			throw new Error(`Tenant not found: ${tenant}`);
		}
		const org = orgRes.rows[0];
		console.log(`\nTenant: ${org.name} (${org.id})`);
		console.log(`Current ghl_sync_model: ${org.ghl_sync_model ?? "NULL"}`);

		if (org.ghl_sync_model === "org-shared") {
			console.log(
				"⚠️  Already on org-shared model. Nothing to do (rolling back).",
			);
			await client.query("ROLLBACK");
			return;
		}

		// 2. Pick the source branch_link
		const branchQuery = branchHint
			? "SELECT * FROM ghl_branch_links WHERE organization_id = $1 AND tenant_branch_id = $2"
			: "SELECT * FROM ghl_branch_links WHERE organization_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1";
		const branchRes = await client.query(
			branchQuery,
			branchHint ? [org.id, branchHint] : [org.id],
		);
		if (branchRes.rows.length === 0) {
			throw new Error(
				`No suitable ghl_branch_links row found for tenant (hint=${branchHint ?? "none"})`,
			);
		}
		const link = branchRes.rows[0];
		console.log(
			`\nSource branch_link: id=${link.id.slice(0, 8)} location=${link.ghl_location_id} tenant_branch=${link.tenant_branch_id.slice(0, 8)}`,
		);

		// 3. Sanity: decrypt the API key
		try {
			const apiKey = decrypt(link.ghl_api_key);
			console.log(
				`API key decrypts OK (${apiKey.slice(0, 6)}…${apiKey.slice(-4)})`,
			);
		} catch (err) {
			throw new Error(
				`Failed to decrypt branch_link.ghl_api_key: ${err instanceof Error ? err.message : err}`,
			);
		}

		// 4. Update organizations row
		const now = new Date();
		await client.query(
			`UPDATE organizations SET
			   ghl_location_id = $1,
			   ghl_api_key_encrypted = $2,
			   ghl_country_field_map = '{}'::jsonb,
			   ghl_provisioned_at = $3,
			   ghl_sync_model = 'org-shared',
			   updated_at = $3
			 WHERE id = $4`,
			[link.ghl_location_id, link.ghl_api_key, now, org.id],
		);
		console.log("\n✅ organizations row updated:");
		console.log(`   ghl_sync_model       → org-shared`);
		console.log(`   ghl_location_id      → ${link.ghl_location_id}`);
		console.log(`   ghl_api_key_encrypted → (copied from branch_link)`);
		console.log(`   ghl_country_field_map → {}`);
		console.log(`   ghl_provisioned_at   → ${now.toISOString()}`);

		// 5. Deactivate the legacy branch_link (keeps history, prevents conflict)
		await client.query(
			"UPDATE ghl_branch_links SET is_active = false, updated_at = $1 WHERE organization_id = $2",
			[now, org.id],
		);
		console.log(
			"\n✅ ghl_branch_links row(s) deactivated (is_active=false)",
		);

		if (dryRun) {
			console.log("\n🔍 DRY RUN — rolling back.");
			await client.query("ROLLBACK");
		} else {
			await client.query("COMMIT");
			console.log("\n✅ Committed.");
			console.log(
				"\nNext: country custom fields + branch dropdown options are\n  created lazily by the new sync orchestrator on the next contact/\n  staff sync. To force-warm them, call branch-sync for each branch via\n  the hierarchy router (e.g. a trivial branch update) or write a one-\n  off warm-up script.",
			);
		}
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(
			`\n❌ Aborted: ${err instanceof Error ? err.message : err}`,
		);
		process.exit(1);
	} finally {
		client.release();
		await cp.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
