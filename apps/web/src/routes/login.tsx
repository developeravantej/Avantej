import LoginForm from "@/components/forms/login-form";
import { createFileRoute } from "@tanstack/react-router";

type LoginSearch = {
	invitationToken?: string;
	orgId?: string;
};

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): LoginSearch => {
		return {
			invitationToken:
				typeof search.invitationToken === "string"
					? search.invitationToken
					: undefined,
			orgId: typeof search.orgId === "string" ? search.orgId : undefined,
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
