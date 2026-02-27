import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import {
	requirePermission,
	listSuppliers,
	getSupplierById,
	createSupplier,
	updateSupplier,
	deactivateSupplier,
} from "@avantej-core/services";

export const suppliersRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				isActive: z.boolean().optional(),
				search: z.string().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return listSuppliers(context.tenantDb, {
				isActive: input.isActive,
				search: input.search,
			});
		}),

	getById: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "read");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const supplier = await getSupplierById(context.tenantDb, input.id);
			if (!supplier) {
				throw new ORPCError("NOT_FOUND", {
					message: `Supplier not found: ${input.id}`,
				});
			}
			return supplier;
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				description: z.string().optional(),
				accountNumber: z.string().optional(),
				paymentTerms: z.string().optional(),
				contactPerson: z.string().optional(),
				contactPhone: z.string().optional(),
				officePhone: z.string().optional(),
				email: z.string().email().optional(),
				website: z.string().optional(),
				barcode: z.string().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "create");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return createSupplier(context.tenantDb, {
				name: input.name,
				description: input.description,
				accountNumber: input.accountNumber,
				paymentTerms: input.paymentTerms,
				contactPerson: input.contactPerson,
				contactPhone: input.contactPhone,
				officePhone: input.officePhone,
				email: input.email,
				website: input.website,
				barcode: input.barcode,
				isActive: input.isActive,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().optional(),
				description: z.string().optional(),
				accountNumber: z.string().optional(),
				paymentTerms: z.string().optional(),
				contactPerson: z.string().optional(),
				contactPhone: z.string().optional(),
				officePhone: z.string().optional(),
				email: z.string().email().optional(),
				website: z.string().optional(),
				barcode: z.string().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return updateSupplier(context.tenantDb, input.id, {
				name: input.name,
				description: input.description,
				accountNumber: input.accountNumber,
				paymentTerms: input.paymentTerms,
				contactPerson: input.contactPerson,
				contactPhone: input.contactPhone,
				officePhone: input.officePhone,
				email: input.email,
				website: input.website,
				barcode: input.barcode,
				isActive: input.isActive,
			});
		}),

	deactivate: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			})
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available. Ensure organization context is set.",
				});
			}

			if (!context.member) {
				throw new ORPCError("FORBIDDEN", {
					message: "User is not a member of this organization",
				});
			}

			try {
				await requirePermission(context.tenantDb, context.member, "inventory", "update");
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			return deactivateSupplier(context.tenantDb, input.id);
		}),
};
