/**
 * Script: Migrate and Seed All Existing Tenant Databases
 *
 * Applies pending migrations and seeds RBAC data for all existing tenants.
 * Supports parallel execution, version tracking, and filtering.
 *
 * Usage:
 *   cd apps/server
 *   bun run scripts/migrate-all-tenants.ts [options]
 *
 * Options:
 *   --dry-run          List tenants and their current versions without migrating
 *   --concurrency=N    Number of tenants to migrate in parallel (default: 5)
 *   --filter=slug      Only migrate tenants matching the slug pattern
 */

import {
	decrypt,
	runTenantMigrations,
	seedRBACData,
	LATEST_MIGRATION_VERSION,
} from "@avantej-core/db";
import { getControlPanelDb } from "../src/lib/db";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI argument parsing
interface CliOptions {
	dryRun: boolean;
	concurrency: number;
	filter: string | null;
}

function parseArgs(): CliOptions {
	const args = process.argv.slice(2);
	const options: CliOptions = {
		dryRun: false,
		concurrency: 5,
		filter: null,
	};

	for (const arg of args) {
		if (arg === "--dry-run") {
			options.dryRun = true;
		} else if (arg.startsWith("--concurrency=")) {
			const concurrencyValue = arg.split("=")[1];
			if (concurrencyValue) {
				const value = parseInt(concurrencyValue, 10);
				if (!isNaN(value) && value > 0) {
					options.concurrency = value;
				}
			}
		} else if (arg.startsWith("--filter=")) {
			options.filter = arg.split("=")[1] ?? null;
		}
	}

	return options;
}

// Load environment variables from .dev.vars
function loadDevVars(): void {
	try {
		const devVarsPath = join(__dirname, "../.dev.vars");
		const content = readFileSync(devVarsPath, "utf-8");

		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			const [key, ...valueParts] = trimmed.split("=");
			if (key && valueParts.length > 0) {
				const value = valueParts.join("=").trim();
				// Remove quotes if present
				const cleanValue = value.replace(/^["']|["']$/g, "");
				process.env[key.trim()] = cleanValue;
			}
		}
	} catch (error) {
		console.warn("Could not load .dev.vars file:", error);
	}
}

// Load env vars before running
loadDevVars();

type OrganizationRecord = {
	id: string;
	name: string;
	slug: string;
	neonProjectId: string;
	connectionString: string;
	schemaVersion: string | null;
};

interface MigrationResult {
	organizationId: string;
	organizationName: string;
	slug: string;
	success: boolean;
	previousVersion: string | null;
	newVersion: string | null;
	error?: string;
}

/**
 * Migrate a single tenant
 */
async function migrateOneTenant(
	organization: OrganizationRecord,
	controlPanelDb: ReturnType<typeof getControlPanelDb>,
): Promise<MigrationResult> {
	const result: MigrationResult = {
		organizationId: organization.id,
		organizationName: organization.name,
		slug: organization.slug,
		success: false,
		previousVersion: organization.schemaVersion,
		newVersion: null,
	};

	try {
		// Decrypt connection string
		const connectionString = decrypt(organization.connectionString);

		// Step 1: Run migrations (idempotent - only applies missing ones)
		const finalVersion = await runTenantMigrations(connectionString);
		result.newVersion = finalVersion;

		// Step 2: Seed RBAC data (idempotent - skips existing data)
		const tenantPool = new Pool({ connectionString });
		const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });
		await seedRBACData(tenantDb);
		await tenantPool.end();

		// Step 3: Update schemaVersion in control panel
		await controlPanelDb
			.update(organizations)
			.set({ schemaVersion: finalVersion })
			.where(eq(organizations.id, organization.id));

		result.success = true;
	} catch (error) {
		result.error =
			error instanceof Error ? error.message : "Unknown error";
	}

	return result;
}

/**
 * Process tenants in batches with concurrency
 */
async function processBatches(
	orgs: OrganizationRecord[],
	controlPanelDb: ReturnType<typeof getControlPanelDb>,
	concurrency: number,
): Promise<MigrationResult[]> {
	const results: MigrationResult[] = [];

	for (let i = 0; i < orgs.length; i += concurrency) {
		const batch = orgs.slice(i, i + concurrency);
		const batchNumber = Math.floor(i / concurrency) + 1;
		const totalBatches = Math.ceil(orgs.length / concurrency);

		console.log(
			`\nProcessing batch ${batchNumber}/${totalBatches} (${batch.length} tenant(s))...`,
		);

		const batchResults = await Promise.allSettled(
			batch.map((org) => migrateOneTenant(org, controlPanelDb)),
		);

		for (const settled of batchResults) {
			if (settled.status === "fulfilled") {
				const result = settled.value;
				results.push(result);

				if (result.success) {
					console.log(
						`   [OK] ${result.organizationName} (${result.slug}): ${result.previousVersion || "none"} -> ${result.newVersion}`,
					);
				} else {
					console.log(
						`   [FAIL] ${result.organizationName} (${result.slug}): ${result.error}`,
					);
				}
			} else {
				console.log(`   [ERROR] Unexpected error: ${settled.reason}`);
			}
		}
	}

	return results;
}

async function migrateAllTenants(options: CliOptions) {
	const controlPanelDb = getControlPanelDb();

	console.log(`\nTenant Database Migration Tool`);
	console.log(`==============================`);
	console.log(`Latest migration version: ${LATEST_MIGRATION_VERSION}`);
	console.log(`Concurrency: ${options.concurrency}`);
	console.log(`Dry run: ${options.dryRun}`);
	if (options.filter) {
		console.log(`Filter: ${options.filter}`);
	}

	// Get all organizations
	let allOrgs = await controlPanelDb.query.organizations.findMany({
		orderBy: (orgs, { desc }) => desc(orgs.createdAt),
	});

	// Apply filter if specified
	if (options.filter) {
		allOrgs = allOrgs.filter((org) => org.slug.includes(options.filter!));
	}

	if (allOrgs.length === 0) {
		console.log("\nNo organizations found.");
		return;
	}

	console.log(`\nFound ${allOrgs.length} organization(s)`);

	// Dry run: just list tenants and their versions
	if (options.dryRun) {
		console.log(`\n--- Dry Run: Tenant Schema Versions ---\n`);
		console.log(
			`${"Name".padEnd(30)} | ${"Slug".padEnd(20)} | ${"Current Version".padEnd(20)} | Status`,
		);
		console.log(`${"-".repeat(30)} | ${"-".repeat(20)} | ${"-".repeat(20)} | ------`);

		for (const org of allOrgs) {
			const currentVersion = org.schemaVersion || "unknown";
			const needsMigration = currentVersion !== LATEST_MIGRATION_VERSION;
			const status = needsMigration ? "needs migration" : "up to date";
			console.log(
				`${org.name.padEnd(30).slice(0, 30)} | ${org.slug.padEnd(20).slice(0, 20)} | ${currentVersion.padEnd(20)} | ${status}`,
			);
		}

		const needsMigration = allOrgs.filter(
			(org) => org.schemaVersion !== LATEST_MIGRATION_VERSION,
		);
		console.log(
			`\nSummary: ${needsMigration.length} of ${allOrgs.length} tenant(s) need migration`,
		);
		return;
	}

	// Run migrations
	console.log(`\nStarting migrations...`);
	const results = await processBatches(
		allOrgs,
		controlPanelDb,
		options.concurrency,
	);

	// Summary
	const successful = results.filter((r) => r.success).length;
	const failed = results.filter((r) => !r.success).length;

	console.log(`\n--- Migration Summary ---`);
	console.log(`Total: ${results.length}`);
	console.log(`Successful: ${successful}`);
	console.log(`Failed: ${failed}`);

	if (failed > 0) {
		console.log(`\nFailed tenants:`);
		for (const result of results.filter((r) => !r.success)) {
			console.log(`  - ${result.organizationName} (${result.slug}): ${result.error}`);
		}
	}
}

const options = parseArgs();

migrateAllTenants(options)
	.then(() => {
		console.log("\nDone!");
		process.exit(0);
	})
	.catch((error) => {
		console.error("\nError:", error);
		process.exit(1);
	});
