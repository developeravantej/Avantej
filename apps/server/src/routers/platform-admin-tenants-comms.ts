/**
 * Platform Admin — Tenant Communications (Plan E E.5).
 *
 * Triple-delivery DM to a tenant owner (email + in-app notification +
 * audit row) and broadcast announcement creation. Mirrors the C.2
 * dispute notification pattern.
 *
 * Procs:
 *   - sendTenantDirectMessage({ organizationId, subject, message }) —
 *       Resend email to owner.email + insert into tenant `notifications`
 *       + audit row. Each side effect independently try/caught so a
 *       single channel failure doesn't drop the audit trail.
 *   - createTenantAnnouncement({ organizationId, title, message,
 *       priority, targetAudience }) — insert into tenant `announcements`
 *       + audit row.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { protectedProcedure } from "@avantej-core/api";
import { platformAdmins } from "@avantej-core/db/schema/control-panel/platform-admins";
import { organizations } from "@avantej-core/db/schema/control-panel/organizations";
import { users } from "@avantej-core/db/schema/control-panel/users";
import { adminSessionActions } from "@avantej-core/db/schema/control-panel/admin-session-actions";
import { notifications } from "@avantej-core/db/schema/tenant/notifications";
import { announcements } from "@avantej-core/db/schema/tenant/announcements";
import { sendEmail } from "@/lib/email";
import { getTenantDb } from "@/lib/db";

function requirePlatformAdmin(
	allowRoles?: ReadonlyArray<"super_admin" | "support" | "billing">,
) {
	return (protectedProcedure as any).middleware(
		async ({ context, next }: { context: any; next: any }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = context.honoContext?.get("controlPanelDb") as
				| NeonDatabase<typeof controlPanelSchema>
				| undefined;
			if (!cpDb) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Control panel database not available in context",
				});
			}
			const adminRecord = await cpDb.query.platformAdmins.findFirst({
				where: eq(platformAdmins.userId, context.session.user.id),
			});
			if (!adminRecord) {
				throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
			}
			if (
				allowRoles &&
				!allowRoles.includes(
					adminRecord.role as "super_admin" | "support" | "billing",
				)
			) {
				throw new ORPCError("FORBIDDEN", {
					message: "Your platform admin role does not permit this action",
				});
			}
			return next({
				context: { ...context, adminRecord, adminRole: adminRecord.role },
			});
		},
	);
}

const adminProcedure = protectedProcedure.use(requirePlatformAdmin());

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

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function renderDmHtml(subject: string, message: string, orgName: string) {
	return `
		<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px;">
			<p>Hello,</p>
			<p>An Avantej platform admin sent the following message regarding <strong>${escapeHtml(orgName)}</strong>:</p>
			<div style="border-left: 3px solid #ccc; padding: 0.5em 1em; margin: 1em 0; background: #f8f8f8;">
				<p style="margin: 0 0 0.5em; font-weight: 600;">${escapeHtml(subject)}</p>
				<p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
			</div>
			<p style="color: #666; font-size: 0.9em;">If you have questions, reply to this email or sign in to your Avantej dashboard.</p>
		</div>
	`;
}

export const platformAdminTenantsCommsRouter = {
	sendTenantDirectMessage: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				subject: z.string().trim().min(3).max(200),
				message: z.string().trim().min(3).max(5000),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);

			const [org] = await cpDb
				.select({
					id: organizations.id,
					name: organizations.name,
					ownerUserId: organizations.ownerUserId,
				})
				.from(organizations)
				.where(eq(organizations.id, input.organizationId));

			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}
			if (!org.ownerUserId) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Tenant has no owner linked — cannot DM",
				});
			}

			const [owner] = await cpDb
				.select({ id: users.id, email: users.email, name: users.name })
				.from(users)
				.where(eq(users.id, org.ownerUserId));

			if (!owner?.email) {
				throw new ORPCError("BAD_REQUEST", {
					message: "Owner has no email — cannot DM",
				});
			}

			const deliveries = { email: false, inApp: false };
			const errors: string[] = [];

			try {
				await sendEmail({
					to: owner.email,
					subject: `[Avantej] ${input.subject}`,
					html: renderDmHtml(input.subject, input.message, org.name),
				});
				deliveries.email = true;
			} catch (e) {
				errors.push(`email: ${e instanceof Error ? e.message : String(e)}`);
				console.error("[platform-admin-comms] email send failed:", e);
			}

			try {
				const tenantDb = await getTenantDb(org.id);
				await tenantDb.insert(notifications).values({
					userId: owner.id,
					type: "system",
					title: input.subject,
					message: input.message,
				});
				deliveries.inApp = true;
			} catch (e) {
				errors.push(`in-app: ${e instanceof Error ? e.message : String(e)}`);
				console.error("[platform-admin-comms] in-app notif failed:", e);
			}

			try {
				await cpDb.insert(adminSessionActions).values({
					adminUserId,
					actionType: "tenant_dm",
					targetOrganizationId: org.id,
					targetUserId: owner.id,
					metadata: {
						subject: input.subject,
						messagePreview: input.message.slice(0, 200),
						deliveries,
					},
				});
			} catch (e) {
				errors.push(`audit: ${e instanceof Error ? e.message : String(e)}`);
				console.error("[platform-admin-comms] audit write failed:", e);
			}

			return { ok: true, deliveries, errors };
		}),

	createTenantAnnouncement: adminProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				title: z.string().trim().min(3).max(200),
				message: z.string().trim().min(3).max(5000),
				priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
				targetAudience: z.enum(["all", "staff", "clients"]).default("all"),
			}),
		)
		.handler(async ({ context, input }) => {
			const cpDb = cpDbFrom(context);
			const adminUserId = adminUserIdFrom(context);

			const [org] = await cpDb
				.select({ id: organizations.id })
				.from(organizations)
				.where(eq(organizations.id, input.organizationId));

			if (!org) {
				throw new ORPCError("NOT_FOUND", { message: "Tenant not found" });
			}

			const tenantDb = await getTenantDb(org.id);
			const [inserted] = await tenantDb
				.insert(announcements)
				.values({
					title: input.title,
					message: input.message,
					priority: input.priority,
					targetAudience: input.targetAudience,
					createdBy: adminUserId,
				})
				.returning({ id: announcements.id });

			await cpDb.insert(adminSessionActions).values({
				adminUserId,
				actionType: "tenant_announcement_create",
				targetOrganizationId: org.id,
				metadata: {
					announcementId: inserted?.id,
					title: input.title,
					priority: input.priority,
					targetAudience: input.targetAudience,
				},
			});

			return { ok: true, announcementId: inserted?.id ?? null };
		}),
};
