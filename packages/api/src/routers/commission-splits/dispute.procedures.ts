import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import {
	contestCommissionSplit,
	listContested,
	resolveDispute,
	CONTEST_CATEGORIES,
} from "@avantej-core/services/commission-splits.service";
import { getControlPanelDb } from "../../lib/context-helpers";

// ---------------------------------------------------------------------------
// Staff dispute / contest workflow (Plan 1 — 2026-06-13)
// ---------------------------------------------------------------------------

// contest: a staff member disputes their OWN pending|approved split.
//
// Authorization is OWNERSHIP-based, not permission-based: any authenticated
// member may contest a split where staffId === their own userId. The service
// enforces the ownership check (split.staffId === contestedBy); we pass the
// session user's id as contestedBy so a caller cannot dispute someone else's
// split even by spoofing the input. This means trainers who lack
// commission_management permissions can still raise a dispute on their pay.
const contest = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			splitId: z.string().uuid(),
			category: z.enum(CONTEST_CATEGORIES as unknown as [string, ...string[]]),
			reason: z.string().min(1).max(1000),
		}),
	)
	.handler(async ({ context, input }) => {
		assertOrgContextMatch(context, input);
		try {
			return await contestCommissionSplit(context.tenantDb, {
				splitId: input.splitId,
				// Ownership pinned to the session user — cannot be spoofed via input.
				contestedBy: context.member.userId,
				category: input.category as Parameters<
					typeof contestCommissionSplit
				>[1]["category"],
				reason: input.reason,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Failed to dispute split",
			});
		}
	});

// listContested: manager surface listing contested splits awaiting resolution.
// Requires commission_management:read; RBAC-scoped by accessibleNodeIds.
const listContestedProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			limit: z.number().min(1).max(200).default(50),
			cursor: z
				.object({ contestedAt: z.string(), id: z.string().uuid() })
				.optional(),
		}),
	)
	.handler(async ({ context, input }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"read",
		);

		const controlPanelDb = getControlPanelDb(context);
		return listContested(context.tenantDb, controlPanelDb, {
			accessibleNodeIds: context.accessibleNodeIds,
			limit: input.limit,
			cursor: input.cursor,
		});
	});

// resolveDispute: manager resolves a contested split (uphold | void | adjust).
// Requires commission_management:approve (the same permission that gates void/approve).
const resolveDisputeProcedure = tenantProcedure
	.input(
		z.discriminatedUnion("action", [
			z.object({
				organizationId: z.string().uuid(),
				splitId: z.string().uuid(),
				action: z.literal("uphold"),
				note: z.string().max(1000).optional(),
			}),
			z.object({
				organizationId: z.string().uuid(),
				splitId: z.string().uuid(),
				action: z.literal("void"),
				note: z.string().max(1000).optional(),
			}),
			z.object({
				organizationId: z.string().uuid(),
				splitId: z.string().uuid(),
				action: z.literal("adjust"),
				note: z.string().max(1000).optional(),
				adjustmentAmountCents: z
					.number()
					.int()
					.refine((v) => v !== 0, "Adjustment amount must be non-zero"),
			}),
		]),
	)
	.handler(async ({ context, input }) => {
		assertOrgContextMatch(context, input);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_management",
			"approve",
		);

		try {
			return await resolveDispute(context.tenantDb, {
				splitId: input.splitId,
				action: input.action,
				note: input.note ?? null,
				adjustmentAmountCents:
					input.action === "adjust" ? input.adjustmentAmountCents : undefined,
				actor: {
					userId: context.session.user.id,
					memberId: context.member.id,
					role: context.member.role,
				},
			});
		} catch (err) {
			if (err instanceof ORPCError) throw err;
			throw new ORPCError("BAD_REQUEST", {
				message:
					err instanceof Error ? err.message : "Failed to resolve dispute",
			});
		}
	});

export const commissionSplitsDisputeProcedures = {
	contest,
	listContested: listContestedProcedure,
	resolveDispute: resolveDisputeProcedure,
};
