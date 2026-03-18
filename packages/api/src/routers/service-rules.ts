/**
 * Service Rules Router
 *
 * API endpoint for upserting booking and cancellation rules per service.
 * Uses INSERT ... ON CONFLICT (service_id) DO UPDATE for upsert behavior.
 */

import { serviceRules } from "@avantej-core/db/schema/tenant/service-rules";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { requirePermission } from "@avantej-core/services";

const durationUnitSchema = z.enum(["seconds", "minutes", "hours", "days"]);

export const serviceRulesRouter = {
	/**
	 * Upsert booking/cancellation rules for a service
	 *
	 * Creates or updates the rules config based on service_id uniqueness.
	 */
	upsert: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				serviceId: z.string().uuid(),
				requireAdvanceBooking: z.boolean().optional(),
				minAdvanceBookingDuration: z.number().int().nullable().optional(),
				minAdvanceBookingUnitType: durationUnitSchema.optional(),
				enableCancellationWindow: z.boolean().optional(),
				cancellationCutoffDuration: z.number().int().nullable().optional(),
				cancellationCutoffUnitType: durationUnitSchema.optional(),
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
				requireAdvanceBooking: input.requireAdvanceBooking ?? false,
				minAdvanceBookingDuration: input.minAdvanceBookingDuration ?? null,
				minAdvanceBookingUnitType:
					input.minAdvanceBookingUnitType ?? "hours",
				enableCancellationWindow: input.enableCancellationWindow ?? false,
				cancellationCutoffDuration:
					input.cancellationCutoffDuration ?? null,
				cancellationCutoffUnitType:
					input.cancellationCutoffUnitType ?? "hours",
				updatedAt: new Date(),
			};

			const [result] = await context.tenantDb
				.insert(serviceRules)
				.values(values)
				.onConflictDoUpdate({
					target: serviceRules.serviceId,
					set: {
						requireAdvanceBooking: values.requireAdvanceBooking,
						minAdvanceBookingDuration: values.minAdvanceBookingDuration,
						minAdvanceBookingUnitType: values.minAdvanceBookingUnitType,
						enableCancellationWindow: values.enableCancellationWindow,
						cancellationCutoffDuration:
							values.cancellationCutoffDuration,
						cancellationCutoffUnitType:
							values.cancellationCutoffUnitType,
						updatedAt: values.updatedAt,
					},
				})
				.returning();

			return result;
		}),
};
