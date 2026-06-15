import { organizationMembers } from "@avantej-core/db/schema/control-panel/organization-members";
import { Pool } from "@neondatabase/serverless";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import { z } from "zod";
import { o } from "./_shared";

// Type for Better-Auth sign-in response
interface BetterAuthSignInResponse {
	user: {
		id: string;
		email: string;
		name: string;
		firstName: string;
		lastName: string;
		emailVerified: boolean;
		createdAt: Date;
	};
	session: {
		token: string;
	};
}

// Type guard for Better-Auth response
function isBetterAuthSignInResponse(
	data: unknown,
): data is BetterAuthSignInResponse {
	if (!data || typeof data !== "object") return false;
	const obj = data as Record<string, unknown>;
	return (
		typeof obj.user === "object" &&
		obj.user !== null &&
		typeof (obj.user as Record<string, unknown>).id === "string" &&
		typeof (obj.user as Record<string, unknown>).email === "string"
	);
}

/**
 * Login procedure - Sign in with email and password
 * Returns user info and organizations list
 */
export const login = o
	.input(
		z.object({
			email: z.string().email(),
			password: z.string().min(8),
		}),
	)
	.handler(async ({ input, context }) => {
		const { email, password } = input;
		const c = context.honoContext;

		if (!c) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Missing Hono context",
			});
		}

		// Get Better-Auth instance
		const getBetterAuthFn = c.get("getBetterAuth");
		const auth = getBetterAuthFn ? getBetterAuthFn() : null;

		if (!auth) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Auth service unavailable",
			});
		}

		// Create a request to Better-Auth's sign-in endpoint
		const signInRequest = new Request(
			`${c.req.url.split("/rpc")[0]}/api/auth/sign-in/email`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...Object.fromEntries(c.req.raw.headers.entries()),
				},
				body: JSON.stringify({ email, password }),
			},
		);

		// Call Better-Auth handler to get the response with cookies
		const authResponse = await auth.handler(signInRequest);

		if (!authResponse.ok) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid credentials",
			});
		}

		// Parse the response to get user and session
		const authData = (await authResponse.json()) as unknown;

		if (!isBetterAuthSignInResponse(authData)) {
			throw new ORPCError("UNAUTHORIZED", {
				message: "Invalid credentials",
			});
		}

		const { user, session } = authData;

		// Copy cookies from Better-Auth response to our response
		const setCookieHeader = authResponse.headers.get("Set-Cookie");
		if (setCookieHeader) {
			c.header("Set-Cookie", setCookieHeader);
		}

		// Check if email is verified
		if (!user.emailVerified) {
			throw new ORPCError("FORBIDDEN", {
				message: "Email not verified",
			});
		}

		// Get user's organizations from control panel database (set by dbMiddleware)
		const controlPanelDb = c.get("controlPanelDb") as
			| (NeonDatabase<
					typeof import("@avantej-core/db/schema/control-panel-schema")
			  > & { $client: Pool })
			| undefined;

		if (!controlPanelDb) {
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Database unavailable",
			});
		}

		const userOrganizations =
			await controlPanelDb.query.organizationMembers.findMany({
				where: eq(organizationMembers.userId, user.id),
				with: {
					organization: true,
				},
			});

		// Build organizations summary
		const organizationsSummary: Array<{
			id: string;
			name: string;
			slug: string;
			role: string;
		}> = [];

		for (const om of userOrganizations) {
			if (om.status !== "active") continue;
			const org = om.organization as {
				id: string;
				name: string;
				slug: string;
				paymentStatus: string;
			} | null;
			if (!org || org.paymentStatus !== "active") continue;
			organizationsSummary.push({
				id: org.id,
				name: org.name,
				slug: org.slug,
				role: om.role,
			});
		}

		return {
			accessToken: session?.token || "",
			refreshToken: "", // Better-Auth handles refresh tokens in HTTP-only cookies
			user: {
				id: user.id,
				email: user.email,
				name: user.name,
				firstName: user.firstName,
				lastName: user.lastName,
				emailVerified: user.emailVerified,
				createdAt: user.createdAt,
			},
			organizations: organizationsSummary,
		};
	});
