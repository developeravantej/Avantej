/**
 * WS6 — import engine: parse → validate (preview) and parse → validate →
 * commit-per-row, writing an import_jobs history record.
 *
 * Rows are committed independently: one bad row never aborts the batch, and
 * every importer is idempotent so a partial run can be safely re-uploaded.
 */

import { importJobs } from "@avantej-core/db/schema/tenant/import-jobs";

import { parseCsvTable } from "../csv-codec";
import { IMPORTERS } from "./importers";
import type {
	CommitResult,
	ImportContext,
	ImportEntity,
	PreviewResult,
	RowResult,
} from "./types";

function importerFor(entity: string) {
	const spec = IMPORTERS[entity];
	if (!spec) throw new Error(`Unknown import entity: ${entity}`);
	return spec;
}

/** Column template + labels for the UI / downloadable header row. */
export function importTemplate(entity: ImportEntity) {
	const spec = importerFor(entity);
	return {
		entity: spec.entity,
		label: spec.label,
		columns: spec.columns,
		headerRow: spec.columns.map((c) => c.name).join(","),
	};
}

export function listImportEntities() {
	return (Object.keys(IMPORTERS) as ImportEntity[]).map((e) =>
		importTemplate(e),
	);
}

/** Validate every row WITHOUT writing. */
export function previewImport(
	entity: ImportEntity,
	csv: string,
): PreviewResult {
	const spec = importerFor(entity);
	const { rows } = parseCsvTable(csv);
	const results: RowResult[] = rows.map((raw, i) => {
		const parsed = spec.parse(raw);
		return parsed.ok
			? { line: i + 1, ok: true, errors: [] }
			: { line: i + 1, ok: false, errors: parsed.errors };
	});
	return {
		entity,
		rowCount: results.length,
		okCount: results.filter((r) => r.ok).length,
		errorCount: results.filter((r) => !r.ok).length,
		results,
	};
}

/**
 * Validate + commit each row, then record an import_jobs row. Rows that fail
 * validation or their write are reported but do not abort the run.
 * `skipInvalid` (default true) lets a batch with some bad rows still import the
 * good ones; when false, a batch with ANY validation error commits nothing.
 */
export async function commitImport(
	ctx: ImportContext,
	entity: ImportEntity,
	csv: string,
	opts: { skipInvalid?: boolean } = {},
): Promise<CommitResult> {
	const spec = importerFor(entity);
	const { rows } = parseCsvTable(csv);
	const skipInvalid = opts.skipInvalid ?? true;

	// Pre-validate so we can honor skipInvalid=false (all-or-nothing on errors).
	const parsedRows = rows.map((raw) => spec.parse(raw));
	const anyInvalid = parsedRows.some((p) => !p.ok);

	const results: RowResult[] = [];
	let created = 0;
	let skipped = 0;
	let errored = 0;

	const doCommit = skipInvalid || !anyInvalid;

	for (let i = 0; i < parsedRows.length; i++) {
		const line = i + 1;
		const parsed = parsedRows[i]!;
		if (!parsed.ok) {
			results.push({ line, ok: false, errors: parsed.errors });
			errored++;
			continue;
		}
		if (!doCommit) {
			// All-or-nothing mode with at least one invalid row: report valid
			// rows as not-committed without touching the DB.
			results.push({
				line,
				ok: false,
				errors: ["Not committed — batch has validation errors"],
			});
			errored++;
			continue;
		}
		try {
			const { action, ref } = await spec.commit(ctx, parsed.value);
			results.push({ line, ok: true, errors: [], action, ref });
			if (action === "created") created++;
			else skipped++;
		} catch (err) {
			results.push({
				line,
				ok: false,
				errors: [err instanceof Error ? err.message : "Import failed"],
			});
			errored++;
		}
	}

	const status =
		errored === 0 ? "committed" : created > 0 ? "committed" : "failed";
	const [job] = await ctx.tenantDb
		.insert(importJobs)
		.values({
			organizationId: ctx.organizationId,
			entity,
			status,
			rowCount: results.length,
			createdCount: created,
			skippedCount: skipped,
			errorCount: errored,
			summary: results,
			createdBy: ctx.actorUserId,
		})
		.returning({ id: importJobs.id });

	return {
		entity,
		jobId: job?.id ?? "",
		rowCount: results.length,
		createdCount: created,
		skippedCount: skipped,
		errorCount: errored,
		results,
	};
}
