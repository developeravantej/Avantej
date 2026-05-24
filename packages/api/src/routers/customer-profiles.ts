/**
 * Customer Profiles Router
 *
 * API endpoints for customer profile (get, upsert).
 * - `get` / `upsert`: self-scoped to the session user.
 * - `upsertForCustomer`: admin-scoped, allows managers to edit any client's profile.
 */

import { leadSources } from "@avantej-core/db/schema/tenant/lead-sources";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	getCustomerProfile,

	upsertCustomerProfile,
} from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { tenantProcedure } from "../index";
import { requirePermissionOrpc } from "../guards";

export const customerProfilesRouter = {
	get: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ context }) => {
			

			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			const profile = await getCustomerProfile(context.tenantDb, userId);
			return profile;
		}),

	upsert: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				phone: z.string().nullable().optional(),
				dateOfBirth: z.string().datetime().nullable().optional(),
				gender: z.string().nullable().optional(),
				address: z.string().nullable().optional(),
				emergencyContactName: z.string().nullable().optional(),
				emergencyContactPhone: z.string().nullable().optional(),
				medicalNotes: z.string().nullable().optional(),
				fitnessGoals: z.array(z.string()).nullable().optional(),
				creditPoints: z.number().int().min(0).optional(),
				notes: z.string().nullable().optional(),
				// === 3.2 lead source / attribution ===
				leadSourceId: z.string().uuid().nullable().optional(),
				referrerMemberId: z.string().uuid().nullable().optional(),
				campaignId: z.string().nullable().optional(),
				// === /3.2 ===
			}),
		)
		.handler(async ({ input, context }) => {
			

			const userId = context.session?.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			// Pass through ONLY the fields the client actually sent. The service
			// distinguishes undefined (skip) from null (clear); collapsing them
			// to null here would wipe untouched columns on every partial update.
			const updated = await upsertCustomerProfile(context.tenantDb, {
				userId,
				...(input.phone !== undefined && { phone: input.phone }),
				...(input.dateOfBirth !== undefined && {
					dateOfBirth: input.dateOfBirth
						? new Date(input.dateOfBirth)
						: null,
				}),
				...(input.gender !== undefined && { gender: input.gender }),
				...(input.address !== undefined && { address: input.address }),
				...(input.emergencyContactName !== undefined && {
					emergencyContactName: input.emergencyContactName,
				}),
				...(input.emergencyContactPhone !== undefined && {
					emergencyContactPhone: input.emergencyContactPhone,
				}),
				...(input.medicalNotes !== undefined && {
					medicalNotes: input.medicalNotes,
				}),
				...(input.fitnessGoals !== undefined && {
					fitnessGoals: input.fitnessGoals,
				}),
				...(input.creditPoints !== undefined && {
					creditPoints: input.creditPoints,
				}),
				...(input.notes !== undefined && { notes: input.notes }),
				// === 3.2 lead source / attribution ===
				...(input.leadSourceId !== undefined && {
					leadSourceId: input.leadSourceId,
				}),
				...(input.referrerMemberId !== undefined && {
					referrerMemberId: input.referrerMemberId,
				}),
				...(input.campaignId !== undefined && { campaignId: input.campaignId }),
				// === /3.2 ===
			});
			return updated;
		}),

	/**
	 * Admin-scoped profile upsert.
	 *
	 * Allows managers (customer_management:update) to edit any client's profile.
	 * Verifies the target user is a 'client' member within the caller's accessible scope.
	 * Does NOT touch the existing self-scoped `upsert` above.
	 */
	upsertForCustomer: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				targetUserId: z.string(),
				// nullable so callers can clear a field (null) vs. leave unchanged (undefined)
				phone: z.string().nullable().optional(),
				dateOfBirth: z.string().nullable().optional(), // ISO date string, converted to Date in handler
				gender: z.string().nullable().optional(),
				address: z.string().nullable().optional(),
				emergencyContactName: z.string().nullable().optional(),
				emergencyContactPhone: z.string().nullable().optional(),
				medicalNotes: z.string().nullable().optional(),
				fitnessGoals: z.array(z.string()).nullable().optional(),
				notes: z.string().nullable().optional(),
				// === 3.2 lead source / attribution ===
				leadSourceId: z.string().uuid().nullable().optional(),
				referrerMemberId: z.string().uuid().nullable().optional(),
				campaignId: z.string().nullable().optional(),
				// === /3.2 ===
			}),
		)
		.handler(async ({ context, input }) => {
			
			

			await requirePermissionOrpc(context.tenantDb, context.member, "customer_management", "update");

			// Verify targetUserId is a client member in this tenant
			const target = await context.tenantDb.query.members.findFirst({
				where: and(
					eq(members.userId, input.targetUserId),
					eq(members.role, "client"),
				),
			});
			if (!target) {
				throw new ORPCError("NOT_FOUND", {
					message: "Target customer not found",
				});
			}

			// Row-level RBAC: confirm target is within caller's accessible scope
			const accessibleNodeIds = context.accessibleNodeIds ?? [];
			if (!accessibleNodeIds.includes(target.hierarchyScopeId)) {
				throw new ORPCError("FORBIDDEN", {
					message: "Target customer is outside your accessible scope",
				});
			}

			return upsertCustomerProfile(context.tenantDb, {
				userId: input.targetUserId,
				phone: input.phone,
				dateOfBirth: input.dateOfBirth
					? new Date(input.dateOfBirth)
					: undefined,
				gender: input.gender,
				address: input.address,
				emergencyContactName: input.emergencyContactName,
				emergencyContactPhone: input.emergencyContactPhone,
				medicalNotes: input.medicalNotes,
				fitnessGoals: input.fitnessGoals,
				notes: input.notes,
				// === 3.2 lead source / attribution ===
				leadSourceId: input.leadSourceId,
				referrerMemberId: input.referrerMemberId,
				campaignId: input.campaignId,
				// === /3.2 ===
			});
		}),

	// === 3.2 lead source / attribution ===
	/**
	 * Lookup of acquisition channels for the create-customer / customer-360 pickers.
	 * Returns active rows by default; pass `includeInactive=true` for admin views.
	 */
	listLeadSources: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				includeInactive: z.boolean().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			
			const rows = await context.tenantDb
				.select()
				.from(leadSources)
				.where(input.includeInactive ? undefined : eq(leadSources.isActive, true))
				.orderBy(asc(leadSources.name));
			return rows;
		}),
	// === /3.2 ===
};
