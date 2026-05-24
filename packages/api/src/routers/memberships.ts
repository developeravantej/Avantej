/**
 * Memberships router (Phase 3 Agent 3.1 — J4)
 *
 * Front-desk membership freeze/resume + audit-trail listing.
 *
 * Naming: oRPC namespace is `memberships` (plural) to match the URL the UI
 * already calls (`client.memberships.freeze`). The underlying service file
 * is `membership.service.ts` (singular write-side); see that file for the
 * sibling read-side `memberships.service.ts`.
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	cancelMembershipHold,
	freezeMembership,
	listHoldsForPackage,
	resumeMembership,
} from "@avantej-core/services/membership.service";
import { requirePermissionOrpc } from "../guards";

const FreezeReasonEnum = z.enum(["medical", "travel", "other"]);

function ensureCtx(context: {
	tenantDb?: unknown;
	member?: { userId?: string | null } | null;
}): asserts context is {
	tenantDb: NonNullable<typeof context.tenantDb>;
	member: NonNullable<typeof context.member> & { userId: string };
} {
	
	
}

async function checkPermission(
	context: { tenantDb: unknown; member: unknown },
	action: "create" | "update" | "read",
) {
	if (!context.tenantDb || !context.member) {
		throw new ORPCError("FORBIDDEN");
	}
	await requirePermissionOrpc(
		context.tenantDb,
		context.member,
		"customer_management",
		action,
	);
}

export const membershipsRouter = {
	/** Freeze a customer's package (medical / travel / other). */
	freeze: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				memberId: z.string().uuid().optional(),
				startDate: z.coerce.date(),
				endDate: z.coerce.date(),
				reason: FreezeReasonEnum,
				feeWaived: z.boolean().optional(),
				notes: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			if (input.endDate.getTime() <= input.startDate.getTime()) {
				throw new ORPCError("BAD_REQUEST", {
					message: "endDate must be strictly after startDate",
				});
			}

			try {
				return await freezeMembership(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					memberId: input.memberId ?? null,
					startDate: input.startDate,
					endDate: input.endDate,
					reason: input.reason,
					feeWaived: input.feeWaived ?? false,
					createdBy: context.member.userId,
					notes: input.notes ?? null,
				});
			} catch (error) {
				const msg =
					error instanceof Error ? error.message : "Failed to freeze membership";
				if (msg.includes("not found")) {
					throw new ORPCError("NOT_FOUND", { message: msg });
				}
				if (msg.includes("already paused") || msg.includes("strictly after")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: msg });
			}
		}),

	/** Manually resume a frozen package (front-desk action; cron also calls service). */
	resume: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				holdId: z.string().uuid(),
				notes: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			try {
				return await resumeMembership(context.tenantDb, input.holdId, {
					resumedBy: context.member.userId,
					notes: input.notes ?? null,
				});
			} catch (error) {
				const msg =
					error instanceof Error ? error.message : "Failed to resume membership";
				if (msg.includes("not found")) {
					throw new ORPCError("NOT_FOUND", { message: msg });
				}
				if (msg.includes("not active")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", { message: msg });
			}
		}),

	/** Cancel an erroneous freeze without flipping the package back automatically. */
	cancel: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				holdId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			try {
				return await cancelMembershipHold(
					context.tenantDb,
					input.holdId,
					context.member.userId,
				);
			} catch (error) {
				const msg =
					error instanceof Error ? error.message : "Failed to cancel hold";
				throw new ORPCError("BAD_REQUEST", { message: msg });
			}
		}),

	/** List holds for one package (audit trail tab). */
	listHolds: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			ensureCtx(context);
			await checkPermission(context, "read");
			return listHoldsForPackage(context.tenantDb, input.packageInstanceId);
		}),
};
