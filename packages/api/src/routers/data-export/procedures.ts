import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import {
	exportAllDatasets,
	exportDataset,
	listExportDatasets,
} from "@avantej-core/services";
import {
	assertOrgContextMatch,
	guardInputBranchForContext,
	requirePermissionOrpc,
} from "../../guards";
import { tenantProcedure } from "../../index";

// ---------------------------------------------------------------------------
// WS7 (MOVE parity) — self-service CSV data export.
//
// Thin oRPC surface over the data-export engine (packages/services). The engine
// owns dataset metadata, branch-scoped queries, and CSV serialization; this
// router only enforces org-match + branch RBAC + the reports:export permission
// (data export reuses the seeded reports permission — no new permission), and
// packs the export-all datasets into a zip.
// ---------------------------------------------------------------------------

/** Today's date as YYYY-MM-DD for export filenames. */
function todayStamp(): string {
	return new Date().toISOString().slice(0, 10);
}

/**
 * Workers-safe base64 for a Uint8Array. btoa over one big String.fromCharCode
 * call blows the call stack on large arrays, so encode in 0x8000-byte chunks
 * and concatenate the binary string before a single btoa.
 */
function uint8ToBase64(bytes: Uint8Array): string {
	const CHUNK = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += CHUNK) {
		const slice = bytes.subarray(i, i + CHUNK);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

/**
 * listDatasets: exportable datasets + their labels/descriptions, for the export
 * screen's dataset picker. Requires reports:export.
 */
const listDatasets = tenantProcedure
	.input(z.object({ organizationId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"export",
		);

		return listExportDatasets();
	});

/**
 * exportDataset: one dataset → a branch-scoped CSV string plus a download
 * filename. Requires reports:export.
 */
const exportDatasetProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			entity: z.string(),
			branchId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"export",
		);
		await guardInputBranchForContext(context, input.branchId);

		const scope = {
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds,
		};
		const { csv, rowCount, truncated } = await exportDataset(
			context.tenantDb,
			input.entity,
			scope,
		);

		return {
			entity: input.entity,
			filename: `${input.entity}-${todayStamp()}.csv`,
			csv,
			rowCount,
			// True when the dataset hit the 50k row cap (partial export).
			truncated,
		};
	});

/**
 * exportAll: every dataset → a zip archive (one CSV per dataset), base64-encoded
 * for transport. Requires reports:export.
 */
const exportAll = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"reports",
			"export",
		);
		await guardInputBranchForContext(context, input.branchId);

		const scope = {
			branchId: input.branchId,
			accessibleNodeIds: context.accessibleNodeIds,
		};
		const datasets = await exportAllDatasets(context.tenantDb, scope);

		const files = Object.fromEntries(
			datasets.map((d) => [`${d.entity}.csv`, strToU8(d.csv)]),
		);
		const zipped = zipSync(files, { level: 6 });

		return {
			filename: `avantej-export-${todayStamp()}.zip`,
			zipBase64: uint8ToBase64(zipped),
			// Datasets that hit the 50k row cap (partial in the archive).
			truncatedDatasets: datasets
				.filter((d) => d.truncated)
				.map((d) => d.entity),
		};
	});

export const dataExportRouter = {
	listDatasets,
	exportDataset: exportDatasetProcedure,
	exportAll,
};
