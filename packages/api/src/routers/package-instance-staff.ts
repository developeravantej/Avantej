/**
 * Package Instance Staff Router
 *
 * API endpoints for managing staff assignments on package instances.
 * All procedures require package_management permission.
 */

import {
	listPackageInstanceStaff,
	assignPackageInstanceStaff,
	removePackageInstanceStaff,
	replacePackageInstanceStaff,
	requirePermission,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const staffAssignmentSchema = z.object({
	staffId: z.string().uuid(),
	slotIndex: z.number().int().min(0),
	role: z.string().optional(),
});

export const packageInstanceStaffRouter = {
	/**
	 * List all staff assignments for a package instance.
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member!,
				"package_management",
				"read",
			).catch(() => {
				throw new ORPCError("FORBIDDEN", {
					message: "Permission denied: package_management:read required",
				});
			});

			return listPackageInstanceStaff(context.tenantDb, input.packageInstanceId);
		}),

	/**
	 * Assign (or update via UPSERT) a staff member to a slot on a package instance.
	 */
	assign: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				staffId: z.string().uuid(),
				slotIndex: z.number().int().min(0),
				role: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member!,
				"package_management",
				"update",
			).catch(() => {
				throw new ORPCError("FORBIDDEN", {
					message: "Permission denied: package_management:update required",
				});
			});

			try {
				return await assignPackageInstanceStaff(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					staffId: input.staffId,
					slotIndex: input.slotIndex,
					role: input.role,
					assignedBy: context.session?.user?.id,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to assign staff to package instance",
				});
			}
		}),

	/**
	 * Remove a staff member from a package instance by staffId.
	 */
	remove: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				staffId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member!,
				"package_management",
				"update",
			).catch(() => {
				throw new ORPCError("FORBIDDEN", {
					message: "Permission denied: package_management:update required",
				});
			});

			await removePackageInstanceStaff(
				context.tenantDb,
				input.packageInstanceId,
				input.staffId,
			);

			return { success: true };
		}),

	/**
	 * Replace ALL staff assignments for a package instance atomically.
	 */
	replace: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				assignments: z.array(staffAssignmentSchema),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.tenantDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Tenant database not available.",
				});
			}
			await requirePermission(
				context.tenantDb,
				context.member!,
				"package_management",
				"update",
			).catch(() => {
				throw new ORPCError("FORBIDDEN", {
					message: "Permission denied: package_management:update required",
				});
			});

			try {
				return await replacePackageInstanceStaff(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					assignments: input.assignments,
					assignedBy: context.session?.user?.id,
				});
			} catch (error) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						error instanceof Error
							? error.message
							: "Failed to replace staff assignments",
				});
			}
		}),
};
