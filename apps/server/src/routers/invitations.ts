/**
 * Invitation Router Extensions (Server-specific)
 *
 * Server-specific invitation procedures that require email sending capability.
 * These procedures are added to the base invitationRouter from packages/api.
 */

import { os, ORPCError } from "@orpc/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getBetterAuth } from "@/lib/better-auth";
import { sendInvitationEmail } from "@/lib/email";
import { fireCustomerSync } from "@/services/ghl/customer-sync-trigger";
import { dispatchStaffSync } from "@/services/ghl/dispatch-staff-sync";
import { user as userTable } from "@avantej-core/db/schema/auth";
import { customerProfiles } from "@avantej-core/db/schema/tenant/customer-profiles";
import { members } from "@avantej-core/db/schema/tenant/members";
import { MembershipService } from "@avantej-core/db/services/membership.service";
import {
	getInvitationByToken,
	validateInvitation,
} from "@avantej-core/services";
import { validateAcceptanceInput } from "./invitation-acceptance";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
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

/**
 * accept (server override)
 *
 * Replaces baseRouter.invitations.accept. Same logic as the shared base, but
 * after member creation, if role='client', creates a stub customer_profiles
 * row and fires syncCustomerToGhl so a GHL contact is provisioned at the
 * moment the customer accepts the invite — not on first profile edit.
 *
 * Sync runs best-effort (failure mode B): network/GHL errors are recorded
 * in ghl_contact_links.last_error and don't surface to the caller.
 */
export const accept = o
	.input(
		z.object({
			token: z.string(),
			organizationId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available",
			});
		}
		if (!context.session?.user) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Please sign up or log in to accept this invitation",
			});
		}
		if (!context.honoContext) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Hono context unavailable",
			});
		}

		const invitation = await getInvitationByToken(
			input.token,
			context.tenantDb,
		);
		const validation = validateInvitation(invitation);
		if (!validation.isValid) {
			throw new ORPCError("BAD_REQUEST", {
				message: validation.error || "Invalid invitation",
			});
		}

		const userEmail = context.session.user.email?.toLowerCase();
		const invitationEmail = invitation!.email.toLowerCase();
		if (userEmail !== invitationEmail) {
			throw new ORPCError("FORBIDDEN", {
				message: `This invitation was sent to ${invitation!.email}. Please sign up or log in with that email address.`,
			});
		}

		const existingMember = await context.tenantDb.query.members.findFirst({
			where: eq(members.userId, context.session.user.id),
		});
		if (existingMember) {
			throw new ORPCError("CONFLICT", {
				message: "You are already a member of this organization",
			});
		}

		const controlPanelDb = context.honoContext.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;
		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available in context",
			});
		}

		await controlPanelDb
			.update(userTable)
			.set({ emailVerified: true })
			.where(eq(userTable.id, context.session.user.id));

		const membershipService = new MembershipService(controlPanelDb);
		await membershipService.createMember({
			userId: context.session.user.id,
			organizationId: input.organizationId,
			role: invitation!.role,
			hierarchyScopeId: invitation!.hierarchyScopeId,
			invitationId: invitation!.id,
			tenantDb: context.tenantDb,
		});

		// Fire GHL sync immediately for client invites — provisions the
		// contact in GHL without waiting for the customer's first profile edit.
		if (invitation!.role === "client") {
			try {
				const userId = context.session.user.id;
				// Stub customer_profiles row (idempotent — onConflict skips if exists)
				await context.tenantDb
					.insert(customerProfiles)
					.values({ userId })
					.onConflictDoNothing({ target: customerProfiles.userId });

				const profile = await context.tenantDb.query.customerProfiles.findFirst({
					where: eq(customerProfiles.userId, userId),
				});
				if (profile) {
					await fireCustomerSync({
						honoContext: context.honoContext,
						tenantDb: context.tenantDb,
						organizationId: input.organizationId,
						userId,
						customerProfile: profile,
						operation: "update",
					});
				}
			} catch (err) {
				// Failure mode B: never surface to caller. fireCustomerSync
				// already swallows GHL failures; this catch covers DB-side
				// surprises during the stub-profile insert.
				console.error("[invitations.accept] post-accept GHL sync failed", err);
			}
		}

		return {
			success: true,
			message: "Successfully joined organization",
			organizationId: input.organizationId,
		};
	});

/**
 * acceptWithSignup (public procedure)
 *
 * Atomic: signUp + emailVerified flip + signIn + accept + GHL sync.
 *
 * Why: Better-Auth's `requireEmailVerification:true` blocks session creation
 * after signUp, so the invitation page's `signUp -> refetchSession -> accept`
 * dance fails with "Session not available after signup". The invitation token
 * is itself proof of email ownership (sent to that exact address), so we can
 * mark `emailVerified=true` server-side and create the session in one shot.
 *
 * Public procedure — token + email match are the auth proof. No session
 * required on entry; session cookie returned via Hono response merge.
 */
export const acceptWithSignup = o
	.input(
		z.object({
			token: z.string().min(1),
			organizationId: z.string().uuid(),
			email: z.string().email(),
			password: z.string().min(8),
			firstName: z.string().min(1),
			lastName: z.string().min(1),
		}),
	)
	.handler(async ({ input, context }) => {
		if (!context.tenantDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Tenant database not available",
			});
		}
		const cph = context.honoContext;
		if (!cph) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Hono context not available",
			});
		}
		const controlPanelDb = cph.get("controlPanelDb") as
			| NeonDatabase<typeof controlPanelSchema>
			| undefined;
		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Control panel database not available",
			});
		}

		// 1. Validate invitation
		const invitation = await getInvitationByToken(input.token, context.tenantDb);
		const validation = validateAcceptanceInput(invitation, input.email);
		if (!validation.ok) {
			const map: Record<typeof validation.error, string> = {
				"invalid-token": "Invitation token is invalid or expired",
				"email-mismatch": `This invitation was sent to a different email address`,
				expired: "This invitation has expired",
				"already-accepted": "This invitation has already been accepted",
				declined: "This invitation has been declined",
			};
			throw new ORPCError("BAD_REQUEST", {
				message: map[validation.error],
			});
		}

		// 2. Sign up via Better-Auth (creates user + account)
		const auth = getBetterAuth(cph);
		const fullName = `${input.firstName} ${input.lastName}`.trim();
		try {
			await auth.api.signUpEmail({
				body: {
					email: input.email,
					password: input.password,
					name: fullName,
				},
			});
		} catch (err) {
			throw new ORPCError("BAD_REQUEST", {
				message: err instanceof Error ? err.message : "Sign-up failed",
			});
		}

		// 3. Mark email verified + persist firstName/lastName
		await controlPanelDb
			.update(userTable)
			.set({
				emailVerified: true,
				firstName: input.firstName,
				lastName: input.lastName,
			})
			.where(eq(userTable.email, input.email));

		// Look up the new user id
		const newUser = await controlPanelDb.query.user.findFirst({
			where: eq(userTable.email, input.email),
		});
		if (!newUser) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "User not found after sign-up",
			});
		}

		// 4. Sign in to get session cookies
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let signInResult: any;
		try {
			signInResult = await auth.api.signInEmail({
				body: { email: input.email, password: input.password },
				headers: new Headers(cph.req.raw.headers),
				returnHeaders: true,
			});
		} catch (err) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message:
					err instanceof Error ? err.message : "Sign-in failed after sign-up",
			});
		}

		// Extract Set-Cookie + stash on context — index.ts merges via the same
		// channel impersonation uses.
		let setCookies: string[] = [];
		if (signInResult?.headers) {
			if (typeof signInResult.headers.getSetCookie === "function") {
				setCookies = signInResult.headers.getSetCookie();
			} else {
				for (const [key, value] of signInResult.headers.entries()) {
					if (key.toLowerCase() === "set-cookie") setCookies.push(value);
				}
			}
		}
		if (setCookies.length > 0) {
			cph.set("__impersonationSetCookie__", setCookies);
		}

		// 5. Create member (dual-write CP + tenant)
		const membershipService = new MembershipService(controlPanelDb);
		await membershipService.createMember({
			userId: newUser.id,
			organizationId: input.organizationId,
			role: invitation!.role,
			hierarchyScopeId: invitation!.hierarchyScopeId,
			invitationId: invitation!.id,
			tenantDb: context.tenantDb,
		});

		// 6. GHL staff sync (best-effort). Dispatcher applies skip rules
		// internally — customer/client roles return `skipped`. Errors are
		// caught so they never break invite acceptance.
		const ghlAgencyId = getEnvVar("GHL_AGENCY_ID") ?? "";
		let ghlSync:
			| {
					status: "synced" | "skipped" | "error";
					reason?: string;
					ghlUserId?: string;
					error?: string;
			  }
			| undefined;
		if (ghlAgencyId) {
			const newMember = await context.tenantDb.query.members.findFirst({
				where: eq(members.userId, newUser.id),
			});
			if (newMember) {
				ghlSync = await dispatchStaffSync({
					controlPanelDb,
					tenantDb: context.tenantDb,
					organizationId: input.organizationId,
					memberId: newMember.id,
					operation: "create",
					env: { GHL_AGENCY_ID: ghlAgencyId },
				}).catch((err) => ({
					status: "error" as const,
					error: err instanceof Error ? err.message : String(err),
				}));
			}
		}

		// 7. Client invitations: stub customer_profile + fire GHL sync
		if (invitation!.role === "client") {
			try {
				await context.tenantDb
					.insert(customerProfiles)
					.values({ userId: newUser.id })
					.onConflictDoNothing({ target: customerProfiles.userId });
				const profile = await context.tenantDb.query.customerProfiles.findFirst({
					where: eq(customerProfiles.userId, newUser.id),
				});
				if (profile) {
					await fireCustomerSync({
						honoContext: cph,
						tenantDb: context.tenantDb,
						organizationId: input.organizationId,
						userId: newUser.id,
						customerProfile: profile,
						operation: "update",
					});
				}
			} catch (err) {
				console.error(
					"[invitations.acceptWithSignup] post-accept GHL sync failed",
					err,
				);
			}
		}

		return {
			success: true,
			message: "Successfully joined organization",
			organizationId: input.organizationId,
			userId: newUser.id,
			ghlSync,
		};
	});

export const serverInvitationRouter = {
  sendEmail,
  accept,
  acceptWithSignup,
};
