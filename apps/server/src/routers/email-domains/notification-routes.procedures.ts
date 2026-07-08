/**
 * Email Domain Router — notification-routing procedures.
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import {
	getVerifiedEmailDomainForOrg,
	listAliasesForDomain,
} from "@avantej-core/services/email-domain.service";
import {
	deleteNotificationRoute,
	listNotificationRoutes,
	upsertNotificationRoute,
} from "@avantej-core/services/notification-route.service";
import { NOTIFICATION_TYPES } from "@avantej-core/services/notification-routing";
import {
	auditEmailDomainChange,
	getControlPanelDb,
	requireOrgAdmin,
} from "./_shared";

export const notificationRouteProcedures = {
	/**
	 * One-shot config for the Notification routing panel: the org's existing
	 * routes (with joined alias info), the verified-domain alias options for the
	 * dropdowns, and the verified-domain meta for the live "Will send as" preview.
	 */
	getNotificationRouting: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			const routes = await listNotificationRoutes(cpDb, input.organizationId);
			const verified = await getVerifiedEmailDomainForOrg(
				cpDb,
				input.organizationId,
			);
			const aliases = verified
				? await listAliasesForDomain(cpDb, verified.id)
				: [];
			return {
				routes,
				aliases: aliases.map((a) => ({
					id: a.id,
					localPart: a.localPart,
					label: a.label,
				})),
				verifiedDomain: verified
					? {
							id: verified.id,
							domain: verified.domain,
							fromName: verified.fromName,
							defaultLocalPart: verified.defaultLocalPart,
						}
					: null,
			};
		}),

	/**
	 * Create/replace the route for a notification type. Validates that a
	 * supplied aliasId belongs to the org's own verified domain (cross-org
	 * binding guard).
	 */
	upsertNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum(NOTIFICATION_TYPES),
				aliasId: z.string().uuid().nullable().optional(),
				fromNameOverride: z.string().min(1).max(100).nullable().optional(),
				subjectOverride: z.string().min(1).max(255).nullable().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			if (input.aliasId) {
				const verified = await getVerifiedEmailDomainForOrg(
					cpDb,
					input.organizationId,
				);
				// No verified domain → no alias can belong to this org. Fail fast
				// (and avoid a needless alias query) rather than relying on the
				// empty-list .some() below.
				if (!verified) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Organization has no verified sending domain; cannot bind an alias",
					});
				}
				const aliases = await listAliasesForDomain(cpDb, verified.id);
				if (!aliases.some((a) => a.id === input.aliasId)) {
					throw new ORPCError("BAD_REQUEST", {
						message:
							"Alias does not belong to this organization's verified domain",
					});
				}
			}

			const row = await upsertNotificationRoute(cpDb, {
				organizationId: input.organizationId,
				notificationType: input.notificationType,
				aliasId: input.aliasId,
				fromNameOverride: input.fromNameOverride,
				subjectOverride: input.subjectOverride,
			});

			await auditEmailDomainChange(context, {
				action: "email_route.changed",
				entityType: "email_notification_route",
				entityId: row.id,
				summary: `Updated notification routing for "${input.notificationType}"`,
				changes: {
					notificationType: input.notificationType,
					aliasId: input.aliasId ?? null,
					fromNameOverride: input.fromNameOverride ?? null,
					subjectOverride: input.subjectOverride ?? null,
				},
			});

			return row;
		}),

	/**
	 * Reset a notification type back to the domain default sender.
	 */
	deleteNotificationRoute: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				notificationType: z.enum(NOTIFICATION_TYPES),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(
				cpDb,
				context.session.user.id,
				input.organizationId,
			);

			const deleted = await deleteNotificationRoute(cpDb, {
				organizationId: input.organizationId,
				notificationType: input.notificationType,
			});

			await auditEmailDomainChange(context, {
				action: "email_route.changed",
				entityType: "email_notification_route",
				entityId: deleted?.id ?? input.organizationId,
				summary: `Reset notification routing for "${input.notificationType}"`,
				changes: { notificationType: input.notificationType, reset: true },
			});

			return {
				deleted: true as const,
				notificationType: input.notificationType,
			};
		}),
};
