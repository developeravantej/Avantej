import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/server/.env",
});

/**
 * Drizzle Configuration for Control Panel Database
 * 
 * This config is used to generate and apply migrations for the control panel database,
 * which contains:
 * - Better-Auth tables (users, sessions, accounts, verifications)
 * - Control panel tables (subscriptions, organizations, organization_members, platform_admins, admin_sessions)
 * 
 * Usage:
 * - Generate migrations: bun run drizzle-kit generate --config=drizzle.control-panel.config.ts
 * - Apply migrations: bun run drizzle-kit push --config=drizzle.control-panel.config.ts
 */
export default defineConfig({
	schema: "./src/schema/control-panel-schema.ts",
	out: "./src/migrations/control-panel",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL || "",
	},
});

