import LoginForm from "@/components/forms/login-form";
import { createFileRoute } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute("/(auth)/login")({
	// registrationToken: branch self-signup invite token forwarded from the QR
	// onboarding page; after login the user is sent to /register to complete
	// member registration with it.
	validateSearch: z.object({
		invitationToken: z.string().optional(),
		orgId: z.string().optional(),
		registrationToken: z.string().optional(),
	}),
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
			<div className="w-full max-w-sm md:max-w-3xl">
				<LoginForm />
			</div>
		</div>
	);
}
