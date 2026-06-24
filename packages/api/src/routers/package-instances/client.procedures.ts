import {
	listPackageInstancesForClient,
	getPackageInstanceById,
	togglePackagePin,
} from "@avantej-core/services";
import { members } from "@avantej-core/db/schema/tenant/members";
import { user } from "@avantej-core/db/schema/auth";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { tenantProcedure } from "../../index";
import { requirePermissionOrpc, assertOrgContextMatch } from "../../guards";
import { getControlPanelDb } from "../../lib/context-helpers";
import { sourceSchema, statusSchema } from "./schemas";

export const packageInstancesClientProcedures = {
	/**
	 * List package instances for the current user (client view). Uses session user id as client_id.
	 */
	listForClient: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				status: statusSchema.optional(),
				source: sourceSchema.optional(),
				limit: z.number().int().min(1).max(200).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const clientId = context.session?.user?.id;
			if (!clientId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			const items = await listPackageInstancesForClient(context.tenantDb, {
				clientId,
				status: input.status,
				source: input.source,
				limit: input.limit,
			});

			return items;
		}),

	getActiveForClient: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ context }) => {
			const clientId = context.session?.user?.id;
			if (!clientId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			const items = await listPackageInstancesForClient(context.tenantDb, {
				clientId,
				status: "active",
				limit: 1,
			});

			return items[0] ?? null;
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
			const instance = await getPackageInstanceById(context.tenantDb, input.id);
			if (!instance) {
				throw new ORPCError("NOT_FOUND", {
					message: "Package instance not found",
				});
			}

			const clientId = context.session?.user?.id;
			const isClient = clientId && instance.clientId === clientId;
			const isStaff = context.member;

			if (!isClient && !isStaff) {
				throw new ORPCError("FORBIDDEN", {
					message: "Access denied",
				});
			}

			if (isStaff && !isClient) {
				await requirePermissionOrpc(
					context.tenantDb,
					context.member,
					"service_management",
					"read",
				);
			}

			// Enrich with assigned trainer name when present
			let assignedTrainerName: string | null = null;
			if (instance.assignedTrainerId) {
				try {
					const controlPanelDb = getControlPanelDb(context);
					// Resolve member → userId → user.name
					const [trainerMember] = await context.tenantDb
						.select({ userId: members.userId })
						.from(members)
						.where(eq(members.id, instance.assignedTrainerId));
					if (trainerMember) {
						const [trainerUser] = await controlPanelDb
							.select({ name: user.name })
							.from(user)
							.where(eq(user.id, trainerMember.userId));
						assignedTrainerName = trainerUser?.name ?? null;
					}
				} catch {
					// Non-critical — proceed without name
				}
			}

			// Enrich with preferred trainer name when present
			let preferredTrainerName: string | null = null;
			if (instance.preferredTrainerId) {
				try {
					const controlPanelDb = getControlPanelDb(context);
					const [prefMember] = await context.tenantDb
						.select({ userId: members.userId })
						.from(members)
						.where(eq(members.id, instance.preferredTrainerId));
					if (prefMember) {
						const [prefUser] = await controlPanelDb
							.select({ name: user.name })
							.from(user)
							.where(eq(user.id, prefMember.userId));
						preferredTrainerName = prefUser?.name ?? null;
					}
				} catch {
					// Non-critical — proceed without name
				}
			}

			return { ...instance, assignedTrainerName, preferredTrainerName };
		}),

	/**
	 * Pin / unpin one of the current user's active packages so it leads the
	 * dashboard. clientId is taken from the session (never trusted from input),
	 * so a caller can only pin their OWN package. The service enforces the
	 * single-pin-per-client invariant under a row lock + partial unique index.
	 */
	togglePin: tenantProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				packageInstanceId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			assertOrgContextMatch(context, input);
			const clientId = context.session?.user?.id;
			if (!clientId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "User session required",
				});
			}

			try {
				return await togglePackagePin(context.tenantDb, {
					packageInstanceId: input.packageInstanceId,
					clientId,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Unknown error";
				// A pin-A-vs-pin-B race for the same client slips past the row lock
				// (different rows) and is caught by the partial unique index as a
				// raw 23505 — surface it as a friendly CONFLICT, not a 500.
				if (msg.includes("23505") || msg.includes("one_pin_per_client")) {
					throw new ORPCError("CONFLICT", {
						message: "Another package was just pinned — please retry.",
					});
				}
				if (msg.includes("not found")) {
					throw new ORPCError("NOT_FOUND", { message: msg });
				}
				if (msg.includes("Forbidden")) {
					throw new ORPCError("FORBIDDEN", { message: msg });
				}
				if (msg.includes("active")) {
					throw new ORPCError("BAD_REQUEST", { message: msg });
				}
				throw err;
			}
		}),
};
