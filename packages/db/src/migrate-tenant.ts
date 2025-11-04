/**
 * Tenant Database Migration Runner
 *
 * Applies tenant schema migrations to newly provisioned Neon projects.
 * This runs programmatically when a new tenant database is created.
 *
 * Migrations are embedded as SQL strings (Cloudflare Workers compatible).
 * Each migration follows the pattern: NNNN_description
 *
 * Usage:
 * ```typescript
 * import { runTenantMigrations } from "@avantej-core/db/migrate-tenant";
 *
 * await runTenantMigrations(connectionString);
 * ```
 *
 * Process:
 * 1. Creates migrations tracking table if it doesn't exist
 * 2. Executes migrations in order
 * 3. Tracks applied migrations to avoid re-running
 */

import { neon } from "@neondatabase/serverless";

/**
 * Type for Neon SQL query function
 * Use a more flexible type to avoid strict generic type inference issues
 */
type NeonSQL = ReturnType<typeof neon> & {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

/**
 * Tenant migration SQL (embedded for Cloudflare Workers compatibility)
 * Migration: 0000_noisy_aqueduct
 * Creates initial tenant schema: hierarchy_nodes, members, invitations
 */
const MIGRATION_0000_NOISY_AQUEDUCT = `
CREATE TABLE "hierarchy_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"depth" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"hierarchy_scope_id" uuid NOT NULL,
	"status" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"invited_by" text NOT NULL,
	"role" text NOT NULL,
	"hierarchy_scope_id" uuid NOT NULL,
	"token" text NOT NULL,
	"status" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD CONSTRAINT "hierarchy_nodes_parent_id_hierarchy_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_hierarchy_scope_id_hierarchy_nodes_id_fk" FOREIGN KEY ("hierarchy_scope_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_hierarchy_scope_id_hierarchy_nodes_id_fk" FOREIGN KEY ("hierarchy_scope_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hierarchy_parent_idx" ON "hierarchy_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "hierarchy_type_idx" ON "hierarchy_nodes" USING btree ("type");--> statement-breakpoint
CREATE INDEX "hierarchy_depth_idx" ON "hierarchy_nodes" USING btree ("depth");--> statement-breakpoint
CREATE UNIQUE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "members_hierarchy_idx" ON "members" USING btree ("hierarchy_scope_id");--> statement-breakpoint
CREATE INDEX "members_role_idx" ON "members" USING btree ("role");--> statement-breakpoint
CREATE INDEX "members_status_idx" ON "members" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invitations_email_status_idx" ON "invitations" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "invitations_expires_idx" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "invitations_invited_by_idx" ON "invitations" USING btree ("invited_by");
`;

/**
 * List of tenant migrations in order
 * Add new migrations here as they are created
 */
const TENANT_MIGRATIONS = [
  {
    hash: "0000_noisy_aqueduct",
    sql: MIGRATION_0000_NOISY_AQUEDUCT,
  },
] as const;

/**
 * SQL to create migrations tracking table
 */
const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS drizzle_migrations_hash_idx ON drizzle_migrations(hash);
`;

/**
 * Parse SQL migration file and split into individual statements
 * Drizzle migrations use '--> statement-breakpoint' as separators
 */
function parseMigrationSQL(sql: string): string[] {
  // Split by statement breakpoint, filter out empty strings and comments
  return sql
    .split("--> statement-breakpoint")
    .map((stmt) => stmt.trim())
    .filter((stmt) => {
      // Filter out empty statements and pure comment lines
      const cleaned = stmt.replace(/--.*$/gm, "").trim();
      return cleaned.length > 0;
    });
}

/**
 * Check if migration has already been applied
 */
async function isMigrationApplied(
  sql: NeonSQL,
  hash: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT 1 FROM drizzle_migrations WHERE hash = ${hash} LIMIT 1
    `;
    // Handle different return types from Neon
    const rows = Array.isArray(result) ? result : [];
    return rows.length > 0;
  } catch {
    // If table doesn't exist or query fails, assume not applied
    return false;
  }
}

/**
 * Execute raw SQL statement using Neon client
 * Uses type assertion to bypass strict template literal typing for raw SQL
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeRawSQL(sql: NeonSQL, sqlString: string): Promise<void> {
  // Neon expects template literals, but we need to execute raw SQL strings
  // Use type assertion to work around TypeScript's strict typing
  await (sql as unknown as (query: string) => Promise<unknown>)(sqlString);
}

/**
 * Mark migration as applied
 */
async function markMigrationApplied(sql: NeonSQL, hash: string): Promise<void> {
  await sql`
    INSERT INTO drizzle_migrations (hash) VALUES (${hash})
    ON CONFLICT (hash) DO NOTHING
  `;
}

/**
 * Run all tenant migrations on a newly created database
 *
 * @param connectionString - PostgreSQL connection string for the tenant database
 * @throws Error if migrations fail
 */
export async function runTenantMigrations(
  connectionString: string
): Promise<void> {
  if (!connectionString) {
    throw new Error("Connection string is required");
  }

  // Create Neon SQL client
  const sql = neon(connectionString) as NeonSQL;

  try {
    // Step 1: Ensure migrations tracking table exists
    // Execute raw SQL by splitting into statements and executing each
    const createTableStatements = CREATE_MIGRATIONS_TABLE_SQL.trim()
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const statement of createTableStatements) {
      if (statement.trim()) {
        await executeRawSQL(sql, statement);
      }
    }

    // Step 2: Execute each migration in order
    for (const migration of TENANT_MIGRATIONS) {
      const { hash, sql: migrationSQL } = migration;

      // Skip if already applied
      if (await isMigrationApplied(sql, hash)) {
        console.log(`Skipping already applied migration: ${hash}`);
        continue;
      }

      console.log(`Applying migration: ${hash}`);

      // Parse into individual statements
      const statements = parseMigrationSQL(migrationSQL);

      // Execute each statement
      for (const statement of statements) {
        if (statement.trim()) {
          await executeRawSQL(sql, statement);
        }
      }

      // Mark migration as applied
      await markMigrationApplied(sql, hash);
      console.log(`Applied migration: ${hash}`);
    }

    console.log("All tenant migrations applied successfully");
  } catch (error) {
    console.error("Failed to run tenant migrations:", error);
    throw new Error(
      `Failed to run tenant migrations: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
