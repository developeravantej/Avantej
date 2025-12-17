import LoginForm from "@/components/forms/login-form";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => {
		return {
			invitationToken: (search.invitationToken as string) || undefined,
			orgId: (search.orgId as string) || undefined,
		};
	},
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
