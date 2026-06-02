/**
 * Platform Admin — Comms router (Plan F.2.5, Agent C).
 *
 * Two surfaces:
 *  - Outbox: read-only view over admin_session_actions filtered to the
 *    two comms action types (`tenant_dm`, `tenant_announcement_create`)
 *    written by platform-admin-tenants-comms (Plan E.5). Joined with
 *    users (actor) + organizations (target) for display.
 *  - Templates: CRUD on comms_templates. Mutations are super-admin only.
 *
 * Outbox is read-only and does NOT write audit rows.
 * Template mutations DO write audit rows with action_type values:
 *   - comms_template_create
 *   - comms_template_update
 *   - comms_template_archive
 *   - comms_template_unarchive
 *
 * NOTE on action strings: the existing comms procedures
 * (platform-admin-tenants-comms.ts) write `tenant_dm` and
 * `tenant_announcement_create` as action_type. The plan doc references
 * `tenant.direct_message_sent` / `tenant.announcement_created`, but the
 * actual source-of-truth strings are used here.
 */

import { z } from "zod";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import {
	platformAdminProcedure as adminProcedure,
	superAdminProcedure,
} from "@avantej-core/api";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { adminSessions } from "@avantej-core/db/schema/control-panel/admin-sessions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { commsTemplates } from "@avantej-core/db/schema/control-panel/comms-templates";

const COMMS_ACTION_TYPES = ["tenant_dm", "tenant_announcement_create"] as const;

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (context as { honoContext?: { get: (k: string) => unknown } }).honoContext?.get(
		"controlPanelDb",
	) as NeonDatabase<typeof controlPanelSchema> | undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id) throw new ORPCError("UNAUTHORIZED", { message: "No admin user in session" });
	return id;
}

const actorIdExpr = sql<string | null>`COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId})`;

const kindEnum = z.enum(["direct_message", "announcement"]);
const priorityEnum = z.enum(["info", "warning", "critical"]);
const audienceEnum = z.enum(["all", "staff", "clients"]);

// Map outbox action_type → kind for display.
function actionTypeToKind(
	actionType: string,
): "direct_message" | "announcement" | null {
	if (actionType === "tenant_dm") return "direct_message";
	if (actionType === "tenant_announcement_create") return "announcement";
	return null;
}

export const platformAdminCommsRouter = {
	// ── Outbox ─────────────────────────────────────────────────────────
	listOutbox: adminProcedure
		.input(
			z.object({
				kind: kindEnum.optional(),
				actorUserId: z.string().optional(),
				targetOrgId: z.string().uuid().optional(),
				days: z.number().int().positive().max(365).default(90),
				page: z.number().int().positive().default(1),
				limit: z.number().int().positive().max(200).default(50),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const offset = (input.page - 1) * input.limit;

			const filters: any[] = [];
			if (input.kind === "direct_message") {
				filters.push(eq(adminSessionActions.actionType, "tenant_dm"));
			} else if (input.kind === "announcement") {
				filters.push(
					eq(adminSessionActions.actionType, "tenant_announcement_create"),
				);
			} else {
				filters.push(inArray(adminSessionActions.actionType, [...COMMS_ACTION_TYPES]));
			}
			if (input.actorUserId) {
				filters.push(
					sql`COALESCE(${adminSessionActions.adminUserId}, ${adminSessions.adminUserId}) = ${input.actorUserId}`,
				);
			}
			if (input.targetOrgId) {
				filters.push(eq(adminSessionActions.targetOrganizationId, input.targetOrgId));
			}
			const sinceDate = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
			filters.push(gte(adminSessionActions.createdAt, sinceDate));

			const where = and(...filters);

			const [totalRow] = await cpDb
				.select({ c: count() })
				.from(adminSessionActions)
				.leftJoin(
					adminSessions,
					eq(adminSessions.id, adminSessionActions.adminSessionId),
				)
				.where(where);

			const dbRows = await cpDb
				.select({
					id: adminSessionActions.id,
					actionType: adminSessionActions.actionType,
					actorUserId: actorIdExpr,
					actorEmail: users.email,
					actorName: users.name,
					targetOrganizationId: adminSessionActions.targetOrganizationId,
					targetOrgName: organizations.name,
					metadata: adminSessionActions.metadata,
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

			const rows = dbRows.map((r) => {
				const meta = (r.metadata ?? {}) as Record<string, unknown>;
				const subject =
					(typeof meta.subject === "string" && meta.subject) ||
					(typeof meta.title === "string" && meta.title) ||
					"(no subject)";
				const kind = actionTypeToKind(r.actionType) ?? "direct_message";
				return {
					id: r.id,
					kind,
					actionType: r.actionType,
					actor: r.actorUserId
						? {
								id: r.actorUserId,
								name: r.actorName ?? null,
								email: r.actorEmail ?? null,
							}
						: null,
					targetOrg: r.targetOrganizationId
						? {
								id: r.targetOrganizationId,
								name: r.targetOrgName ?? "(unknown)",
							}
						: null,
					subject: subject as string,
					metadata: r.metadata,
					sentAt: r.createdAt,
				};
			});

			return {
				rows,
				total: Number(totalRow?.c ?? 0),
				page: input.page,
				limit: input.limit,
			};
		}),

	// ── Templates ──────────────────────────────────────────────────────
	listTemplates: adminProcedure
		.input(
			z.object({
				kind: kindEnum.optional(),
				includeArchived: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const filters: any[] = [];
			if (input.kind) filters.push(eq(commsTemplates.kind, input.kind));
			if (!input.includeArchived) filters.push(isNull(commsTemplates.archivedAt));
			const where = filters.length ? and(...filters) : undefined;

			const rows = await cpDb
				.select()
				.from(commsTemplates)
				.where(where)
				.orderBy(desc(commsTemplates.createdAt));
			return { templates: rows };
		}),

	getTemplate: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const [row] = await cpDb
				.select()
				.from(commsTemplates)
				.where(eq(commsTemplates.id, input.id));
			return { template: row ?? null };
		}),

	createTemplate: superAdminProcedure
		.input(
			z.object({
				name: z.string().trim().min(1).max(200),
				subject: z.string().trim().min(1).max(200),
				bodyMarkdown: z.string().trim().min(1).max(20000),
				kind: kindEnum,
				priority: priorityEnum.optional(),
				targetAudience: audienceEnum.optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);

			const [inserted] = await cpDb
				.insert(commsTemplates)
				.values({
					name: input.name,
					subject: input.subject,
					bodyMarkdown: input.bodyMarkdown,
					kind: input.kind,
					priority: input.priority ?? null,
					targetAudience: input.targetAudience ?? null,
					createdByUserId: adminUserId,
				})
				.returning();

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "comms_template_create",
				metadata: {
					templateId: inserted?.id,
					kind: input.kind,
					name: input.name,
				},
			});

			return { ok: true, template: inserted };
		}),

	updateTemplate: superAdminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(200).optional(),
				subject: z.string().trim().min(1).max(200).optional(),
				bodyMarkdown: z.string().trim().min(1).max(20000).optional(),
				priority: priorityEnum.optional().nullable(),
				targetAudience: audienceEnum.optional().nullable(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);

			const patch: Record<string, unknown> = { updatedAt: new Date() };
			if (input.name !== undefined) patch.name = input.name;
			if (input.subject !== undefined) patch.subject = input.subject;
			if (input.bodyMarkdown !== undefined) patch.bodyMarkdown = input.bodyMarkdown;
			if (input.priority !== undefined) patch.priority = input.priority;
			if (input.targetAudience !== undefined) patch.targetAudience = input.targetAudience;

			const [updated] = await cpDb
				.update(commsTemplates)
				.set(patch)
				.where(eq(commsTemplates.id, input.id))
				.returning();

			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Template not found" });
			}

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "comms_template_update",
				metadata: { templateId: input.id, fields: Object.keys(patch) },
			});

			return { ok: true, template: updated };
		}),

	archiveTemplate: superAdminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);
			const [updated] = await cpDb
				.update(commsTemplates)
				.set({ archivedAt: new Date(), updatedAt: new Date() })
				.where(eq(commsTemplates.id, input.id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Template not found" });
			}
			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "comms_template_archive",
				metadata: { templateId: input.id },
			});
			return { ok: true, template: updated };
		}),

	unarchiveTemplate: superAdminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);
			const [updated] = await cpDb
				.update(commsTemplates)
				.set({ archivedAt: null, updatedAt: new Date() })
				.where(eq(commsTemplates.id, input.id))
				.returning();
			if (!updated) {
				throw new ORPCError("NOT_FOUND", { message: "Template not found" });
			}
			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "comms_template_unarchive",
				metadata: { templateId: input.id },
			});
			return { ok: true, template: updated };
		}),
};
