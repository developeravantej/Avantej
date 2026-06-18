import { Hono } from "hono";
import { getBetterAuth } from "@/lib/better-auth";
import { getTenantDb } from "@/lib/db";
import {
	getGoogleAuthUrl,
	exchangeCodeForTokens,
	getGoogleUserInfo,
} from "@avantej-core/services";
import { googleCalendarConnections } from "@avantej-core/db/schema/tenant/google-calendar-connections";
import { members } from "@avantej-core/db/schema/tenant/members";
import {
	decryptOAuthState,
	encryptOAuthState,
	encryptToken,
} from "@avantej-core/db/lib/oauth-security";
import { eq } from "drizzle-orm";

type GoogleOAuthState = {
	organizationId: string;
	userId: string;
	returnUrl: string;
};

const app = new Hono();

// GET /auth/google-calendar/initiate
// Starts the OAuth flow — redirects user to Google consent screen
app.get("/initiate", async (c) => {
	const auth = getBetterAuth(c);
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session?.user) {
		return c.redirect("/login");
	}

	const organizationId = c.req.query("organizationId");
	const returnUrl =
		c.req.query("returnUrl") ?? "/dashboard/settings/google-calendar";

	if (!organizationId) {
		return c.text("Missing organizationId", 400);
	}

	const state = encryptOAuthState<GoogleOAuthState>({
		organizationId,
		userId: session.user.id,
		returnUrl,
	});

	const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
	const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? "";
	const url = getGoogleAuthUrl({ clientId, redirectUri, state });

	return c.redirect(url);
});

// GET /auth/google-calendar/callback
// Google redirects here after user consent
app.get("/callback", async (c) => {
	const code = c.req.query("code");
	const stateParam = c.req.query("state");
	const error = c.req.query("error");
	const webOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3001";

	if (error || !code || !stateParam) {
		return c.redirect(
			`${webOrigin}/dashboard/settings/google-calendar?gcal=error&message=auth_denied`,
		);
	}

	let state: GoogleOAuthState;
	try {
		state = decryptOAuthState<GoogleOAuthState>(stateParam);
	} catch (err) {
		const reason = err instanceof Error ? err.message : "invalid_state";
		return c.redirect(
			`${webOrigin}/dashboard/settings/google-calendar?gcal=error&message=${reason}`,
		);
	}

	try {
		const tokens = await exchangeCodeForTokens({
			code,
			clientId: process.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
			redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "",
		});

		const userInfo = await getGoogleUserInfo(tokens.access_token);

		const tenantDb = await getTenantDb(state.organizationId, c);

		const member = await tenantDb.query.members.findFirst({
			where: eq(members.userId, state.userId),
		});

		if (!member) {
			throw new Error("Member not found for user");
		}

		const syncScope = member.role === "admin" ? "all" : "own";
		const refreshToken = tokens.refresh_token ?? "";
		const encryptedAccess = encryptToken(tokens.access_token);
		const encryptedRefresh = refreshToken ? encryptToken(refreshToken) : "";

		await tenantDb
			.insert(googleCalendarConnections)
			.values({
				memberId: member.id,
				accessToken: encryptedAccess,
				refreshToken: encryptedRefresh,
				tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
				googleEmail: userInfo.email,
				syncScope,
				encryptionKeyId: "v1",
				tokenRotatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: googleCalendarConnections.memberId,
				set: {
					accessToken: encryptedAccess,
					refreshToken:
						encryptedRefresh || googleCalendarConnections.refreshToken,
					tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
					googleEmail: userInfo.email,
					syncScope,
					encryptionKeyId: "v1",
					tokenRotatedAt: new Date(),
					isActive: true,
					lastSyncError: null,
					updatedAt: new Date(),
				},
			});

		return c.redirect(`${webOrigin}${state.returnUrl}?gcal=connected`);
	} catch (err) {
		console.error("Google Calendar OAuth callback error:", err);
		return c.redirect(
			`${webOrigin}${state.returnUrl}?gcal=error&message=token_exchange_failed`,
		);
	}
});

export default app;
