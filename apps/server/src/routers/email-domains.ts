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
	createEmailDomain,
	getEmailDomainById,
	listEmailDomainsForOrg,
	updateEmailDomainStatus,
} from "@avantej-core/services/email-domain.service";
import {
	createResendDomain,
	getResendDomain,
	verifyResendDomain,
} from "@/lib/resend-domains";

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
				region: z.enum(RESEND_REGIONS).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			if (!context.session?.user) {
				throw new ORPCError("UNAUTHORIZED", { message: "Authentication required" });
			}
			const cpDb = getControlPanelDb(context);
			await requireOrgAdmin(cpDb, context.session.user.id, input.organizationId);

			const resendDomain = await createResendDomain({
				name: input.domain,
				region: input.region,
			});

			const row = await createEmailDomain(cpDb, {
				organizationId: input.organizationId,
				resendDomainId: resendDomain.id,
				domain: input.domain,
				fromName: input.fromName,
				dnsRecords: resendDomain.records,
			});

			return row;
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
};
