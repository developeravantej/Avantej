import { createFileRoute } from "@tanstack/react-router";
import { SignupForm } from "@/components/forms/signup-form";

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="mx-auto max-w-3xl py-32">
			<SignupForm />
		</div>
	);
}

