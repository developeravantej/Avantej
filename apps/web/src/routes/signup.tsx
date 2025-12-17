import { createFileRoute } from "@tanstack/react-router";
import { SignupForm } from "@/components/forms/signup-form";

export const Route = createFileRoute("/signup")({
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
		<div className="mx-auto max-w-3xl py-32">
			<SignupForm />
		</div>
	);
}

