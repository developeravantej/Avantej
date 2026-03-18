/**
 * Invitation Router Extensions (Server-specific)
 *
 * Server-specific invitation procedures that require email sending capability.
 * These procedures are added to the base invitationRouter from packages/api.
 */

import { os, ORPCError } from "@orpc/server";
import { z } from "zod";
import { sendInvitationEmail } from "@/lib/email";
import type { Context } from "@avantej-core/api/context";

// Helper function to get environment variable (Cloudflare Workers or Node.js)
function getEnvVar(key: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cloudflare = require("cloudflare:workers");
    return cloudflare.env?.[key];
  } catch {
    return process.env[key];
  }
}

// Create procedure base with Context type
const o = os.$context<Context>();

// Protected procedure middleware that checks for authentication
const authMiddleware = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

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
    })
  )
  .handler(async ({ input }) => {
    const { invitation, organizationId, organizationName, inviterName } = input;

    // Construct invitation link
    const frontendURL =
      getEnvVar("CORS_ORIGIN") || getEnvVar("FRONTEND_URL") || "http://localhost:3001";
    const invitationLink = `${frontendURL}/accept-invitation?token=${invitation.token}&orgId=${organizationId}`;

    // Send email via Resend
    await sendInvitationEmail(
      invitation.email,
      invitationLink,
      organizationName || "the organization",
      inviterName,
      invitation.role
    );

    return {
      success: true,
      message: "Invitation email sent successfully",
    };
  });

export const serverInvitationRouter = {
  sendEmail,
};
