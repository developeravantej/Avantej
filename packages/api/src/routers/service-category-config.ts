/**
 * Service Category Config Router
 *
 * API endpoints for managing booking rules and commission configuration
 * per service category. 1:1 relationship with service_categories.
 * Uses INSERT ... ON CONFLICT (category_id) DO UPDATE for upsert behavior.
 */

import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";

export const serviceCategoryConfigRouter = {
	/**
	 * Upsert booking rules + commission config for a service category.
	 *
	 * Creates or updates based on category_id uniqueness.
	 */
	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
				// Default values for services in this category
				defaultDuration: z.number().int().min(1).nullable().optional(),
				defaultMaxAttendees: z.number().int().min(0).nullable().optional(),
				// Commission/incentive config
				incentiveType: z.string().nullable().optional(),
				isConditional: z.boolean().optional(),
				maxStaff: z.number().int().min(1).optional(),
				staffPoolPercentage: z.number().int().min(0).max(100).optional(),
				staffWeightage: z
					.array(
						z.object({
							position: z.number().int(),
							percentage: z.number(),
							title: z.string().optional(),
						})
					)
					.nullable()
					.optional(),
				paymentStructures: z.record(z.string(), z.unknown()).nullable().optional(),
				threshold: z.number().int().nullable().optional(),
				// Booking rules
				requireAdvanceBooking: z.boolean().optional(),
				minAdvanceHours: z.number().int().min(0).nullable().optional(),
				// Cancellation rules
				enableCancellationWindow: z.boolean().optional(),
				cancellationCutoffHours: z.number().int().min(0).nullable().optional(),
				bufferTimeMinutes: z.number().int().min(0).max(480).optional(),
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

			const now = new Date();
			const values = {
				categoryId: input.categoryId,
				defaultDuration: input.defaultDuration ?? null,
				defaultMaxAttendees: input.defaultMaxAttendees ?? null,
				incentiveType: input.incentiveType ?? null,
				isConditional: input.isConditional ?? false,
				maxStaff: input.maxStaff ?? 1,
				staffPoolPercentage: input.staffPoolPercentage ?? 100,
				staffWeightage: input.staffWeightage ?? null,
				paymentStructures: input.paymentStructures ?? null,
				threshold: input.threshold ?? null,
				requireAdvanceBooking: input.requireAdvanceBooking ?? false,
				minAdvanceHours: input.minAdvanceHours ?? null,
				enableCancellationWindow: input.enableCancellationWindow ?? false,
				cancellationCutoffHours: input.cancellationCutoffHours ?? null,
				bufferTimeMinutes: input.bufferTimeMinutes ?? 0,
				updatedAt: now,
			};

			const [result] = await context.tenantDb
				.insert(serviceCategoryConfig)
				.values(values)
				.onConflictDoUpdate({
					target: serviceCategoryConfig.categoryId,
					set: {
						defaultDuration: values.defaultDuration,
						defaultMaxAttendees: values.defaultMaxAttendees,
						incentiveType: values.incentiveType,
						isConditional: values.isConditional,
						maxStaff: values.maxStaff,
						staffPoolPercentage: values.staffPoolPercentage,
						staffWeightage: values.staffWeightage,
						paymentStructures: values.paymentStructures,
						threshold: values.threshold,
						requireAdvanceBooking: values.requireAdvanceBooking,
						minAdvanceHours: values.minAdvanceHours,
						enableCancellationWindow: values.enableCancellationWindow,
						cancellationCutoffHours: values.cancellationCutoffHours,
						bufferTimeMinutes: values.bufferTimeMinutes,
						updatedAt: values.updatedAt,
					},
				})
				.returning();

			return result;
		}),

	/**
	 * Get config for a specific category.
	 * Returns the config row or null if not yet configured.
	 */
	getByCategoryId: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
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

			try {
				await requirePermission(
					context.tenantDb,
					context.member,
					"service_management",
					"read"
				);
			} catch (error) {
				throw new ORPCError("FORBIDDEN", {
					message: error instanceof Error ? error.message : "Permission denied",
				});
			}

			const row = await context.tenantDb.query.serviceCategoryConfig.findFirst({
				where: eq(serviceCategoryConfig.categoryId, input.categoryId),
			});

			return row ?? null;
		}),
};
