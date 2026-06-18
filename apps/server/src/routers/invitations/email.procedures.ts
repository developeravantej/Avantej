import { z } from "zod";
import { renderInvitationEmail } from "@/lib/email";
import { sendTenantEmail } from "@/lib/email-send-tenant";
import { getControlPanelDb } from "@avantej-core/api/lib/context-helpers";
import { o, authMiddleware, getEnvVar } from "./_shared";

/**
 * Send invitation email procedure
 *
 * Sends invitation email via the tenant email path (sendTenantEmail), which
 * routes through the org's verified sending domain when configured and falls
 * back to the platform sender otherwise. Called after creating or resending an
 * invitation. Protected — only authenticated users can send emails.
 */
export const sendEmail = o
	.use(authMiddleware)
	.input(
		z.object({
			invitation: z.object({
				token: z.string(),
				email: z.string().email(),
				role: z.string(),
			}),
			organizationId: z.string().uuid(),
			organizationName: z.string().optional(),
			inviterName: z.string().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		const { invitation, organizationId, organizationName, inviterName } = input;

		// Construct invitation link
		const frontendURL =
			getEnvVar("CORS_ORIGIN") ||
			getEnvVar("FRONTEND_URL") ||
			"http://localhost:3001";
		const invitationLink = `${frontendURL}/accept-invitation?token=${invitation.token}&orgId=${organizationId}`;

		const orgName = organizationName || "the organization";
		const { subject, html, text } = renderInvitationEmail(
			invitationLink,
			orgName,
			inviterName,
			invitation.role,
		);

		const cpDb = getControlPanelDb(context);
		await sendTenantEmail(cpDb, {
			organizationId,
			to: invitation.email,
			subject,
			html,
			text,
			notificationType: "member_invitation",
			subjectVars: {
				organizationName: orgName,
				role: invitation.role,
				inviterName: inviterName ?? "",
			},
			allowPlatformFallback: true,
		});

		return {
			success: true,
			message: "Invitation email sent successfully",
		};
	});

export const emailProcedures = {
	sendEmail,
};
