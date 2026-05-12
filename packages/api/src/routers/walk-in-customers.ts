import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { requirePermission, convertWalkInPaymentToPackage } from "@avantej-core/services";
import { protectedProcedure } from "../index";

const deprecated = (message: string) =>
	protectedProcedure
		.input(z.any().optional())
		.handler(() => {
			throw new ORPCError("BAD_REQUEST", { message });
		});

export const walkInCustomersRouter = {
	list: protectedProcedure
		.input(z.any().optional())
		.handler(() => ({ items: [], total: 0 })),
	getById: deprecated("Walk-in customers have been removed"),
	create: deprecated(
		"Walk-in customers have been removed — use anonymous walk-in flow",
	),
	update: deprecated("Walk-in customers have been removed"),
	deactivate: deprecated("Walk-in customers have been removed"),

	/**
	 * Agent 3.5 — §5 Phase 3 (schema-relationship-fixes):
	 * Convert a succeeded walk-in drop-in payment into a package payment.
	 * Use case: customer pays RM50 drop-in, then upgrades to a 10-pack
	 * mid-session — the original payment becomes credit toward the package.
	 */
	convertToPackage: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				walkInPaymentId: z.string().uuid(),
				targetPackageInstanceId: z.string().uuid(),
				customerProfileId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			await requirePermission(
				context.tenantDb,
				context.member,
				"walk_in_customer_management",
				"update",
			);
			const result = await convertWalkInPaymentToPackage(context.tenantDb, {
				walkInPaymentId: input.walkInPaymentId,
				targetPackageInstanceId: input.targetPackageInstanceId,
				customerProfileId: input.customerProfileId,
				actorUserId: context.session.user.id,
			});
			return result;
		}),
};
