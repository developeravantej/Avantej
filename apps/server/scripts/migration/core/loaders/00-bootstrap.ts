/**
 * Resolves the org root node. The tenant Neon branch + org-root hierarchy node
 * are created by Avantej provisioning (neon.service.ts), not by migration — so
 * we FIND the depth-0 organization node and fail loudly if it's absent.
 */
import { sql } from "drizzle-orm";
import type { Tx } from "../../lib/db";

export async function resolveOrgRoot(tx: Tx): Promise<string> {
	const r = await tx.execute(sql`
		SELECT id FROM hierarchy_nodes
		WHERE type = 'organization' AND depth = 0
		ORDER BY created_at ASC
		LIMIT 1
	`);
	const id = r.rows[0]?.id;
	if (typeof id !== "string") {
		throw new Error(
			"No organization root node found. Provision the tenant before migrating.",
		);
	}
	return id;
}
