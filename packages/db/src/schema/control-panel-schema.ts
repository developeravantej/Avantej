/**
 * Control Panel Schema Index
 * 
 * This file exports only control panel database schemas (auth + control-panel).
 * Used by drizzle.control-panel.config.ts for generating control panel migrations.
 * 
 * Note: Better-Auth tables (auth.ts) are stored in the control panel database.
 */

// Better-Auth schemas (stored in control panel database)
export * from "./auth";

// Control Panel schemas
export * from "./control-panel";

