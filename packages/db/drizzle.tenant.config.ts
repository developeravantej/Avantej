import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/server/.env",
});

/**
 * Drizzle Configuration for Tenant Databases
 * 
 * This config is used to generate migrations for tenant databases,
 * which contain:
 * - hierarchy_nodes (5-level organizational hierarchy)
 * - members (organization members with roles and hierarchy scope)
 * - invitations (pending invitations to join organization)
 * 
 * Usage:
 * - Generate migrations: bun run drizzle-kit generate --config=drizzle.tenant.config.ts
 * - Apply migrations: Applied programmatically via migration runner (T038) when provisioning new tenants
 * 
 * Note: For development/testing, you can manually apply migrations:
 * bun run drizzle-kit push --config=drizzle.tenant.config.ts
 * 
 * Environment Variable:
 * - TENANT_DATABASE_URL: Connection string for dev tenant database (for local testing)
 */
export default defineConfig({
	schema: "./src/schema/tenant-schema.ts",
	out: "./src/migrations/tenant",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.TENANT_DATABASE_URL || "",
	},
});

