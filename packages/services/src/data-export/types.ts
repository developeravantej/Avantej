/**
 * WS7 (MOVE parity) — tenant CSV export catalogue: shared types.
 *
 * Each dataset is a branch-scoped query → CSV via the shared csv-codec. Scope
 * uses the same resolveReportBranchIds contract as WS2 reports: a string[] =
 * inArray filter, null = admin/org-wide (no filter). Datasets whose rows can be
 * branchless MUST hide those rows when scoped (fail closed), exactly like WS2.
 */

import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

import type { CsvCell } from "../csv-codec";

export type TenantDb = NeonDatabase<typeof tenantSchema>;

export interface ExportScope {
	branchId?: string | null;
	accessibleNodeIds: string[];
}

export interface DatasetSpec {
	entity: string;
	label: string;
	description: string;
	headers: string[];
	/**
	 * Scoped rows as CSV cells. `branchIds` is the resolved filter: string[] =
	 * restrict to those branch nodes, null = no filter (admin/org-wide).
	 */
	rows: (
		tenantDb: TenantDb,
		branchIds: string[] | null,
	) => Promise<CsvCell[][]>;
}

export interface ExportDatasetMeta {
	entity: string;
	label: string;
	description: string;
}
