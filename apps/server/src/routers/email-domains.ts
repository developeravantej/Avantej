/**
 * Email Domain Router
 *
 * Tenant-self-service provisioning of Resend sending domains.
 *
 * Auth model: caller must be an authenticated user AND an `admin` member of
 * the target organization (via control-panel `organization_members`). All
 * Resend mutations are routed through ./lib/resend-domains; persistence is
 * handled by `@avantej-core/services/email-domain.service`.
 */

import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import {
	addAlias,
	checkEmailDomainCreateAllowed,
	createEmailDomain,
	deleteEmailDomain,
	getEmailDomainById,
	getVerifiedEmailDomainForOrg,
	listAliasesForDomain,
	listEmailDomainsForOrg,
	removeAlias,
	updateEmailDomainSettings,
	updateEmailDomainStatus,
} from "@avantej-core/services/email-domain.service";
import { writeAudit } from "@avantej-core/services/audit-log.service";
import {
	deleteNotificationRoute,
	listNotificationRoutes,
	upsertNotificationRoute,
} from "@avantej-core/services/notification-route.service";
import { NOTIFICATION_TYPES } from "@avantej-core/services/notification-routing";
import {
	createResendDomain,
	getResendDomain,
	removeResendDomain,
	verifyResendDomain,
} from "@/lib/resend-domains";
import { sendTenantEmail } from "@/lib/email-send-tenant";

const LOCAL_PART_REGEX = /^[a-z0-9._-]{1,64}$/i;

type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

function getControlPanelDb(context: {
	honoContext?: { get(key: string): unknown };
}): ControlPanelDb {
	const db = context.honoContext?.get("controlPanelDb") as ControlPanelDb | undefined;
	if (!db) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel database not available",
		});
	}
	return db;
}

async function requireOrgAdmin(
	controlPanelDb: ControlPanelDb,
	userId: string,
	organizationId: string,
): Promise<void> {
	const rows = await controlPanelDb
		.select({ role: organizationMembers.role, status: organizationMembers.status })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, userId),
				eq(organizationMembers.organizationId, organizationId),
			),
		)
		.limit(1);
	const m = rows[0];
	if (!m) {
		throw new ORPCError("FORBIDDEN", { message: "Not a member of this organization" });
	}
	if (m.status !== "active") {
		throw new ORPCError("FORBIDDEN", { message: "Membership is not active" });
	}
	if (m.role !== "admin") {
		throw new ORPCError("FORBIDDEN", { message: "Admin role required" });
	}
}

/**
 * Best-effort tenant audit-log write for a sending-domain change. Audit is
 * secondary to provisioning — a missing tenantDb/member (edge cases) or a
 * write failure must never fail the underlying create/delete, so this never
 * throws. Writes to the tenant `audit_logs` so the change shows up in the
 * org's Audit Log page alongside other admin actions.
 */
export async function auditEmailDomainChange(
	context: {
		tenantDb?: unknown;
		member?: { id: string; role?: string } | null;
		session?: { user: { id: string } } | null;
	},
	params: {
		action: "email_domain.registered" | "email_domain.deleted" | "email_route.changed";
		entityType?: "email_domain" | "email_notification_route";
		entityId: string;
		summary: string;
		changes: Record<string, unknown>;
	},
): Promise<void> {
	try {
		const tenantDb = context.tenantDb as Parameters<typeof writeAudit>[0] | undefined;
		const userId = context.session?.user?.id;
		if (!tenantDb || !context.member || !userId) {
			console.warn(
				`[email-domains] skipped audit '${params.action}' — missing tenantDb/member/session`,
			);
			return;
		}
		await writeAudit(tenantDb, {
			actorUserId: userId,
			actorMemberId: context.member.id,
			actorRole: context.member.role,
			action: params.action,
			entityType: params.entityType ?? "email_domain",
			entityId: params.entityId,
			summary: params.summary,
			changes: params.changes,
		});
	} catch (e) {
		console.error(`[email-domains] audit '${params.action}' failed:`, e);
	}
}

const RESEND_REGIONS = ["us-east-1", "eu-west-1", "sa-east-1", "ap-northeast-1"] as const;

function mapResendStatus(resendStatus: string): "pending" | "verifying" | "verified" | "failed" {
	switch (resendStatus) {
		case "verified":
			return "verified";
		case "failed":
		case "temporary_failure":
			return "failed";
		case "pending":
		case "not_started":
			return "pending";
		default:
			return "verifying";
	}
}

export const emailDomainsRouter = {
	/**
	 * Register a new sending domain for an org. Caller must be the org admin.
	 * Calls resend.domains.create and persists the DNS records snapshot.
	 */
	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				domain: z
					.string()
					.min(3)
					.max(253)
					.regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Invalid domain"),
				fromName: z.string().min(1).max(100),
				defaultLocalPart: z
					.string()
					.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -")
					.optional(),
				region: z.enum(RESEND_REGIONS).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			// Rate-limit BEFORE the (paid) Resend call so abuse never costs money.
			const limit = await checkEmailDomainCreateAllowed(cpDb, input.organizationId);
			if (!limit.allowed) {
				throw new ORPCError(limit.code, { message: limit.reason });
			}

			const resendDomain = await createResendDomain({
				name: input.domain,
				region: input.region,
			});

			const row = await createEmailDomain(cpDb, {
				organizationId: input.organizationId,
				resendDomainId: resendDomain.id,
				domain: input.domain,
				fromName: input.fromName,
				defaultLocalPart: input.defaultLocalPart ?? null,
				dnsRecords: resendDomain.records,
			});

			await auditEmailDomainChange(context, {
				action: "email_domain.registered",
				entityId: row.id,
				summary: `Registered sending domain "${input.domain}"`,
				changes: {
					domain: input.domain,
					fromName: input.fromName,
					defaultLocalPart: input.defaultLocalPart ?? null,
					region: input.region ?? null,
					resendDomainId: resendDomain.id,
				},
			});

			return row;
		}),

	/**
	 * Update tenant-facing sender settings (from-name, default local-part).
	 * Does not touch verification status (use `verify` for that).
	 */
	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				fromName: z.string().min(1).max(100).optional(),
				defaultLocalPart: z
					.string()
					.regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -")
					.nullable()
					.optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			const updated = await updateEmailDomainSettings(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
				fromName: input.fromName,
				defaultLocalPart: input.defaultLocalPart,
			});
			return updated ?? row;
		}),

	/**
	 * Delete a sending domain. Removes from Resend first (so we can retry on
	 * Resend failure without losing the resendDomainId), then deletes the row.
	 */
	delete: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			try {
				await removeResendDomain(row.resendDomainId);
			} catch (e) {
				console.error("Failed to remove domain at Resend", {
					resendDomainId: row.resendDomainId,
					error: e,
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to delete domain at Resend; please retry.",
				});
			}

			await deleteEmailDomain(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});

			await auditEmailDomainChange(context, {
				action: "email_domain.deleted",
				entityId: input.id,
				summary: `Deleted sending domain "${row.domain}"`,
				changes: {
					domain: row.domain,
					resendDomainId: row.resendDomainId,
				},
			});

			return { deleted: true as const, id: input.id };
		}),

	/**
	 * List all sending domains for an org.
	 */
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);
			return listEmailDomainsForOrg(cpDb, input.organizationId);
		}),

	/**
	 * Get a single domain row by id. Live-refreshes status from Resend.
	 */
	get: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				refresh: z.boolean().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			if (!input.refresh) {
				return row;
			}

			const live = await getResendDomain(row.resendDomainId);
			const mapped = mapResendStatus(live.status);
			const updated = await updateEmailDomainStatus(cpDb, {
				id: row.id,
				status: mapped,
				dnsRecords: live.records ?? row.dnsRecords,
			});
			return updated ?? row;
		}),

	/**
	 * Trigger Resend to re-check DNS records. Returns the refreshed row.
	 */
	verify: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			await verifyResendDomain(row.resendDomainId);

			const live = await getResendDomain(row.resendDomainId);
			const mapped = mapResendStatus(live.status);
			const updated = await updateEmailDomainStatus(cpDb, {
				id: row.id,
				status: mapped,
				dnsRecords: live.records ?? row.dnsRecords,
			});
			return updated ?? row;
		}),

	/**
	 * Send a small "Hello from <domain>" test email through the verified
	 * sending domain. Used by admins to confirm DNS + deliverability without
	 * waiting for a real flow to fire. Refuses if the domain isn't verified
	 * (no platform fallback — point of the proc is to exercise the tenant
	 * domain itself).
	 */
	sendTest: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				organizationId: z.string().uuid(),
				to: z.string().email().optional(),
				aliasLabel: z.string().min(1).max(100).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}
			if (row.status !== "verified") {
				throw new ORPCError("BAD_REQUEST", {
					message: "Domain must be verified before sending a test email",
				});
			}

			const recipient = input.to ?? context.session.user.email;
			if (!recipient) {
				throw new ORPCError("BAD_REQUEST", {
					message: "No recipient — pass `to` or sign in with a verified email",
				});
			}

			const subject = `Test email from ${row.domain}`;
			const html = `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<h2 style="color: #2c3e50;">It works! ✉️</h2>
<p>This is a test email sent from <strong>${row.domain}</strong> via the
Avantej Core multi-tenant Resend integration.</p>
<p>If you received this at your inbox, your DNS records (SPF / DKIM / DMARC)
are correctly configured and Resend can deliver from this domain.</p>
<hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
<p style="color: #7f8c8d; font-size: 12px;">Sent at ${new Date().toISOString()}</p>
</body></html>`;

			try {
				const result = await sendTenantEmail(cpDb, {
					organizationId: input.organizationId,
					to: recipient,
					subject,
					html,
					aliasLabel: input.aliasLabel,
					allowPlatformFallback: false,
				});
				return {
					sent: true as const,
					to: recipient,
					fromAddress: result.fromAddress,
					messageId: result.messageId,
				};
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: `Test send failed: ${msg}`,
				});
			}
		}),

	/**
	 * List aliases for a domain.
	 */
	listAliases: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}
			return listAliasesForDomain(cpDb, input.emailDomainId);
		}),

	/**
	 * Add a new alias on a domain.
	 */
	addAlias: protectedProcedure
		.input(
			z.object({
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
				localPart: z.string().regex(LOCAL_PART_REGEX, "Letters, numbers, . _ -"),
				label: z.string().min(1).max(100).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			try {
				return await addAlias(cpDb, {
					emailDomainId: input.emailDomainId,
					localPart: input.localPart.toLowerCase(),
					label: input.label,
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				if (msg.includes("duplicate key") || msg.includes("unique")) {
					throw new ORPCError("CONFLICT", {
						message: "Alias already exists for this local-part",
					});
				}
				throw e;
			}
		}),

	/**
	 * Remove an alias.
	 */
	removeAlias: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				emailDomainId: z.string().uuid(),
				organizationId: z.string().uuid(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const domain = await getEmailDomainById(cpDb, {
				id: input.emailDomainId,
				organizationId: input.organizationId,
			});
			if (!domain) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			const removed = await removeAlias(cpDb, {
				id: input.id,
				emailDomainId: input.emailDomainId,
			});
			if (!removed) {
				throw new ORPCError("NOT_FOUND", { message: "Alias not found" });
			}
			return { deleted: true as const, id: input.id };
		}),

	/**
	 * One-shot config for the Notification routing panel: the org's existing
	 * routes (with joined alias info), the verified-domain alias options for the
	 * dropdowns, and the verified-domain meta for the live "Will send as" preview.
	 */
	getNotificationRouting: protectedProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const routes = await listNotificationRoutes(cpDb, input.organizationId);
			const verified = await getVerifiedEmailDomainForOrg(cpDb, input.organizationId);
			const aliases = verified ? await listAliasesForDomain(cpDb, verified.id) : [];
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
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			if (input.aliasId) {
				const verified = await getVerifiedEmailDomainForOrg(cpDb, input.organizationId);
				// No verified domain → no alias can belong to this org. Fail fast
				// (and avoid a needless alias query) rather than relying on the
				// empty-list .some() below.
				if (!verified) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Organization has no verified sending domain; cannot bind an alias",
					});
				}
				const aliases = await listAliasesForDomain(cpDb, verified.id);
				if (!aliases.some((a) => a.id === input.aliasId)) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Alias does not belong to this organization's verified domain",
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
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

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

			return { deleted: true as const, notificationType: input.notificationType };
		}),
};
