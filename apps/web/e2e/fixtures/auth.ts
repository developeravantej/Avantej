/**
 * E2E Auth Helpers
 *
 * Better-Auth sign-up + sign-in via HTTP, bypassing the browser UI.
 * Used to create fresh test users directly in the control panel database.
 *
 * The sign-up endpoint is at POST /api/auth/sign-up/email (Better-Auth default).
 * The response body has shape: { user: { id: string; email: string; ... }, session: {...} }
 */

const AUTH_BASE_URL = "http://localhost:3000";

export interface SignedUpUser {
	email: string;
	password: string;
	userId: string;
}

/**
 * Create a fresh user account via Better-Auth.
 * Uses a Date.now() suffix so re-runs never collide.
 */
export async function signUpUser(
	suffix: string | number,
	role: "admin" | "client" = "client",
): Promise<SignedUpUser> {
	const email = `e2e-${role}-${suffix}@test.local`;
	const password = "TestPass123!";
	const name = `E2E ${role.charAt(0).toUpperCase() + role.slice(1)} ${suffix}`;

	const res = await fetch(`${AUTH_BASE_URL}/api/auth/sign-up/email`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// Better-Auth rejects requests without an Origin (CORS gate).
			Origin: "http://localhost:3001",
		},
		body: JSON.stringify({
			email,
			password,
			name,
			firstName: `E2E${role}`,
			lastName: String(suffix),
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`signUp failed for ${email}: ${res.status} ${body}`);
	}

	const json = (await res.json()) as { user: { id: string } };
	return { email, password, userId: json.user.id };
}
