import { ORPCError } from "@orpc/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import {
	listPayrollPeriods,
	lockPayrollPeriod,
	unlockPayrollPeriod,
	writeAudit,
} from "@avantej-core/services";
import { resolveCycleBoundsForDate } from "@avantej-core/services/commission-cycle.service";
import {
	assertOrgContextMatch,
	guardBranchAccessible,
	requirePermissionOrpc,
} from "../../guards";
import { tenantProcedure } from "../../index";

// ---------------------------------------------------------------------------
// WS5 (MOVE parity) — payroll period lock management.
//
// Thin oRPC surface over payroll-period.service. Reuses the existing
// commission_payout permission (read / process / update). Period boundaries are
// resolved through the shared cycle resolver so the router never invents its
// own windows.
// ---------------------------------------------------------------------------

/**
 * list: payroll periods for the tenant (optionally scoped to a branch / window),
 * each enriched with the branch node's display name. Requires
 * commission_payout:read.
 */
const list = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchNodeId: z.string().uuid().optional(),
			from: z.string().datetime().optional(),
			to: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"read",
		);

		const rows = await listPayrollPeriods(context.tenantDb, {
			branchNodeId: input.branchNodeId,
			from: input.from ? new Date(input.from) : undefined,
			to: input.to ? new Date(input.to) : undefined,
		});

		// Resolve branch display names in a single query (branch_node_id is a
		// tenant hierarchy node — no cross-DB hop needed).
		const branchIds = [...new Set(rows.map((r) => r.branchNodeId))];
		const nameById = new Map<string, string>();
		if (branchIds.length) {
			const nodes = await context.tenantDb
				.select({ id: hierarchyNodes.id, name: hierarchyNodes.name })
				.from(hierarchyNodes)
				.where(inArray(hierarchyNodes.id, branchIds));
			for (const node of nodes) {
				nameById.set(node.id, node.name);
			}
		}

		return rows.map((row) => ({
			...row,
			branchName: nameById.get(row.branchNodeId) ?? null,
		}));
	});

/**
 * lockNow: manually lock the period containing `referenceDate` (default: now)
 * for a branch, freezing its commission window. Requires
 * commission_payout:process + branch access.
 */
const lockNow = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchNodeId: z.string().uuid(),
			referenceDate: z.string().datetime().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"process",
		);
		guardBranchAccessible(input.branchNodeId, context.accessibleNodeIds);

		const bounds = await resolveCycleBoundsForDate(
			context.tenantDb,
			input.branchNodeId,
			input.referenceDate ? new Date(input.referenceDate) : new Date(),
		);
		const row = await lockPayrollPeriod(context.tenantDb, {
			branchNodeId: input.branchNodeId,
			periodStart: bounds.start,
			periodEnd: bounds.end,
			lockedBy: context.session.user.id,
			lockKind: "manual",
			organizationId: input.organizationId,
		});

		await writeAudit(context.tenantDb, {
			actorUserId: context.session.user.id,
			actorMemberId: context.member?.id ?? null,
			actorRole: context.member?.role,
			action: "payroll_period.lock",
			entityType: "payroll_period",
			entityId: row.id,
			summary: "Payroll period locked",
			changes: {
				branchNodeId: input.branchNodeId,
				periodStart: bounds.start,
				periodEnd: bounds.end,
			},
		});

		return row;
	});

/**
 * unlock: re-open a locked period. Reason is mandatory and audited. Requires
 * commission_payout:update.
 */
const unlock = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			periodId: z.string().uuid(),
			reason: z.string().min(3),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_payout",
			"update",
		);

		const row = await unlockPayrollPeriod(context.tenantDb, {
			id: input.periodId,
			unlockedBy: context.session.user.id,
			reason: input.reason,
		});
		if (!row) {
			throw new ORPCError("NOT_FOUND", {
				message: "Payroll period not found",
			});
		}

		await writeAudit(context.tenantDb, {
			actorUserId: context.session.user.id,
			actorMemberId: context.member?.id ?? null,
			actorRole: context.member?.role,
			action: "payroll_period.unlock",
			entityType: "payroll_period",
			entityId: row.id,
			summary: `Payroll period unlocked: ${input.reason}`,
			changes: {
				branchNodeId: row.branchNodeId,
				reason: input.reason,
			},
		});

		return row;
	});

export const payrollPeriodsRouter = {
	list,
	lockNow,
	unlock,
};
