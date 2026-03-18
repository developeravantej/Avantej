import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

/**
 * Database client for Better-Auth
 * Note: This requires DATABASE_URL to be set in the environment
 * For Cloudflare Workers, use apps/server/src/lib/db.ts instead
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle({ client: pool });
}


// Export encryption utilities
export { encrypt, decrypt } from "./lib/encryption";

// Export migration runner and version constant
export { runTenantMigrations, LATEST_MIGRATION_VERSION } from "./migrate-tenant";

// Export RBAC seed function
export { seedRBACData } from "./seed-rbac";
