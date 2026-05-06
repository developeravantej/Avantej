/**
 * Households router (Phase 3 Agent 3.6)
 *
 * Group customer profiles into a billing / family unit so a parent-payer can
 * cover dependents. The reverse pointer lives on `customer_profiles.householdId`;
 * the cycle is handled at the DB layer (DEFERRABLE FK) — see migration 0045.
 *
 * Permission gate: `customer_management` (read for fetch/list, update for
 * create / addMember / removeMember). Same gate the customer-360 page uses,
 * so anyone able to edit a customer can also slot them into a household.
 */

import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { households } from "@avantej-core/db/schema/tenant/households";
import { members } from "@avantej-core/db/schema/tenant/members";
import { requirePermission } from "@avantej-core/services";
import { ORPCError } from "@orpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";

function ensureCtx(context: {
	tenantDb?: unknown;
	member?: { userId?: string | null } | null;
}): asserts context is {
	tenantDb: NonNullable<typeof context.tenantDb>;
	member: NonNullable<typeof context.member> & { userId: string };
} {
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
}

async function checkPermission(
	context: { tenantDb: unknown; member: unknown },
	action: "read" | "update",
) {
	try {
		await requirePermission(
			// biome-ignore lint/suspicious/noExplicitAny: ctx types are constrained at call site
			context.tenantDb as any,
			// biome-ignore lint/suspicious/noExplicitAny: ctx types are constrained at call site
			context.member as any,
			"customer_management",
			action,
		);
	} catch (error) {
		throw new ORPCError("FORBIDDEN", {
			message: error instanceof Error ? error.message : "Permission denied",
		});
	}
}

export const householdsRouter = {
	/** Create a new household. Optionally bind a primary contact profile. */
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1).max(200),
				primaryContactProfileId: z.string().uuid().nullable().optional(),
				notes: z.string().nullable().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			// biome-ignore lint/suspicious/noExplicitAny: tenantDb is dynamic
			const db = context.tenantDb as any;

			// If a primary contact is supplied, run the insert + reverse-link in a
			// single tx so the deferrable cycle resolves on commit.
			const result = await db.transaction(async (tx: any) => {
				const [row] = await tx
					.insert(households)
					.values({
						name: input.name,
						primaryContactProfileId: input.primaryContactProfileId ?? null,
						notes: input.notes ?? null,
						createdBy: context.member.userId,
					})
					.returning();

				if (input.primaryContactProfileId) {
					await tx
						.update(customerProfiles)
						.set({ householdId: row.id })
						.where(eq(customerProfiles.id, input.primaryContactProfileId));
				}

				return row;
			});

			return result;
		}),

	/** Add a customer profile to a household. */
	addMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				householdId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			// biome-ignore lint/suspicious/noExplicitAny: tenantDb is dynamic
			const db = context.tenantDb as any;

			const household = await db.query.households.findFirst({
				where: eq(households.id, input.householdId),
			});
			if (!household) {
				throw new ORPCError("NOT_FOUND", { message: "Household not found" });
			}

			const profile = await db.query.customerProfiles.findFirst({
				where: eq(customerProfiles.id, input.customerProfileId),
			});
			if (!profile) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}

			const [updated] = await db
				.update(customerProfiles)
				.set({ householdId: input.householdId })
				.where(eq(customerProfiles.id, input.customerProfileId))
				.returning();

			return updated;
		}),

	/** Remove a customer profile from any household (clears household_id). */
	removeMember: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				customerProfileId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			ensureCtx(context);
			await checkPermission(context, "update");

			// biome-ignore lint/suspicious/noExplicitAny: tenantDb is dynamic
			const db = context.tenantDb as any;

			const profile = await db.query.customerProfiles.findFirst({
				where: eq(customerProfiles.id, input.customerProfileId),
			});
			if (!profile) {
				throw new ORPCError("NOT_FOUND", {
					message: "Customer profile not found",
				});
			}

			// If this profile is the primary contact for its household, clear that
			// pointer too so we don't leave a dangling reference.
			if (profile.householdId) {
				const household = await db.query.households.findFirst({
					where: eq(households.id, profile.householdId),
				});
				if (
					household?.primaryContactProfileId === input.customerProfileId
				) {
					await db
						.update(households)
						.set({ primaryContactProfileId: null })
						.where(eq(households.id, profile.householdId));
				}
			}

			const [updated] = await db
				.update(customerProfiles)
				.set({ householdId: null })
				.where(eq(customerProfiles.id, input.customerProfileId))
				.returning();

			return updated;
		}),

	/** Fetch one household with all its members (joined to user for display). */
	get: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				householdId: z.string().uuid(),
			}),
		)
		.handler(async ({ context, input }) => {
			ensureCtx(context);
			await checkPermission(context, "read");

			// biome-ignore lint/suspicious/noExplicitAny: tenantDb is dynamic
			const db = context.tenantDb as any;

			const household = await db.query.households.findFirst({
				where: eq(households.id, input.householdId),
			});
			if (!household) {
				throw new ORPCError("NOT_FOUND", { message: "Household not found" });
			}

			const profileRows = await db
				.select({
					id: customerProfiles.id,
					userId: customerProfiles.userId,
					phone: customerProfiles.phone,
					householdId: customerProfiles.householdId,
				})
				.from(customerProfiles)
				.where(eq(customerProfiles.householdId, input.householdId));

			return {
				...household,
				members: profileRows,
			};
		}),

	/**
	 * List households. Optional `branchId` narrows the result to households that
	 * have at least one member whose tenant `members` row is scoped to that
	 * branch (hierarchyScopeId). Without `branchId` returns all households.
	 */
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				branchId: z.string().uuid().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			ensureCtx(context);
			await checkPermission(context, "read");

			// biome-ignore lint/suspicious/noExplicitAny: tenantDb is dynamic
			const db = context.tenantDb as any;

			if (!input.branchId) {
				return db
					.select()
					.from(households)
					.orderBy(asc(households.name));
			}

			// branchId filter: find userIds of members in that branch, map to
			// customer_profiles, take their distinct householdIds.
			const memberRows = await db
				.select({ userId: members.userId })
				.from(members)
				.where(eq(members.hierarchyScopeId, input.branchId));

			if (memberRows.length === 0) return [];

			const userIds = memberRows
				.map((r: { userId: string | null }) => r.userId)
				.filter((u: string | null): u is string => !!u);

			if (userIds.length === 0) return [];

			const profileRows = await db
				.select({ householdId: customerProfiles.householdId })
				.from(customerProfiles)
				.where(inArray(customerProfiles.userId, userIds));

			const householdIdSet = new Set<string>();
			for (const r of profileRows as Array<{ householdId: string | null }>) {
				if (r.householdId) householdIdSet.add(r.householdId);
			}
			const householdIds: string[] = Array.from(householdIdSet);

			if (householdIds.length === 0) return [];

			return db
				.select()
				.from(households)
				.where(inArray(households.id, householdIds))
				.orderBy(asc(households.name));
		}),
};
