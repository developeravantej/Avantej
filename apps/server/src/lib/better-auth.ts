/**
 * Better-Auth Configuration
 *
 * Configures Better-Auth with Organization and Admin plugins for multi-tenant support.
 * Uses Drizzle adapter with control panel database schema.
 *
 * Environment Variables:
 * - DATABASE_URL: Control panel database connection string
 * - BETTER_AUTH_SECRET: Secret key for session encryption
 * - BETTER_AUTH_URL: Base URL for Better-Auth (e.g., http://localhost:3000)
 * - CORS_ORIGIN: Allowed CORS origin
 *
 * Features:
 * - Email/password authentication
 * - Email verification required
 * - 15-minute session expiry (constitution requirement)
 * - Organization plugin for multi-tenant management
 * - Admin plugin for platform administration
 */

import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { controlPanelDb } from "@/lib/db";
import * as schema from "@avantej-core/db/schema/auth";
import { env } from "cloudflare:workers";

/**
 * Better-Auth instance with Organization and Admin plugins
 *
 * Configuration:
 * - Database: Uses control panel database via Drizzle adapter
 * - Email/Password: Enabled with email verification required
 * - Session: 15-minute expiry, updates every 5 minutes
 * - Organization Plugin: Enables multi-tenant organization management
 * - Admin Plugin: Enables platform administration features
 */
export const auth = betterAuth({
	database: drizzleAdapter(controlPanelDb, {
		provider: "pg",
		schema: schema,
	}),
	trustedOrigins: [env.CORS_ORIGIN, "mybettertapp://", "exp://"],
	emailAndPassword: {
		enabled: true,
		requireEmailVerification: true,
	},
	session: {
		expiresIn: 60 * 15, // 15 minutes (constitution requirement)
		updateAge: 60 * 5, // Update session every 5 minutes
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	advanced: {
		defaultCookieAttributes: {
			sameSite: "none",
			secure: true,
			httpOnly: true,
		},
		// uncomment cookieCache setting when ready to deploy to Cloudflare using *.workers.dev domains
		// cookieCache: {
		//   enabled: true,
		//   maxAge: 60,
		// },
		// uncomment crossSubDomainCookies setting when ready to deploy and replace <your-workers-subdomain> with your actual workers subdomain
		// https://developers.cloudflare.com/workers/wrangler/configuration/#workersdev
		// crossSubDomainCookies: {
		//   enabled: true,
		//   domain: "<your-workers-subdomain>",
		// },
	},
	plugins: [
		organization({
			// Only allow org creation if user has valid subscription
			// This will be enforced via payment-gated provisioning (T040)
			allowUserToCreateOrganization: async () => {
				// For now, allow organization creation
				// Will be replaced with subscription check in T040 integration
				return true;
			},
			// Send invitation email (to be implemented in T043)
			sendInvitationEmail: async ({ email, invitation }) => {
				// TODO: Implement email service (T043)
				// Construct invitation link using invitation ID
				const invitationLink = `${env.BETTER_AUTH_URL}/accept-invitation?id=${invitation.id}`;
				console.log(`Invitation email to ${email}: ${invitationLink}`);
				// await sendEmail({
				//   to: email,
				//   subject: "You've been invited to join an organization",
				//   body: `Click here to accept: ${invitationLink}`,
				// });
			},
		}),
		admin({
			// 1 hour max impersonation session duration
			impersonationSessionDuration: 60 * 60,
		}),
	],
});

