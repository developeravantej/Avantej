import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";
import {
	listTaxRates,
	getTaxRateById,
	getDefaultTaxRate,
	createTaxRate,
	updateTaxRate,
	setDefaultTaxRate,
	deactivateTaxRate,
} from "@avantej-core/services/tax-rates.service";
import { requirePermission } from "@avantej-core/services";

export const taxRatesRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				isActive: z.boolean().optional(),
				category: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			// Clients can read tax rates (needed during purchase preview); staff need tax_configuration:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "read");
			}

			return listTaxRates(context.tenantDb, {
				isActive: input.isActive,
				category: input.category,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

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

	getDefault: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			// Clients can read tax rates (needed during purchase preview); staff need tax_configuration:read.
			if (context.member.role !== "client") {
				await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "read");
			}

			const taxRate = await getDefaultTaxRate(context.tenantDb);
			return taxRate ?? null;
		}),

	create: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

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

	update: protectedProcedure
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
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

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

	setDefault: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "update");

			const actor = {
				userId: context.session!.user.id,
				memberId: context.member.id,
				role: context.member.role,
			};

			return setDefaultTaxRate(context.tenantDb, input.id, actor);
		}),

	deactivate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message:
						"Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			await requirePermissionOrpc(context.tenantDb, context.member, "tax_configuration", "delete");

			return deactivateTaxRate(context.tenantDb, input.id);
		}),
};
