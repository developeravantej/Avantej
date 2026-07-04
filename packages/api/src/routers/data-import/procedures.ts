import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { importJobs } from "@avantej-core/db/schema/tenant/import-jobs";
import {
	commitImport,
	listImportEntities,
	previewImport,
} from "@avantej-core/services";
import { assertOrgContextMatch, requirePermissionOrpc } from "../../guards";
import { tenantProcedure } from "../../index";
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// WS6 (MOVE parity) — self-service CSV data import.
//
// Thin oRPC surface over the data-import engine (packages/services). The engine
// owns entity metadata, parsing, validation, and the actual writes; this router
// only enforces org-match + the data_import:import permission and threads the
// control-panel DB into the commit path.
// ---------------------------------------------------------------------------

const entityEnum = z.enum([
	"clients",
	"packages",
	"payments",
	"opening_balances",
]);

/**
 * listEntities: importable entities + their column specs, for the wizard's
 * entity picker and template download. Requires data_import:import.
 */
const listEntities = tenantProcedure
	.input(z.object({ organizationId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"data_import",
			"import",
		);

		return listImportEntities();
	});

/**
 * preview: dry-run validation of an uploaded CSV. Returns per-row ok/error
 * results without writing anything. Requires data_import:import.
 */
const preview = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			entity: entityEnum,
			csv: z.string().min(1).max(2_000_000),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"data_import",
			"import",
		);

		return previewImport(input.entity, input.csv);
	});

/**
 * commit: parse + validate + write the CSV, recording an import_jobs row.
 * `skipInvalid` commits the valid rows and skips the rest. Requires
 * data_import:import.
 */
const commit = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			entity: entityEnum,
			csv: z.string().min(1).max(2_000_000),
			skipInvalid: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"data_import",
			"import",
		);

		const controlPanelDb = getControlPanelDb(context);
		const actorUserId = context.session?.user?.id;

		return commitImport(
			{
				tenantDb: context.tenantDb,
				controlPanelDb,
				organizationId: input.organizationId,
				actorUserId,
			},
			input.entity,
			input.csv,
			{ skipInvalid: input.skipInvalid },
		);
	});

/**
 * history: recent import runs for the tenant, newest first. Powers the "past
 * imports" list in the wizard. Requires data_import:import.
 */
const history = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			limit: z.number().int().max(100).default(20),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"data_import",
			"import",
		);

		return context.tenantDb
			.select({
				id: importJobs.id,
				entity: importJobs.entity,
				status: importJobs.status,
				rowCount: importJobs.rowCount,
				createdCount: importJobs.createdCount,
				skippedCount: importJobs.skippedCount,
				errorCount: importJobs.errorCount,
				createdBy: importJobs.createdBy,
				createdAt: importJobs.createdAt,
			})
			.from(importJobs)
			.where(eq(importJobs.organizationId, input.organizationId))
			.orderBy(desc(importJobs.createdAt))
			.limit(input.limit);
	});

export const dataImportRouter = {
	listEntities,
	preview,
	commit,
	history,
};
