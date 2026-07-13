/**
 * Email Domain Router — domain CRUD procedures (create/update/delete/list/get).
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import {
	checkEmailDomainCreateAllowed,
	createEmailDomain,
	deleteEmailDomain,
	getEmailDomainById,
	listEmailDomainsForOrg,
	updateEmailDomainSettings,
	updateEmailDomainStatus,
} from "@avantej-core/services/email-domain.service";
import {
	createResendDomain,
	getResendDomain,
	removeResendDomain,
} from "@/lib/resend-domains";
import {
	auditEmailDomainChange,
	getControlPanelDb,
	getPgErrorCode,
	LOCAL_PART_REGEX,
	mapResendStatus,
	RESEND_REGIONS,
	requireOrgAdmin,
} from "./_shared";

export const domainCrudProcedures = {
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

			// Rate-limit BEFORE the (paid) Resend call so abuse never costs money.
			const limit = await checkEmailDomainCreateAllowed(
				cpDb,
				input.organizationId,
			);
			if (!limit.allowed) {
				throw new ORPCError(limit.code, { message: limit.reason });
			}

			const resendDomain = await createResendDomain({
				name: input.domain,
				region: input.region,
			});

			let row: Awaited<ReturnType<typeof createEmailDomain>>;
			try {
				row = await createEmailDomain(cpDb, {
					organizationId: input.organizationId,
					resendDomainId: resendDomain.id,
					domain: input.domain,
					fromName: input.fromName,
					defaultLocalPart: input.defaultLocalPart ?? null,
					dnsRecords: resendDomain.records,
				});
			} catch (e) {
				// Drizzle wraps the pg error; the unique-violation code (23505)
				// lives on `.cause`, not the top-level message. Match the code via
				// the cause-walking helper rather than string-matching, which misses
				// the wrapped case and leaks a raw 500. Mirrors aliases.procedures.ts.
				if (getPgErrorCode(e) === "23505") {
					throw new ORPCError("CONFLICT", {
						message: "This domain is already registered",
					});
				}
				throw e;
			}

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

			const row = await getEmailDomainById(cpDb, {
				id: input.id,
				organizationId: input.organizationId,
			});
			if (!row) {
				throw new ORPCError("NOT_FOUND", { message: "Email domain not found" });
			}

			// Remove at Resend first (so a Resend failure is retryable without
			// losing the resendDomainId), then delete the row.
			if (row.resendDomainId) {
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

			if (!row.resendDomainId) return row;
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
