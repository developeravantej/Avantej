import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

export type TenantDb = NeonDatabase<typeof tenantSchema>;
export type TenantTx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
