import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../guards";
import {
	listSuppliers,
	getSupplierById,
	createSupplier,
	updateSupplier,
	deactivateSupplier,
} from "@avantej-core/services";

export const suppliersRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				isActive: z.boolean().optional(),
				search: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"inventory",
				"read",
			);

			return listSuppliers(context.tenantDb, {
				isActive: input.isActive,
				search: input.search,
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
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"inventory",
				"read",
			);

			const supplier = await getSupplierById(context.tenantDb, input.id);
			if (!supplier) {
				throw new ORPCError("NOT_FOUND", {
					message: `Supplier not found: ${input.id}`,
				});
			}
			return supplier;
		}),

	create: tenantProcedure
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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"inventory",
				"create",
			);

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

	update: tenantProcedure
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
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"inventory",
				"update",
			);

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

	deactivate: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"inventory",
				"update",
			);

			return deactivateSupplier(context.tenantDb, input.id);
		}),
};
