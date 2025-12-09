import { createFileRoute } from "@tanstack/react-router";
import SignupForm from "@/components/forms/signup-form";

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
			<div className="w-full max-w-md">
				<SignupForm />
			</div>
		</div>
	);
}

