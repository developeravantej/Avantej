/**
 * Email Domain Router — shared helpers.
 *
 * Auth model: caller must be an authenticated user AND an `admin` member of
 * the target organization (via control-panel `organization_members`). These
 * helpers back every procedure in the split router.
 */

import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { writeAudit } from "@avantej-core/services/audit-log.service";

export const LOCAL_PART_REGEX = /^[a-z0-9._-]{1,64}$/i;

/**
 * Extract a PostgreSQL error `code` (e.g. "23505" unique-violation) from a
 * possibly Drizzle-wrapped error by walking the `.cause` chain. Re-exported from
 * the shared `@avantej-core/services` helper so the email-domain router and the
 * generic `handleDbError` mapper stay in lock-step (single source of truth for
 * the cause-walk). Existing importers keep `import { getPgErrorCode } from "./_shared"`.
 */
export { getPgErrorCode } from "@avantej-core/services/lib/pg-error";

export type ControlPanelDb = NeonDatabase<typeof controlPanelSchema>;

export function getControlPanelDb(context: {
	honoContext?: { get(key: string): unknown };
}): ControlPanelDb {
	const db = context.honoContext?.get("controlPanelDb") as
		| ControlPanelDb
		| undefined;
	if (!db) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Control panel database not available",
		});
	}
	return db;
}

export async function requireOrgAdmin(
	controlPanelDb: ControlPanelDb,
	userId: string,
	organizationId: string,
): Promise<void> {
	const rows = await controlPanelDb
		.select({
			role: organizationMembers.role,
			status: organizationMembers.status,
		})
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
		throw new ORPCError("FORBIDDEN", {
			message: "Not a member of this organization",
		});
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
		action:
			| "email_domain.registered"
			| "email_domain.deleted"
			| "email_route.changed";
		entityType?: "email_domain" | "email_notification_route";
		entityId: string;
		summary: string;
		changes: Record<string, unknown>;
	},
): Promise<void> {
	try {
		const tenantDb = context.tenantDb as
			| Parameters<typeof writeAudit>[0]
			| undefined;
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

export const RESEND_REGIONS = [
	"us-east-1",
	"eu-west-1",
	"sa-east-1",
	"ap-northeast-1",
] as const;

export function mapResendStatus(
	resendStatus: string,
): "pending" | "verifying" | "verified" | "failed" {
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
