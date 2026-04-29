/**
 * Invitation Routes
 *
 * Server-side wrapper routes for invitation email sending.
 * These routes wrap the oRPC invitation API and handle email sending via Resend.
 *
 * Routes:
 * - POST /api/invitations/send-email - Send invitation email
 */

import { Hono } from "hono";
import { authMiddleware } from "@/middleware/auth.middleware";
import { sendInvitationEmail } from "@/lib/email";

export const invitationRoutes = new Hono();

/**
 * POST /api/invitations/send-email
 * Send invitation email via Resend
 *
 * This endpoint is called by the frontend after creating an invitation via oRPC.
 * It constructs the invitation link and sends the email.
 * 
 * Note: Requires authentication but not tenant middleware since organizationId
 * is passed in the request body.
 */
invitationRoutes.post(
	"/send-email",
	authMiddleware,
	async (c) => {
		try {
			const body = await c.req.json();
			const {
				invitation,
				organizationId,
				organizationName,
				inviterName,
			} = body;

			// Validate input
			if (!invitation || !invitation.token || !invitation.email) {
				return c.json(
					{ error: "Invalid invitation data" },
					400
				);
			}

			if (!organizationId) {
				return c.json(
					{ error: "Organization ID is required" },
					400
				);
			}

			// Construct invitation link - use frontend URL (CORS_ORIGIN) since the route is in the frontend
			const frontendURL =
				process.env.CORS_ORIGIN || process.env.FRONTEND_URL || "http://localhost:3001";
			const invitationLink = `${frontendURL}/accept-invitation?token=${invitation.token}&orgId=${organizationId}`;

			// Send email via Resend
			await sendInvitationEmail(
				invitation.email,
				invitationLink,
				organizationName || "the organization",
				inviterName,
				invitation.role
			);

			return c.json({
				success: true,
				message: "Invitation email sent successfully",
			});
		} catch (error) {
			console.error("Failed to send invitation email:", error);
			return c.json(
				{
					error:
						error instanceof Error
							? error.message
							: "Failed to send invitation email",
				},
				500
			);
		}
	}
);

