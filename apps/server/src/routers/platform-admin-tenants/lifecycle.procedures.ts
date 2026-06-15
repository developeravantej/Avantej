import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { subscriptions } from "@avantej-core/db/schema/control-panel/subscriptions";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { getStripeClient } from "@/lib/stripe";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { superAdminProcedure, adminUserIdFrom } from "./_shared";

export const lifecycleProcedures = {
	// E.3 — Lifecycle ops. super_admin only. Each writes an audit row.
	suspendTenant: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const [updated] = await cpDb
				.update(organizations)
				.set({ paymentStatus: "suspended", updatedAt: new Date() })
				.where(eq(organizations.id, input.organizationId))
				.returning({
					id: organizations.id,
					paymentStatus: organizations.paymentStatus,
				});

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_suspend",
				targetOrganizationId: input.organizationId,
				metadata: { reason: input.reason },
			});

			return { ok: true, paymentStatus: updated.paymentStatus };
		}),

	resumeTenant: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const [updated] = await cpDb
				.update(organizations)
				.set({ paymentStatus: "active", updatedAt: new Date() })
				.where(eq(organizations.id, input.organizationId))
				.returning({
					id: organizations.id,
					paymentStatus: organizations.paymentStatus,
				});

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_resume",
				targetOrganizationId: input.organizationId,
				metadata: { reason: input.reason },
			});

			return { ok: true, paymentStatus: updated.paymentStatus };
		}),

	forceCancelTenant: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				reason: z.string().trim().min(3).max(500),
				cancelStripeSubscription: z.boolean().default(true),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const [org] = await cpDb
				.select({
					id: organizations.id,
					subscriptionId: organizations.subscriptionId,
				})
				.from(organizations)
				.where(eq(organizations.id, input.organizationId));

			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			let stripeSubCanceled: string | null = null;
			if (input.cancelStripeSubscription && org.subscriptionId) {
				const [sub] = await cpDb
					.select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
					.from(subscriptions)
					.where(eq(subscriptions.id, org.subscriptionId));
				if (sub?.stripeSubscriptionId) {
					try {
						await getStripeClient().subscriptions.cancel(
							sub.stripeSubscriptionId,
						);
						stripeSubCanceled = sub.stripeSubscriptionId;
					} catch (e) {
						const msg = e instanceof Error ? e.message : String(e);
						console.error(`[forceCancelTenant] stripe cancel failed:`, msg);
					}
				}
			}

			await cpDb
				.update(organizations)
				.set({ paymentStatus: "cancelled", updatedAt: new Date() })
				.where(eq(organizations.id, input.organizationId));

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_force_cancel",
				targetOrganizationId: input.organizationId,
				metadata: { reason: input.reason, stripeSubCanceled },
			});

			return { ok: true, stripeSubCanceled };
		}),

	reTrialTenant: superAdminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				extendDays: z.number().int().positive().max(180),
				reason: z.string().trim().min(3).max(500),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const adminUserId = adminUserIdFrom(context);

			const now = new Date();
			const newTrialEnd = new Date(
				now.getTime() + input.extendDays * 24 * 60 * 60 * 1000,
			);

			const [updated] = await cpDb
				.update(organizations)
				.set({
					trialEndsAt: newTrialEnd,
					paymentStatus: "active",
					updatedAt: now,
				})
				.where(eq(organizations.id, input.organizationId))
				.returning({
					id: organizations.id,
					trialEndsAt: organizations.trialEndsAt,
				});

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_re_trial",
				targetOrganizationId: input.organizationId,
				metadata: { reason: input.reason, extendDays: input.extendDays },
			});

			return { ok: true, trialEndsAt: updated.trialEndsAt };
		}),
};
