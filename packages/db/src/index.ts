import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
neonConfig.poolQueryViaFetch = true;

/**
 * Database client for Better-Auth
 * Note: This requires DATABASE_URL to be set in the environment
 * For Cloudflare Workers, use apps/server/src/lib/db.ts instead
 */
export function createDb(connectionString: string) {
  const sql = neon(connectionString);
  return drizzle(sql);
}

// Export encryption utilities
export { encrypt, decrypt } from "./lib/encryption";

// Export migration runner
export { runTenantMigrations } from "./migrate-tenant";
