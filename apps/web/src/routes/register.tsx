import { authClient } from "@/lib/auth-client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";
import { RegistrationForm } from "@/components/pages/onboarding/registration-form";

// Member self-registration (web port of the native GHL onboarding form).
// Authenticated but intentionally outside the _authenticated dashboard shell —
// users on this page have no org membership yet, so the sidebar/topbar (which
// need userContext) can't render for them. `token` is the branch self-signup
// invite token forwarded from the QR / onboarding link.
export const Route = createFileRoute("/register")({
	validateSearch: z.object({ token: z.string().catch("") }),
	beforeLoad: async ({ search }) => {
		// Preserve the invite token across the login bounce — after signing in,
		// LoginForm sends the user back to /register?token=….
		const loginSearch = search.token ? { registrationToken: search.token } : {};
		try {
			const session = await authClient.getSession();
			if (!session.data) {
				throw redirect({ to: "/login", search: loginSearch });
			}
		} catch (err) {
			if (err && typeof err === "object" && "to" in err) throw err;
			throw redirect({ to: "/login", search: loginSearch });
		}
	},
	component: RegisterPage,
});

function RegisterPage() {
	const { token } = Route.useSearch();

	// The missing-token notice lives inside RegistrationForm — it must stay
	// hidden in profile-completion mode (GHL-approved members need no token).
	return (
		<div className="min-h-screen bg-gray-50">
			<RegistrationForm inviteToken={token} />
		</div>
	);
}
