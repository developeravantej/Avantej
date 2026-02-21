import { createFileRoute } from "@tanstack/react-router";
import { SignupForm } from "@/components/forms/signup-form";

type SignupSearch = {
	invitationToken?: string;
	orgId?: string;
};

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>): SignupSearch => {
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
		<div className="mx-auto max-w-3xl py-32">
			<SignupForm />
		</div>
	);
}
