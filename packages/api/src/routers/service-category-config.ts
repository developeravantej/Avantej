/**
 * Service Category Config Router
 *
 * API endpoints for managing booking rules per service category.
 * 1:1 relationship with service_categories.
 * Commission configuration has moved to category-commission router.
 * Uses INSERT ... ON CONFLICT (category_id) DO UPDATE for upsert behavior.
 */

import { serviceCategoryConfig } from "@avantej-core/db/schema/tenant/service-category-config";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../index";
import {requirePermissionOrpc, assertOrgContextMatch } from "../guards";

export const serviceCategoryConfigRouter = {
	/**
	 * Upsert booking rules + commission config for a service category.
	 *
	 * Creates or updates based on category_id uniqueness.
	 */
	upsert: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
				// Default values for services in this category
				defaultDuration: z.number().int().min(1).nullable().optional(),
				defaultMaxAttendees: z.number().int().min(0).nullable().optional(),
				// Booking rules
				requireAdvanceBooking: z.boolean().optional(),
				minAdvanceHours: z.number().int().min(0).nullable().optional(),
				// Cancellation rules
				enableCancellationWindow: z.boolean().optional(),
				cancellationCutoffHours: z.number().int().min(0).nullable().optional(),
				bufferTimeMinutes: z.number().int().min(0).max(480).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			let hasPermission = false;
			for (const action of ["create", "update"] as const) {
				try {
					await requirePermissionOrpc(
						context.tenantDb,
						context.member,
						"service_management",
						action,
					);
					hasPermission = true;
					break;
				} catch {
					// Try next action
				}
			}
			if (!hasPermission) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Permission denied: requires service_management create or update",
				});
			}

			const now = new Date();
			const values = {
				categoryId: input.categoryId,
				defaultDuration: input.defaultDuration ?? null,
				defaultMaxAttendees: input.defaultMaxAttendees ?? null,
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
	getByCategoryId: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				categoryId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			await requirePermissionOrpc(
				context.tenantDb,
				context.member,
				"service_management",
				"read",
			);

			const row = await context.tenantDb.query.serviceCategoryConfig.findFirst({
				where: eq(serviceCategoryConfig.categoryId, input.categoryId),
			});

			return row ?? null;
		}),
};
