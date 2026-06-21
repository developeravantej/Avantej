/**
 * Tenant DB connection for migration tooling.
 *
 * Resolves the tenant Neon branch by organization slug from the control-panel
 * DB (same pattern as scripts/inspect-hierarchy.ts), then opens a Drizzle client
 * against the decrypted tenant connection string.
 *
 * IMPORTANT: run migrations against a THROWAWAY Neon branch first. Per-tenant
 * branch = instant, free rollback. Only point at the real branch once a dry-run
 * reconciles clean.
 */
import { decrypt } from "@avantej-core/db";
import * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type TenantDb = NeonDatabase<typeof tenantSchema>;
export type ControlDb = NeonDatabase<typeof controlPanelSchema>;
/** The transaction handle passed to tenantDb.transaction(async (tx) => ...). */
export type Tx = Parameters<Parameters<TenantDb["transaction"]>[0]>[0];
/** The transaction handle passed to controlDb.transaction(async (cpTx) => ...). */
export type CpTx = Parameters<Parameters<ControlDb["transaction"]>[0]>[0];

export interface TenantConnection {
	orgId: string;
	orgName: string;
	tenantDb: TenantDb;
	controlDb: ControlDb;
	close: () => Promise<void>;
}

export async function connectTenant(
	orgSlug: string,
): Promise<TenantConnection> {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		throw new Error("DATABASE_URL (control-panel) is required");
	}

	const cpPool = new Pool({ connectionString: databaseUrl });
	const cp = drizzle({ client: cpPool, schema: controlPanelSchema });

	const org = await cp.query.organizations.findFirst({
		where: (o, { eq }) => eq(o.slug, orgSlug),
	});
	if (!org) {
		await cpPool.end();
		throw new Error(`Organization not found for slug: ${orgSlug}`);
	}

	const tenantPool = new Pool({
		connectionString: decrypt(org.connectionString),
	});
	const tenantDb = drizzle({ client: tenantPool, schema: tenantSchema });

	return {
		orgId: org.id,
		orgName: org.name,
		tenantDb,
		controlDb: cp,
		close: async () => {
			await tenantPool.end();
			await cpPool.end();
		},
	};
}
