/**
 * Service Commission Config Router
 *
 * API endpoint for upserting commission configuration per service.
 * Uses INSERT ... ON CONFLICT (service_id) DO UPDATE for upsert behavior.
 */

import { serviceCommissionConfig } from "@avantej-core/db/schema/tenant/service-commission-config";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";

export const serviceCommissionConfigRouter = {
	/**
	 * Upsert commission configuration for a service
	 *
	 * Creates or updates the commission config based on service_id uniqueness.
	 */
	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
				commissionType: z.enum(["fixed", "percentage", "position_based"]),
				fixedAmounts: z
					.record(z.string(), z.number())
					.nullable()
					.optional(),
				staffPoolPercentage: z.number().int().min(0).max(100).optional(),
				positionWeightage: z
					.array(
						z.object({
							position: z.number().int(),
							percentage: z.number(),
							title: z.string().optional(),
						})
					)
					.nullable()
					.optional(),
				maxStaff: z.number().int().min(1).optional(),
			})
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

			// Check for service_management create or update permission
			let hasPermission = false;
			for (const action of ["create", "update"] as const) {
				try {
					await requirePermission(
						context.tenantDb,
						context.member,
						"service_management",
						action
					);
					hasPermission = true;
					break;
				} catch {
					// Try next action
				}
			}
			if (!hasPermission) {
				throw new ORPCError("FORBIDDEN", {
					message: "Permission denied: requires service_management create or update",
				});
			}

			const values = {
				serviceId: input.serviceId,
				commissionType: input.commissionType,
				fixedAmounts: input.fixedAmounts ?? null,
				staffPoolPercentage: input.staffPoolPercentage ?? 100,
				positionWeightage: input.positionWeightage ?? null,
				maxStaff: input.maxStaff ?? 1,
				updatedAt: new Date(),
			};

			const [result] = await context.tenantDb
				.insert(serviceCommissionConfig)
				.values(values)
				.onConflictDoUpdate({
					target: serviceCommissionConfig.serviceId,
					set: {
						commissionType: values.commissionType,
						fixedAmounts: values.fixedAmounts,
						staffPoolPercentage: values.staffPoolPercentage,
						positionWeightage: values.positionWeightage,
						maxStaff: values.maxStaff,
						updatedAt: values.updatedAt,
					},
				})
				.returning();

			return result;
		}),
};
