/**
 * WS7 — export engine: resolve branch scope, run a dataset's scoped query, and
 * serialize via the shared csv-codec. exportAllDatasets returns every dataset's
 * CSV for the export-all zip (built in the router).
 */

import { buildCsv, type CsvCell } from "../csv-codec";
import { resolveReportBranchIds } from "../reports/_shared";
import { EXPORT_DATASETS, EXPORT_MAX_ROWS } from "./datasets";
import type {
	DatasetSpec,
	ExportDatasetMeta,
	ExportScope,
	TenantDb,
} from "./types";

function specFor(entity: string) {
	const spec = EXPORT_DATASETS[entity];
	if (!spec) throw new Error(`Unknown export dataset: ${entity}`);
	return spec;
}

export function listExportDatasets(): ExportDatasetMeta[] {
	return Object.values(EXPORT_DATASETS).map(
		({ entity, label, description }) => ({ entity, label, description }),
	);
}

/** Run a spec's scoped query and serialize, honoring the row cap. */
async function serialize(
	tenantDb: TenantDb,
	spec: DatasetSpec,
	branchIds: string[] | null,
): Promise<{ csv: string; rowCount: number; truncated: boolean }> {
	// Datasets fetch EXPORT_MAX_ROWS + 1; a full extra row means there is more.
	const raw = await spec.rows(tenantDb, branchIds);
	const truncated = raw.length > EXPORT_MAX_ROWS;
	const rows: CsvCell[][] = truncated ? raw.slice(0, EXPORT_MAX_ROWS) : raw;
	return {
		csv: buildCsv(spec.headers, rows, { trailingNewline: true }),
		rowCount: rows.length,
		truncated,
	};
}

export interface ExportDatasetResult {
	entity: string;
	csv: string;
	rowCount: number;
	/** True when the dataset hit the EXPORT_MAX_ROWS cap (partial export). */
	truncated: boolean;
}

/** One dataset → CSV (branch-scoped, capped at EXPORT_MAX_ROWS). */
export async function exportDataset(
	tenantDb: TenantDb,
	entity: string,
	scope: ExportScope,
): Promise<ExportDatasetResult> {
	const spec = specFor(entity);
	const branchIds = await resolveReportBranchIds(tenantDb, scope);
	const { csv, rowCount, truncated } = await serialize(
		tenantDb,
		spec,
		branchIds,
	);
	return { entity, csv, rowCount, truncated };
}

export interface ExportedDataset {
	entity: string;
	label: string;
	csv: string;
	truncated: boolean;
}

/** Every dataset → its CSV, for the export-all archive. */
export async function exportAllDatasets(
	tenantDb: TenantDb,
	scope: ExportScope,
): Promise<ExportedDataset[]> {
	const branchIds = await resolveReportBranchIds(tenantDb, scope);
	const out: ExportedDataset[] = [];
	for (const spec of Object.values(EXPORT_DATASETS)) {
		// Sequential — a single tenant DB; parallel large scans would contend.
		const { csv, truncated } = await serialize(tenantDb, spec, branchIds);
		out.push({ entity: spec.entity, label: spec.label, csv, truncated });
	}
	return out;
}
