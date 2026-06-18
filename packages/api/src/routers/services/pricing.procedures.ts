import {
	deleteServicePrice,
	expireServicePrice,
	getServiceById,
	listServicePriceOverrides,
	resolveServicePrice,
	setServicePrice,
} from "@avantej-core/services";
import { servicePrices } from "@avantej-core/db/schema/tenant/service-prices";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	guardInputBranchForContext,
	requirePermissionOrpc,
	resolveAccessibleNodeIds,
} from "../../guards";

export const servicePricingProcedures = {
	resolvePrice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
				branchId: z.string().uuid().nullable().optional(),
				customerType: z.string().nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}
			const priceCents = await resolveServicePrice(
				context.tenantDb,
				input.serviceId,
				input.branchId ?? null,
				input.customerType ?? null,
			);
			return { priceCents };
		}),

	listPriceOverrides: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}
			return listServicePriceOverrides(context.tenantDb, input.serviceId);
		}),

	setBranchPrice: tenantProcedure
		.input(
			z
				.object({
					organizationId: z.string().uuid(),
					serviceId: z.string().uuid(),
					branchId: z.string().uuid().nullable(),
					customerType: z.string().nullable().optional(),
					priceCents: z.number().int().min(0),
					effectiveFrom: z.string().datetime().optional(),
					effectiveUntil: z.string().datetime().nullable().optional(),
				})
				.refine(
					(d) => {
						if (d.effectiveFrom && d.effectiveUntil) {
							return new Date(d.effectiveUntil) > new Date(d.effectiveFrom);
						}
						return true;
					},
					{
						message: "effectiveUntil must be after effectiveFrom",
						path: ["effectiveUntil"],
					},
				),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);
			await guardInputBranchForContext(context, input.branchId);
			return setServicePrice(context.tenantDb, {
				serviceId: input.serviceId,
				branchId: input.branchId,
				customerType: input.customerType ?? null,
				priceCents: input.priceCents,
				effectiveFrom: input.effectiveFrom
					? new Date(input.effectiveFrom)
					: undefined,
				effectiveUntil:
					input.effectiveUntil === undefined
						? undefined
						: input.effectiveUntil === null
							? null
							: new Date(input.effectiveUntil),
			});
		}),

	expireBranchPrice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				priceId: z.string().uuid(),
				effectiveUntil: z.string().datetime().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"update",
			);
			const [priceRow] = await context.tenantDb
				.select({ id: servicePrices.id, serviceId: servicePrices.serviceId })
				.from(servicePrices)
				.where(eq(servicePrices.id, input.priceId))
				.limit(1);
			if (!priceRow) {
				throw new ORPCError("NOT_FOUND", {
					message: "Price override not found",
				});
			}
			const svc = await getServiceById(context.tenantDb, priceRow.serviceId);
			if (!svc) {
				throw new ORPCError("NOT_FOUND", {
					message: "Price override not found",
				});
			}
			if (svc.branchId) {
				const accessibleNodeIds = await resolveAccessibleNodeIds(context);
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("NOT_FOUND", {
						message: "Price override not found",
					});
				}
			}
			await expireServicePrice(
				context.tenantDb,
				input.priceId,
				input.effectiveUntil ? new Date(input.effectiveUntil) : undefined,
			);
			return { success: true };
		}),

	deleteBranchPrice: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				priceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"delete",
			);
			const [priceRow] = await context.tenantDb
				.select({ id: servicePrices.id, serviceId: servicePrices.serviceId })
				.from(servicePrices)
				.where(eq(servicePrices.id, input.priceId))
				.limit(1);
			if (!priceRow) {
				throw new ORPCError("NOT_FOUND", {
					message: "Price override not found",
				});
			}
			const svc = await getServiceById(context.tenantDb, priceRow.serviceId);
			if (!svc) {
				throw new ORPCError("NOT_FOUND", {
					message: "Price override not found",
				});
			}
			if (svc.branchId) {
				const accessibleNodeIds = await resolveAccessibleNodeIds(context);
				if (!accessibleNodeIds.includes(svc.branchId)) {
					throw new ORPCError("NOT_FOUND", {
						message: "Price override not found",
					});
				}
			}
			await deleteServicePrice(context.tenantDb, input.priceId);
			return { success: true };
		}),
};
