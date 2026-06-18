/**
 * Diagnose missing packages/payments for a customer by name search.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/check-customer-packages.ts <orgSlug> <nameFragment>
 *
 * Example:
 *   bun run scripts/check-customer-packages.ts test-fitness-franchise "Bryan"
 */

import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { ilike, eq } from "drizzle-orm";
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
	const [orgSlug, nameFragment] = process.argv.slice(2);
	if (!orgSlug || !nameFragment) {
		console.error(
			"Usage: bun run scripts/check-customer-packages.ts <orgSlug> <nameFragment>",
		);
		process.exit(1);
	}

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error("DATABASE_URL is required");

	const { user: userTable } = controlPanelSchema;
	const { packageInstances, payments, services } = tenantSchema;

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
		console.log(`📋 Org: ${org.name} (${org.id})\n`);

		// Find user by name (control panel)
		const matchingUsers = await controlDb
			.select({
				id: userTable.id,
				name: userTable.name,
				email: userTable.email,
			})
			.from(userTable)
			.where(ilike(userTable.name, `%${nameFragment}%`))
			.limit(5);

		if (matchingUsers.length === 0) {
			console.log(`❌ No control-panel user found matching "${nameFragment}"`);
			return;
		}

		// Tenant connection
		const tenantConn = decrypt(org.connectionString);
		tenantPool = new Pool({ connectionString: tenantConn });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

		for (const u of matchingUsers) {
			console.log(`👤 User: ${u.name} (${u.email})`);
			console.log(`   control-panel userId: ${u.id}`);

			// Find member row
			const member = await tenantDb.query.members.findFirst({
				where: (m, { eq }) => eq(m.userId, u.id),
			});

			if (!member) {
				console.log(`   ❌ No member row in tenant DB for userId ${u.id}\n`);
				continue;
			}

			console.log(`   members.id (memberId): ${member.id}`);
			console.log(`   members.userId:        ${member.userId}`);
			console.log(`   members.role:          ${member.role}`);
			console.log(`   members.status:        ${member.status}`);

			// Check packages — using userId (as the service does)
			const pkgs = await tenantDb
				.select({
					id: packageInstances.id,
					clientId: packageInstances.clientId,
					status: packageInstances.status,
					serviceName: services.name,
					creditsTotal: packageInstances.creditsTotal,
					creditsUsed: packageInstances.creditsUsed,
					expiresAt: packageInstances.expiresAt,
					createdAt: packageInstances.createdAt,
				})
				.from(packageInstances)
				.leftJoin(services, eq(packageInstances.serviceId, services.id))
				.where(eq(packageInstances.clientId, u.id));

			console.log(`\n   📦 Packages (queried by clientId = userId "${u.id}"):`);
			if (pkgs.length === 0) {
				console.log("      ❌ None found");
				// Try querying by member.id to check if the ID was stored wrong
				const pkgsByMemberId = await tenantDb
					.select({
						id: packageInstances.id,
						clientId: packageInstances.clientId,
					})
					.from(packageInstances)
					.where(eq(packageInstances.clientId, member.id));
				if (pkgsByMemberId.length > 0) {
					console.log(
						`      ⚠️  BUT found ${pkgsByMemberId.length} package(s) with clientId = members.id ("${member.id}")`,
					);
					console.log(
						"         → Packages were stored with the wrong ID (member.id instead of member.userId)",
					);
					for (const p of pkgsByMemberId) {
						console.log(`         id=${p.id}, clientId=${p.clientId}`);
					}
				}
			} else {
				for (const p of pkgs) {
					console.log(`      ✅ id=${p.id}`);
					console.log(
						`         service=${p.serviceName ?? "(no service name)"}, status=${p.status}`,
					);
					console.log(
						`         credits=${p.creditsUsed}/${p.creditsTotal}, expires=${p.expiresAt}`,
					);
				}
			}

			// Check payments — using userId
			const pmts = await tenantDb
				.select({
					id: payments.id,
					customerId: payments.customerId,
					status: payments.status,
					totalAmount: payments.totalAmount,
					createdAt: payments.createdAt,
				})
				.from(payments)
				.where(eq(payments.customerId, u.id))
				.limit(10);

			console.log(
				`\n   💳 Payments (queried by customerId = userId "${u.id}"):`,
			);
			if (pmts.length === 0) {
				console.log("      ❌ None found");
				// Try querying by member.id
				const pmtsByMemberId = await tenantDb
					.select({ id: payments.id, customerId: payments.customerId })
					.from(payments)
					.where(eq(payments.customerId, member.id))
					.limit(5);
				if (pmtsByMemberId.length > 0) {
					console.log(
						`      ⚠️  BUT found ${pmtsByMemberId.length} payment(s) with customerId = members.id ("${member.id}")`,
					);
					console.log(
						"         → Payments were stored with the wrong ID (member.id instead of member.userId)",
					);
				}
			} else {
				for (const p of pmts) {
					console.log(
						`      ✅ id=${p.id}, status=${p.status}, amount=${p.totalAmount}, created=${p.createdAt}`,
					);
				}
			}

			console.log("\n" + "─".repeat(60) + "\n");
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
