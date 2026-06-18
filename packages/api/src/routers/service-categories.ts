/**
 * Service Categories Router
 *
 * API endpoints for managing service categories in tenant organizations.
 * Requires service_management permission for create/update; read for list/getById.
 */

import {
	listServiceCategories,
	getServiceCategoryById,
	createServiceCategory,
	updateServiceCategory,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {
	requirePermissionOrpc,
	assertOrgContextMatch,
	guardInputBranchForContext,
	guardStoredBranchForContext,
	resolveAccessibleNodeIds,
} from "../guards";

const schedulingTypeSchema = z.enum(["appointment", "class_slot"]);

export const serviceCategoriesRouter = {
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
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

			const accessibleNodeIds = await resolveAccessibleNodeIds(context);

			const categories = await listServiceCategories(context.tenantDb, {
				branchId: input.branchId ?? undefined,
				isActive: input.isActive,
				accessibleNodeIds,
			});

			return categories.map((c) => ({
				id: c.id,
				name: c.name,
				description: c.description,
				displayOrder: c.displayOrder,
				branchId: c.branchId,
				isActive: c.isActive,
				schedulingType: c.schedulingType,
				createdAt: c.createdAt,
				updatedAt: c.updatedAt,
			}));
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
			if (context.member.role !== "client") {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			const category = await getServiceCategoryById(context.tenantDb, input.id);
			if (!category) {
				throw new ORPCError("NOT_FOUND", {
					message: "Service category not found",
				});
			}

			// Stored value: null = org-wide category (viewable by any member with
			// service_management:read, enforced above); branch-pinned = RBAC check.
			await guardStoredBranchForContext(context, category.branchId);

			return {
				id: category.id,
				name: category.name,
				description: category.description,
				displayOrder: category.displayOrder,
				branchId: category.branchId,
				isActive: category.isActive,
				schedulingType: category.schedulingType,
				createdAt: category.createdAt,
				updatedAt: category.updatedAt,
			};
		}),

	create: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				description: z.string().nullable().optional(),
				displayOrder: z.number().int().min(0).optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				schedulingType: schedulingTypeSchema.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"create",
			);

			await guardInputBranchForContext(context, input.branchId);

			try {
				const category = await createServiceCategory(context.tenantDb, {
					name: input.name,
					description: input.description ?? null,
					displayOrder: input.displayOrder,
					branchId: input.branchId ?? null,
					isActive: input.isActive,
					schedulingType: input.schedulingType,
					createdBy: context.session?.user?.id ?? null,
				});
				return {
					id: category.id,
					name: category.name,
					description: category.description,
					displayOrder: category.displayOrder,
					branchId: category.branchId,
					isActive: category.isActive,
					schedulingType: category.schedulingType,
					createdAt: category.createdAt,
					updatedAt: category.updatedAt,
				};
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to create category",
				});
			}
		}),

	update: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				description: z.string().nullable().optional(),
				displayOrder: z.number().int().min(0).optional(),
				branchId: z.string().uuid().nullable().optional(),
				isActive: z.boolean().optional(),
				schedulingType: schedulingTypeSchema.optional(),
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

			const existing = await getServiceCategoryById(context.tenantDb, input.id);
			if (!existing) {
				throw new ORPCError("NOT_FOUND", {
					message: "Service category not found",
				});
			}

			await guardStoredBranchForContext(context, existing.branchId);
			await guardInputBranchForContext(context, input.branchId);

			try {
				const category = await updateServiceCategory(
					context.tenantDb,
					input.id,
					{
						name: input.name,
						description: input.description,
						displayOrder: input.displayOrder,
						branchId: input.branchId,
						isActive: input.isActive,
						schedulingType: input.schedulingType,
						updatedBy: context.session?.user?.id ?? null,
					},
				);
				return {
					id: category.id,
					name: category.name,
					description: category.description,
					displayOrder: category.displayOrder,
					branchId: category.branchId,
					isActive: category.isActive,
					schedulingType: category.schedulingType,
					createdAt: category.createdAt,
					updatedAt: category.updatedAt,
				};
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to update category",
				});
			}
		}),
};
