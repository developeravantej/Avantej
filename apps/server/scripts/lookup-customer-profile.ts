/**
 * Look up a customer_profiles row by user email or user id.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/lookup-customer-profile.ts <orgSlug> <emailOrUserId>
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const m = trimmed.match(/^([^=]+)=(.*)$/);
			if (m?.[1] && m[2] !== undefined) {
				if (!process.env[m[1]]) process.env[m[1]] = m[2];
			}
		}
	} catch (err) {
		console.warn("Could not load .dev.vars:", err);
	}
}

async function main() {
	loadDevVars();
	const [orgSlug, emailOrUserId] = process.argv.slice(2);
	if (!orgSlug || !emailOrUserId) {
		console.error(
			"Usage: bun run scripts/lookup-customer-profile.ts <orgSlug> <emailOrUserId>",
		);
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const controlPool = new Pool({ connectionString: databaseUrl });
	const controlDb = drizzle({
		client: controlPool,
		schema: controlPanelSchema,
	});
	let tenantPool: Pool | null = null;

	try {
		// Resolve org
		const org = await controlDb.query.organizations.findFirst({
			where: (orgs, { eq }) => eq(orgs.slug, orgSlug),
		});
		if (!org) throw new Error(`Org not found: ${orgSlug}`);
		console.log(`📋 Org: ${org.name} (${org.id})`);

		// Resolve user (try email first, then id)
		const user =
			(await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.email, emailOrUserId),
			})) ??
			(await controlDb.query.users.findFirst({
				where: (u, { eq }) => eq(u.id, emailOrUserId),
			}));
		if (!user) {
			console.log(
				`❌ No user found with email or id "${emailOrUserId}"`,
			);
			return;
		}
		console.log("\n👤 User (control-panel):");
		console.log(`   id:    ${user.id}`);
		console.log(`   email: ${user.email}`);
		console.log(`   name:  ${user.name}`);

		// Tenant connection
		const tenantConn = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConn });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		// customer_profiles row
		const profile = await tenantDb.query.customerProfiles.findFirst({
			where: (p, { eq }) => eq(p.userId, user.id),
		});
		console.log("\n🪪 customer_profiles:");
		if (profile) {
			console.log(`   id:                    ${profile.id}`);
			console.log(`   user_id:               ${profile.userId}`);
			console.log(`   phone:                 ${profile.phone ?? "(null)"}`);
			console.log(`   gender:                ${profile.gender ?? "(null)"}`);
			console.log(`   address:               ${profile.address ?? "(null)"}`);
			console.log(
				`   emergencyContactName:  ${profile.emergencyContactName ?? "(null)"}`,
			);
			console.log(
				`   emergencyContactPhone: ${profile.emergencyContactPhone ?? "(null)"}`,
			);
			console.log(`   creditPoints:          ${profile.creditPoints}`);
			console.log(`   isDeleted:             ${profile.isDeleted}`);
			console.log(`   createdAt:             ${profile.createdAt}`);
			console.log(`   updatedAt:             ${profile.updatedAt}`);
		} else {
			console.log(
				`   ❌ No customer_profiles row for user_id "${user.id}"`,
			);
		}

		// Also check if there are any rows whose user_id LOOKS like this user but doesn't match
		const allRows = await tenantDb.query.customerProfiles.findMany();
		console.log(
			`\n   (total customer_profiles rows in tenant: ${allRows.length})`,
		);
		if (allRows.length > 0 && !profile) {
			console.log("   user_ids in table (first 5):");
			for (const r of allRows.slice(0, 5)) {
				console.log(`     ${r.userId}  phone=${r.phone ?? "(null)"}`);
			}
		}
	} finally {
		if (tenantPool) await tenantPool.end();
		await controlPool.end();
	}
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
