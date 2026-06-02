/**
 * Platform Admin — Tenant Notes (Plan F.1).
 *
 * Internal notes per tenant. Pinned + append-only audit; author can
 * edit/delete own within 1h then frozen. Super-admin can delete anytime.
 * Soft-delete via deleted_at. All mutations write an admin_session_actions
 * audit row, mirroring the Plan E.5 comms pattern.
 *
 * Procs:
 *   - list({ organizationId }) — pinned first, newest first, limit 100,
 *       excludes soft-deleted. Joins users for author display.
 *   - create({ organizationId, body, isPinned }) — insert + audit row.
 *   - update({ id, body?, isPinned? }) — author-only, within 1h, else
 *       FORBIDDEN. Updates updated_at + audit row.
 *   - delete({ id }) — soft delete. Author within 1h OR super_admin
 *       always. Audit row.
 */

import { z } from "zod";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { adminProcedure } from "@/lib/admin-procedure";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { tenantNotes } from "@avantej-core/db/schema/control-panel/tenant-notes";

const EDIT_WINDOW_MS = 60 * 60 * 1000;

function cpDbFrom(context: unknown): NeonDatabase<typeof controlPanelSchema> {
	const db = (
		context as { honoContext?: { get: (k: string) => unknown } }
	).honoContext?.get("controlPanelDb") as
		| NeonDatabase<typeof controlPanelSchema>
		| undefined;
	if (!db)
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel DB unavailable",
		});
	return db;
}

function adminUserIdFrom(context: unknown): string {
	const session = (context as { session?: { user?: { id?: string } } }).session;
	const id = session?.user?.id;
	if (!id)
		throw new ORPCError("UNAUTHORIZED", {
			message: "No admin user in session",
		});
	return id;
}

function adminRoleFrom(
	context: unknown,
): "super_admin" | "support" | "billing" {
	const role = (context as { adminRole?: string }).adminRole;
	if (!role)
		throw new ORPCError("FORBIDDEN", { message: "No admin role in context" });
	return role as "super_admin" | "support" | "billing";
}

async function assertOrgExists(
	cpDb: NeonDatabase<typeof controlPanelSchema>,
	organizationId: string,
) {
	const [org] = await cpDb
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.id, organizationId));
	if (!org) throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
}

export const platformAdminTenantsNotesRouter = {
	list: adminProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			await assertOrgExists(cpDb, input.organizationId);

			const rows = await cpDb
				.select({
					id: tenantNotes.id,
					organizationId: tenantNotes.organizationId,
					authorUserId: tenantNotes.authorUserId,
					body: tenantNotes.body,
					isPinned: tenantNotes.isPinned,
					createdAt: tenantNotes.createdAt,
					updatedAt: tenantNotes.updatedAt,
					authorEmail: users.email,
					authorName: users.name,
				})
				.from(tenantNotes)
				.leftJoin(users, eq(users.id, tenantNotes.authorUserId))
				.where(
					and(
						eq(tenantNotes.organizationId, input.organizationId),
						isNull(tenantNotes.deletedAt),
					),
				)
				.orderBy(desc(tenantNotes.isPinned), desc(tenantNotes.createdAt))
				.limit(100);

			return { notes: rows };
		}),

	create: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				body: z.string().min(1).max(5000),
				isPinned: z.boolean().default(false),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);
			await assertOrgExists(cpDb, input.organizationId);

			const [inserted] = await cpDb
				.insert(tenantNotes)
				.values({
					organizationId: input.organizationId,
					authorUserId: adminUserId,
					body: input.body,
					isPinned: input.isPinned,
				})
				.returning({ id: tenantNotes.id });

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_note_create",
				targetOrganizationId: input.organizationId,
				metadata: {
					noteId: inserted?.id,
					isPinned: input.isPinned,
					bodyPreview: input.body.slice(0, 200),
				},
			});

			return { ok: true as const, noteId: inserted?.id ?? null };
		}),

	update: adminProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				body: z.string().min(1).max(5000).optional(),
				isPinned: z.boolean().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);

			const [existing] = await cpDb
				.select({
					id: tenantNotes.id,
					organizationId: tenantNotes.organizationId,
					authorUserId: tenantNotes.authorUserId,
					createdAt: tenantNotes.createdAt,
					deletedAt: tenantNotes.deletedAt,
				})
				.from(tenantNotes)
				.where(eq(tenantNotes.id, input.id));

			if (!existing || existing.deletedAt) {
				throw new ORPCError("NOT_FOUND", { message: "Note not found" });
			}
			if (existing.authorUserId !== adminUserId) {
				throw new ORPCError("FORBIDDEN", {
					message: "Only the author can edit this note",
				});
			}
			const ageMs = Date.now() - (existing.createdAt?.getTime() ?? 0);
			if (ageMs > EDIT_WINDOW_MS) {
				throw new ORPCError("FORBIDDEN", {
					message: "Edit window has elapsed (1 hour) — note is frozen",
				});
			}
			if (input.body === undefined && input.isPinned === undefined) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Provide body or isPinned to update",
				});
			}

			const patch: Record<string, unknown> = { updatedAt: sql`now()` };
			if (input.body !== undefined) patch.body = input.body;
			if (input.isPinned !== undefined) patch.isPinned = input.isPinned;

			await cpDb
				.update(tenantNotes)
				.set(patch)
				.where(eq(tenantNotes.id, input.id));

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_note_update",
				targetOrganizationId: existing.organizationId,
				metadata: {
					noteId: input.id,
					fields: {
						body: input.body !== undefined,
						isPinned: input.isPinned,
					},
					bodyPreview: input.body?.slice(0, 200),
				},
			});

			return { ok: true as const };
		}),

	delete: adminProcedure
		.input(z.object({ id: z.string().uuid() }))
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);
			const role = adminRoleFrom(context);

			const [existing] = await cpDb
				.select({
					id: tenantNotes.id,
					organizationId: tenantNotes.organizationId,
					authorUserId: tenantNotes.authorUserId,
					createdAt: tenantNotes.createdAt,
					deletedAt: tenantNotes.deletedAt,
				})
				.from(tenantNotes)
				.where(eq(tenantNotes.id, input.id));

			if (!existing || existing.deletedAt) {
				throw new ORPCError("NOT_FOUND", { message: "Note not found" });
			}

			const isAuthor = existing.authorUserId === adminUserId;
			const ageMs = Date.now() - (existing.createdAt?.getTime() ?? 0);
			const authorMayEdit = isAuthor && ageMs <= EDIT_WINDOW_MS;
			const superAdmin = role === "super_admin";

			if (!authorMayEdit && !superAdmin) {
				throw new ORPCError("FORBIDDEN", {
					message: isAuthor
						? "Edit window has elapsed — only super_admin can delete frozen notes"
						: "Only the author (within 1h) or a super_admin can delete this note",
				});
			}

			await cpDb
				.update(tenantNotes)
				.set({ deletedAt: sql`now()` })
				.where(eq(tenantNotes.id, input.id));

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_note_delete",
				targetOrganizationId: existing.organizationId,
				metadata: {
					noteId: input.id,
					actorRole: role,
					authoredByActor: isAuthor,
				},
			});

			return { ok: true as const };
		}),
};
