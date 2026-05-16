/**
 * Plan E E.8 — Tenant Data Export Service.
 *
 * Produces a JSON dump of every tenant-DB table for a single organization.
 * v1 returns a base64-encoded JSON blob and a `data:` URL fallback for
 * `tenant_deletions.export_url`. Proper R2 (or signed URL) upload is a TODO.
 *
 * Format:
 *   {
 *     "exportedAt": "ISO8601",
 *     "organizationId": "uuid",
 *     "tables": {
 *       "members": [...rows],
 *       "customer_profiles": [...rows],
 *       ...
 *     }
 *   }
 *
 * Table enumeration uses `tenantDb.query.*` keys (the Drizzle query object
 * exposes one entry per table), so new tenant tables flow in automatically
 * once they're added to the tenant schema barrel.
 *
 * See ADR-0026.
 */

import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";

export interface TenantExportResult {
	exportedAt: string;
	organizationId: string;
	requestedByUserId: string;
	tableCount: number;
	totalRows: number;
	/** Base64-encoded JSON blob. Caller is responsible for persisting it. */
	base64: string;
	/**
	 * Convenience `data:` URL stash. Suitable for `tenant_deletions.export_url`
	 * only when no R2 binding is configured.
	 *
	 * TODO: upload `base64` to R2 and return the signed URL instead. Beyond
	 *       a few MB the `data:` URL form is impractical for email delivery.
	 */
	dataUrl: string;
}

interface ExportDeps {
	tenantDb: NeonDatabase<typeof tenantSchema>;
	organizationId: string;
	requestedByUserId: string;
	now?: Date;
}

function toBase64(s: string): string {
	// Workers + Node both expose btoa; Buffer is the safe fallback.
	if (typeof btoa === "function") {
		// Re-encode through UTF-8 byte array to handle non-Latin1 chars.
		const bytes = new TextEncoder().encode(s);
		let bin = "";
		for (const b of bytes) bin += String.fromCharCode(b);
		return btoa(bin);
	}
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { Buffer } = require("node:buffer");
	return Buffer.from(s, "utf-8").toString("base64");
}

/**
 * Dump every tenant table this org has into a single JSON object and return
 * it as a base64 blob.
 *
 * The caller (E.8 router) is responsible for emailing or persisting the
 * resulting blob — this service is intentionally side-effect-free so tests
 * stay simple.
 */
export async function runTenantExport(
	deps: ExportDeps,
): Promise<TenantExportResult> {
	const exportedAt = (deps.now ?? new Date()).toISOString();

	const queryObj = (deps.tenantDb as unknown as {
		query: Record<string, { findMany: () => Promise<unknown[]> }>;
	}).query;

	const tableNames = Object.keys(queryObj).sort();
	const tables: Record<string, unknown[]> = {};
	let totalRows = 0;

	for (const name of tableNames) {
		try {
			const rows = await queryObj[name]!.findMany();
			tables[name] = rows;
			totalRows += rows.length;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error(`[tenant-export] org=${deps.organizationId} table=${name} failed:`, msg);
			tables[name] = [{ __export_error__: msg }];
		}
	}

	const payload = {
		exportedAt,
		organizationId: deps.organizationId,
		requestedByUserId: deps.requestedByUserId,
		tables,
	};

	const json = JSON.stringify(payload);
	const base64 = toBase64(json);
	const dataUrl = `data:application/json;base64,${base64}`;

	return {
		exportedAt,
		organizationId: deps.organizationId,
		requestedByUserId: deps.requestedByUserId,
		tableCount: tableNames.length,
		totalRows,
		base64,
		dataUrl,
	};
}
