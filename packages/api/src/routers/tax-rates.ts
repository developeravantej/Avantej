import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listTaxRates,
	getTaxRateById,
	getDefaultTaxRate,
	createTaxRate,
	updateTaxRate,
	setDefaultTaxRate,
	deactivateTaxRate,
} from "@avantej-core/services/tax-rates.service";
export const taxRatesRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				isActive: z.boolean().optional(),
				category: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			// Clients can read tax rates (needed during purchase preview); staff need tax_configuration:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "read");
			}

			return listTaxRates(context.tenantDb, {
				isActive: input.isActive,
				category: input.category,
			});
		}),

	getById: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			// Clients can read tax rates (needed during purchase preview); staff need tax_configuration:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "read");
			}

			const taxRate = await getTaxRateById(context.tenantDb, input.id);
			if (!taxRate) {
				throw new ORPCError("NOT_FOUND", {
					message: `Tax rate not found: ${input.id}`,
				});
			}
			return taxRate;
		}),

	getDefault: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ context }) => {
			

			

			// Clients can read tax rates (needed during purchase preview); staff need tax_configuration:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "read");
			}

			const taxRate = await getDefaultTaxRate(context.tenantDb);
			return taxRate ?? null;
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				code: z.string().min(1),
				rateInBasisPoints: z.number().int().nonnegative(),
				category: z.string().optional(),
				isDefault: z.boolean().optional(),
				effectiveFrom: z.string().datetime(),
				effectiveUntil: z.string().datetime().optional(),
				description: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "create");

			return createTaxRate(context.tenantDb, {
				name: input.name,
				code: input.code,
				rateInBasisPoints: input.rateInBasisPoints,
				category: input.category,
				isDefault: input.isDefault,
				effectiveFrom: new Date(input.effectiveFrom),
				effectiveUntil: input.effectiveUntil
					? new Date(input.effectiveUntil)
					: undefined,
				description: input.description,
			});
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				code: z.string().optional(),
				rateInBasisPoints: z.number().int().optional(),
				category: z.string().optional(),
				effectiveFrom: z.string().datetime().optional(),
				effectiveUntil: z.string().datetime().optional(),
				description: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "update");

			const result = await updateTaxRate(context.tenantDb, input.id, {
				name: input.name,
				code: input.code,
				rateInBasisPoints: input.rateInBasisPoints,
				category: input.category,
				effectiveFrom: input.effectiveFrom
					? new Date(input.effectiveFrom)
					: undefined,
				effectiveUntil: input.effectiveUntil
					? new Date(input.effectiveUntil)
					: undefined,
				description: input.description,
			});

			if (!result) {
				throw new ORPCError("NOT_FOUND", {
					message: `Tax rate not found: ${input.id}`,
				});
			}
			return result;
		}),

	setDefault: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "update");

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member.id,
				role: context.member.role,
			};

			return setDefaultTaxRate(context.tenantDb, input.id, actor);
		}),

	deactivate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			

			

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "delete");

			return deactivateTaxRate(context.tenantDb, input.id);
		}),
};
