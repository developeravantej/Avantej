/**
 * Notification-route service — DB helpers over `email_notification_routes`.
 *
 * `resolveNotificationRoute` uses CORE select + leftJoin (NOT db.query.*) so it
 * works on any Drizzle client, including the narrow ad-hoc clients the
 * Better-Auth callbacks build (org-plugin invite, dispatchAuthEmail) whose
 * schema map does not register these tables.
 */

import { and, asc, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { emailNotificationRoutes } from "@avantej-core/db/schema/control-panel/email-notification-routes";
import { emailDomainAliases } from "@avantej-core/db/schema/control-panel/email-domain-aliases";
import type { NotificationType } from "./notification-routing";

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export type EmailNotificationRouteRow =
	typeof emailNotificationRoutes.$inferSelect;

export interface ResolvedNotificationRoute {
	aliasId: string | null;
	aliasLocalPart: string | null;
	fromNameOverride: string | null;
	subjectOverride: string | null;
}

/** Route row joined with its alias label/local-part for list/UI display. */
export interface NotificationRouteWithAlias extends EmailNotificationRouteRow {
	aliasLocalPart: string | null;
	aliasLabel: string | null;
}

/**
 * Resolve the effective route for (org, type), including the bound alias's
 * local-part (via leftJoin). Returns null when no route row exists.
 */
export async function resolveNotificationRoute(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
	notificationType: NotificationType,
): Promise<ResolvedNotificationRoute | null> {
	const rows = await controlPanelDb
		.select({
			aliasId: emailNotificationRoutes.aliasId,
			aliasLocalPart: emailDomainAliases.localPart,
			fromNameOverride: emailNotificationRoutes.fromNameOverride,
			subjectOverride: emailNotificationRoutes.subjectOverride,
		})
		.from(emailNotificationRoutes)
		.leftJoin(
			emailDomainAliases,
			eq(emailNotificationRoutes.aliasId, emailDomainAliases.id),
		)
		.where(
			and(
				eq(emailNotificationRoutes.organizationId, organizationId),
				eq(emailNotificationRoutes.notificationType, notificationType),
			),
		)
		.limit(1);
	const row = rows[0];
	if (!row) return null;
	return {
		aliasId: row.aliasId ?? null,
		aliasLocalPart: row.aliasLocalPart ?? null,
		fromNameOverride: row.fromNameOverride ?? null,
		subjectOverride: row.subjectOverride ?? null,
	};
}

export async function listNotificationRoutes(
	controlPanelDb: ControlPanelDb,
	organizationId: string,
): Promise<NotificationRouteWithAlias[]> {
	const rows = await controlPanelDb
		.select({
			route: emailNotificationRoutes,
			aliasLocalPart: emailDomainAliases.localPart,
			aliasLabel: emailDomainAliases.label,
		})
		.from(emailNotificationRoutes)
		.leftJoin(
			emailDomainAliases,
			eq(emailNotificationRoutes.aliasId, emailDomainAliases.id),
		)
		.where(eq(emailNotificationRoutes.organizationId, organizationId))
		.orderBy(asc(emailNotificationRoutes.notificationType));
	return rows.map((r) => ({
		...r.route,
		aliasLocalPart: r.aliasLocalPart ?? null,
		aliasLabel: r.aliasLabel ?? null,
	}));
}

export interface UpsertNotificationRouteParams {
	organizationId: string;
	notificationType: NotificationType;
	aliasId?: string | null;
	fromNameOverride?: string | null;
	subjectOverride?: string | null;
}

/**
 * Atomic upsert keyed on the (organization_id, notification_type) unique
 * index — safe under concurrent admin saves.
 */
export async function upsertNotificationRoute(
	controlPanelDb: ControlPanelDb,
	params: UpsertNotificationRouteParams,
): Promise<EmailNotificationRouteRow> {
	const [row] = await controlPanelDb
		.insert(emailNotificationRoutes)
		.values({
			organizationId: params.organizationId,
			notificationType: params.notificationType,
			aliasId: params.aliasId ?? null,
			fromNameOverride: params.fromNameOverride ?? null,
			subjectOverride: params.subjectOverride ?? null,
		})
		.onConflictDoUpdate({
			target: [
				emailNotificationRoutes.organizationId,
				emailNotificationRoutes.notificationType,
			],
			set: {
				aliasId: params.aliasId ?? null,
				fromNameOverride: params.fromNameOverride ?? null,
				subjectOverride: params.subjectOverride ?? null,
				updatedAt: new Date(),
			},
		})
		.returning();
	if (!row) throw new Error("Failed to upsert email_notification_routes row");
	return row;
}

export async function deleteNotificationRoute(
	controlPanelDb: ControlPanelDb,
	params: { organizationId: string; notificationType: NotificationType },
): Promise<EmailNotificationRouteRow | null> {
	const [row] = await controlPanelDb
		.delete(emailNotificationRoutes)
		.where(
			and(
				eq(emailNotificationRoutes.organizationId, params.organizationId),
				eq(emailNotificationRoutes.notificationType, params.notificationType),
			),
		)
		.returning();
	return row ?? null;
}
