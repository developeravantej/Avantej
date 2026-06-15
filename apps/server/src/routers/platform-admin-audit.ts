/**
 * Platform Admin — Audit Log router (Plan E E.6).
 *
 * Read-only view over admin_session_actions joined with admin_sessions
 * and the actor users table. Supports filters on action_type,
 * admin user, target org, and date range.
 */

import { z } from "zod";
import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { adminProcedure } from "@/lib/admin-procedure";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";

// The actor for an action is either the direct admin_user_id (Plan E E.3
// path) or the admin who owns the impersonation session (legacy path).
// We left-join both and COALESCE.
const actorIdExpr = sql<
	string | null
>`COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId})`;

export const platformAdminAuditRouter = {
	listAdminActions: adminProcedure
		.input(
			z.object({
				actionType: z.string().optional(),
				adminUserId: z.string().optional(),
				targetOrganizationId: z.string().uuid().optional(),
				since: z.string().datetime().optional(),
				until: z.string().datetime().optional(),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(200).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = getControlPanelDb(context);
			const offset = (input.page - 1) * input.limit;

			const filters: any[] = [];
			if (input.actionType) {
				filters.push(eq(adminSessionActions.actionType, input.actionType));
			}
			if (input.adminUserId) {
				filters.push(
					sql`COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId}) = ${input.adminUserId}`,
				);
			}
			if (input.targetOrganizationId) {
				filters.push(
					eq(
						adminSessionActions.targetOrganizationId,
						input.targetOrganizationId,
					),
				);
			}
			if (input.since) {
				filters.push(gte(adminSessionActions.createdAt, new Date(input.since)));
			}
			if (input.until) {
				filters.push(lte(adminSessionActions.createdAt, new Date(input.until)));
			}
			const where = filters.length ? and(...filters) : undefined;

			const [totalRow] = await cpDb
				.select({ c: count() })
				.from(adminSessionActions)
				.leftJoin(
					adminSessions,
					eq(adminSessions.id, adminSessionActions.adminSessionId),
				)
				.where(where);

			const rows = await cpDb
				.select({
					id: adminSessionActions.id,
					actionType: adminSessionActions.actionType,
					actorUserId: actorIdExpr,
					actorEmail: users.email,
					actorName: users.name,
					targetOrganizationId: adminSessionActions.targetOrganizationId,
					targetOrgName: organizations.name,
					targetOrgSlug: organizations.slug,
					targetUserId: adminSessionActions.targetUserId,
					metadata: adminSessionActions.metadata,
					adminSessionId: adminSessionActions.adminSessionId,
					createdAt: adminSessionActions.createdAt,
				})
				.from(adminSessionActions)
				.leftJoin(
					adminSessions,
					eq(adminSessions.id, adminSessionActions.adminSessionId),
				)
				.leftJoin(
					users,
					sql`${users.id} = COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId})`,
				)
				.leftJoin(
					organizations,
					eq(organizations.id, adminSessionActions.targetOrganizationId),
				)
				.where(where)
				.orderBy(desc(adminSessionActions.createdAt))
				.limit(input.limit)
				.offset(offset);

			return {
				total: Number(totalRow?.c ?? 0),
				page: input.page,
				limit: input.limit,
				actions: rows,
			};
		}),

	listActionTypes: adminProcedure.handler(async ({ context }) => {
		const cpDb = getControlPanelDb(context);
		const rows = await cpDb
			.selectDistinct({ actionType: adminSessionActions.actionType })
			.from(adminSessionActions)
			.orderBy(adminSessionActions.actionType);
		return { actionTypes: rows.map((r) => r.actionType) };
	}),
};
