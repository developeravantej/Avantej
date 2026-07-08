/**
 * Email Domain Router — verification + test-send procedures.
 */

import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "@avantej-core/api";
import {
	getEmailDomainById,
	updateEmailDomainStatus,
} from "@avantej-core/services/email-domain.service";
import { getResendDomain, verifyResendDomain } from "@/lib/resend-domains";
import { sendTenantEmail } from "@/lib/email-send-tenant";
import { getControlPanelDb, mapResendStatus, requireOrgAdmin } from "./_shared";

export const domainVerifyProcedures = {
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

			if (!row.resendDomainId) return row;
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
};
