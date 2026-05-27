/**
 * Commission cycle policy router (S-cycle-window-alignment admin surface).
 *
 * Lets admins manage the `commission_cycle_configs` rows that drive the
 * per-cycle commission cap window. Without this router the policy is only
 * editable via Drizzle Studio — this router unblocks operators to change
 * the anchor day / cycle type without DB access.
 *
 * Procedures:
 *   - list        — return every policy for the tenant (tenant-wide + per-branch)
 *                   joined to the branch's hierarchy_node name for display.
 *   - upsert      — create or replace the policy for a (branch | tenant) target.
 *                   Server-side validates anchor_day range per cycle_type
 *                   (mirrors the DB CHECK constraint so errors surface as
 *                   BAD_REQUEST instead of a raw 23514).
 *   - delete      — remove the policy for a (branch | tenant) target. Falling
 *                   back to the default UTC calendar-month behaviour.
 *
 * Auth: all procedures gated on `category_commission_management:*` (cycle
 * policy is part of the commission configuration surface). Read is `:read`;
 * write/delete is `:create` OR `:update` so the same operator who edits a
 * category's commission config can also set its cycle policy.
 */
import { ORPCError } from "@orpc/server";
import { eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { commissionCycleConfigs } from "@avantej-core/db/schema/tenant/commission-cycle-configs";
import { hierarchyNodes } from "@avantej-core/db/schema/tenant/hierarchy";
import { hasPermission } from "@avantej-core/services/permission.service";
import { tenantProcedure } from "../index";
import { assertOrgContextMatch, requirePermissionOrpc } from "../guards";

const CYCLE_TYPES = ["calendar_month", "monthly_anchored", "semi_monthly", "weekly"] as const;
type CycleType = (typeof CYCLE_TYPES)[number];

const cycleTypeSchema = z.enum(CYCLE_TYPES);

// Server-side guard mirroring the DB CHECK on (cycle_type, anchor_day).
function validateAnchorDayForCycleType(cycleType: CycleType, anchorDay: number | null): void {
	if (cycleType === "calendar_month") {
		if (anchorDay !== null) {
			throw new ORPCError("BAD_REQUEST", {
				message: "calendar_month does not take an anchorDay — leave null",
			});
		}
		return;
	}
	if (anchorDay === null) {
		throw new ORPCError("BAD_REQUEST", {
			message: `cycleType=${cycleType} requires an anchorDay`,
		});
	}
	if (!Number.isInteger(anchorDay)) {
		throw new ORPCError("BAD_REQUEST", { message: "anchorDay must be an integer" });
	}
	if (cycleType === "monthly_anchored" && (anchorDay < 1 || anchorDay > 28)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "monthly_anchored anchorDay must be 1–28 (avoid month-length edge cases)",
		});
	}
	if (cycleType === "semi_monthly" && (anchorDay < 1 || anchorDay > 15)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "semi_monthly anchorDay must be 1–15 (defines the first half-month start)",
		});
	}
	if (cycleType === "weekly" && (anchorDay < 0 || anchorDay > 6)) {
		throw new ORPCError("BAD_REQUEST", {
			message: "weekly anchorDay must be 0–6 (0=Sunday … 6=Saturday)",
		});
	}
}

// Shared OR(create, update) permission check — cycle policy edits are a
// `category_commission_management` write, but should be granted to anyone with
// either create OR update on that resource (matches the upsert convention).
async function requireWritePerm(
	tenantDb: Parameters<typeof requirePermissionOrpc>[0],
	member: Parameters<typeof requirePermissionOrpc>[1],
): Promise<void> {
	const canCreate = await hasPermission(
		tenantDb,
		member,
		"category_commission_management",
		"create",
	);
	if (!canCreate) {
		await requirePermissionOrpc(
			tenantDb,
			member,
			"category_commission_management",
			"update",
		);
	}
}

const list = tenantProcedure
	.input(z.object({ organizationId: z.string().uuid() }))
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"category_commission_management",
			"read",
		);

		// One query — join to hierarchy_nodes for branch name display. NULL branch
		// (tenant-wide row) sorts first so the UI lists "Tenant default" at the top.
		const rows = await context.tenantDb
			.select({
				id: commissionCycleConfigs.id,
				branchId: commissionCycleConfigs.branchId,
				branchName: hierarchyNodes.name,
				cycleType: commissionCycleConfigs.cycleType,
				anchorDay: commissionCycleConfigs.anchorDay,
				updatedBy: commissionCycleConfigs.updatedBy,
				updatedAt: commissionCycleConfigs.updatedAt,
			})
			.from(commissionCycleConfigs)
			.leftJoin(
				hierarchyNodes,
				eq(commissionCycleConfigs.branchId, hierarchyNodes.id),
			)
			.orderBy(sql`${commissionCycleConfigs.branchId} IS NULL DESC`);

		return {
			policies: rows.map((r: {
				id: string;
				branchId: string | null;
				branchName: string | null;
				cycleType: string;
				anchorDay: number | null;
				updatedBy: string | null;
				updatedAt: Date;
			}) => ({
				id: r.id,
				branchId: r.branchId,
				branchName: r.branchName,
				cycleType: r.cycleType as CycleType,
				anchorDay: r.anchorDay,
				updatedBy: r.updatedBy,
				updatedAt: r.updatedAt,
			})),
		};
	});

const upsert = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			// null = tenant-wide default; uuid = per-branch override.
			branchId: z.string().uuid().nullable(),
			cycleType: cycleTypeSchema,
			anchorDay: z.number().int().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requireWritePerm(context.tenantDb, context.member);
		validateAnchorDayForCycleType(input.cycleType, input.anchorDay);

		const now = new Date();

		// One row per (branch | tenant). Use the appropriate partial-unique-index
		// path: ON CONFLICT on branch_id when set, otherwise look up the tenant-wide
		// row by IS NULL and UPDATE if present, else INSERT.
		if (input.branchId !== null) {
			const branchId = input.branchId;
			const [existing] = await context.tenantDb
				.select({ id: commissionCycleConfigs.id })
				.from(commissionCycleConfigs)
				.where(eq(commissionCycleConfigs.branchId, branchId))
				.limit(1);
			if (existing) {
				await context.tenantDb
					.update(commissionCycleConfigs)
					.set({
						cycleType: input.cycleType,
						anchorDay: input.anchorDay,
						updatedBy: context.member.userId,
						updatedAt: now,
					})
					.where(eq(commissionCycleConfigs.id, existing.id));
				return { id: existing.id, created: false };
			}
			const [inserted] = await context.tenantDb
				.insert(commissionCycleConfigs)
				.values({
					branchId,
					cycleType: input.cycleType,
					anchorDay: input.anchorDay,
					updatedBy: context.member.userId,
					createdAt: now,
					updatedAt: now,
				})
				.returning({ id: commissionCycleConfigs.id });
			if (!inserted) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to insert cycle policy row",
				});
			}
			return { id: inserted.id, created: true };
		}

		// Tenant-wide branch=NULL row
		const [existing] = await context.tenantDb
			.select({ id: commissionCycleConfigs.id })
			.from(commissionCycleConfigs)
			.where(isNull(commissionCycleConfigs.branchId))
			.limit(1);
		if (existing) {
			await context.tenantDb
				.update(commissionCycleConfigs)
				.set({
					cycleType: input.cycleType,
					anchorDay: input.anchorDay,
					updatedBy: context.member.userId,
					updatedAt: now,
				})
				.where(eq(commissionCycleConfigs.id, existing.id));
			return { id: existing.id, created: false };
		}
		const [inserted] = await context.tenantDb
			.insert(commissionCycleConfigs)
			.values({
				branchId: null,
				cycleType: input.cycleType,
				anchorDay: input.anchorDay,
				updatedBy: context.member.userId,
				createdAt: now,
				updatedAt: now,
			})
			.returning({ id: commissionCycleConfigs.id });
		if (!inserted) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to insert tenant-wide cycle policy row",
			});
		}
		return { id: inserted.id, created: true };
	});

const deletePolicy = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			branchId: z.string().uuid().nullable(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		await requireWritePerm(context.tenantDb, context.member);

		const where =
			input.branchId === null
				? isNull(commissionCycleConfigs.branchId)
				: eq(commissionCycleConfigs.branchId, input.branchId);

		const deleted = await context.tenantDb
			.delete(commissionCycleConfigs)
			.where(where)
			.returning({ id: commissionCycleConfigs.id });

		return { deleted: deleted.length };
	});

export const commissionCycleRouter = {
	list,
	upsert,
	delete: deletePolicy,
};
