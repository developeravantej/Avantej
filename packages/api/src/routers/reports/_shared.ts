import { z } from "zod";

import type { Context } from "../../context";
import {
	assertOrgContextMatch,
	assertTenantContext,
	guardInputBranchForContext,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
} from "../../guards";

/**
 * WS2 reports — one shared input contract for all ten reports.
 * from/to are ISO datetime bounds built client-side from yyyy-mm-dd
 * (`T00:00:00.000Z` / `T23:59:59.999Z`), matching the sales page pattern.
 */
export const reportBaseInput = z.object({
	organizationId: z.string().uuid(),
	/** Scope node (branch/state/country); undefined = all accessible. */
	branchId: z.string().uuid().optional(),
	from: z.string().datetime(),
	to: z.string().datetime(),
	taxBasis: z.enum(["pre_tax", "tax_inclusive"]).default("tax_inclusive"),
});

export const reportPageInput = z.object({
	limit: z.number().int().min(1).max(200).default(50),
	offset: z.number().int().min(0).default(0),
});

export const reportListInput = reportBaseInput.merge(reportPageInput);

export type ReportBaseInput = z.infer<typeof reportBaseInput>;

/**
 * Shared guard sequence for every report handler:
 * org match → tenant context → reports:read (or export) → input branch RBAC.
 * Returns the caller's accessible node ids (RBAC ceiling; [] = admin).
 */
export async function guardReportAccess(
	context: Context,
	input: { organizationId: string; branchId?: string },
	action: "read" | "export" = "read",
): Promise<string[]> {
	assertOrgContextMatch(context, input);
	assertTenantContext(context);
	await requirePermissionOrpc(
		context.tenantDb,
		context.member,
		"reports",
		action,
	);
	await guardInputBranchForContext(context, input.branchId);
	return resolveAccessibleNodeIds(context);
}

/** Parses the validated ISO bounds into Date objects. */
export function reportDates(input: { from: string; to: string }): {
	from: Date;
	to: Date;
} {
	return { from: new Date(input.from), to: new Date(input.to) };
}
