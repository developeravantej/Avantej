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
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";

const staffAssignmentSchema = z.object({
	staffId: z.string().uuid(),
	slotIndex: z.number().int().min(0),
	role: z.string().optional(),
});

export const packageInstanceStaffRouter = {
	/**
	 * List all staff assignments for a package instance.
	 */
	list: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"read",
			);

			return listPackageInstanceStaff(context.tenantDb, input.packageInstanceId);
		}),

	/**
	 * Assign (or update via UPSERT) a staff member to a slot on a package instance.
	 */
	assign: tenantProcedure
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
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

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
	remove: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				staffId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

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
	replace: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
				assignments: z.array(staffAssignmentSchema),
			}),
		)
		.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"package_management",
				"update",
			);

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
