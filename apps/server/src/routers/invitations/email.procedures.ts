import { z } from "zod";
import { sendInvitationEmail } from "@/lib/email";
import { o, authMiddleware, getEnvVar } from "./_shared";

/**
 * Send invitation email procedure
 *
 * Sends invitation email via Resend. Called after creating or resending an invitation.
 * This endpoint is protected - only authenticated users can send emails.
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
	.handler(async ({ input }) => {
		const { invitation, organizationId, organizationName, inviterName } = input;

		// Construct invitation link
		const frontendURL =
			getEnvVar("CORS_ORIGIN") ||
			getEnvVar("FRONTEND_URL") ||
			"http://localhost:3001";
		const invitationLink = `${frontendURL}/accept-invitation?token=${invitation.token}&orgId=${organizationId}`;

		// Send email via Resend
		await sendInvitationEmail(
			invitation.email,
			invitationLink,
			organizationName || "the organization",
			inviterName,
			invitation.role,
		);

		return {
			success: true,
			message: "Invitation email sent successfully",
		};
	});

export const emailProcedures = {
	sendEmail,
};
