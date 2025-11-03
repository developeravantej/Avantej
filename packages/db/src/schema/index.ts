/**
 * Main Schema Export
 *
 * This file exports all database schemas for Drizzle to discover.
 * Drizzle-kit uses this file to generate migrations.
 */

// Better-Auth schemas
export * from "./auth";

// Control Panel schemas
export * from "./control-panel";

// Tenant schemas (applied to each tenant's Neon database project)
export * from "./tenant";
