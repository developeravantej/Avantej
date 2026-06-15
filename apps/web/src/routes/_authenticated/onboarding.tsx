import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { LoadingSpinner, PageLoader } from "@/components/ui/loading-spinner";

const onboardingSearchSchema = z.object({
	user_id: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/onboarding")({
	validateSearch: onboardingSearchSchema,
	component: RouteComponent,
});

const formSchema = z.object({
	name: z
		.string()
		.min(1, "Organization name is required")
		.max(255, "Organization name is too long"),
});

type OnboardingValues = z.infer<typeof formSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-red-500 text-sm font-light">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

function RouteComponent() {
	const { isPending: authLoading } = authClient.useSession();
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm({
		defaultValues: { name: "" } as OnboardingValues,
		validators: { onSubmit: formSchema },
		onSubmit: async ({ value }) => {
			setIsSubmitting(true);
			sessionStorage.setItem("pendingOrgName", value.name);
			navigate({ to: "/subscribe" as string });
		},
	});

	if (authLoading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<PageLoader />
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-zinc-100 flex items-center justify-center p-4">
			<div className="w-full max-w-md">
				<Card>
					<CardHeader className="text-center">
						<CardTitle className="text-2xl font-bold">
							Welcome to Avantej!
						</CardTitle>
						<p className="text-zinc-600 mt-2">
							Let's set up your organization to get started.
						</p>
					</CardHeader>
					<CardContent>
						{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
							className="space-y-6"
						>
							<form.Field name="name">
								{(field) => (
									<div className="space-y-2">
										<Label htmlFor={field.name}>Organization Name</Label>
										<Input
											id={field.name}
											placeholder="Enter your organization name"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										<div className="text-sm text-zinc-500 font-light">
											Your organization name will be confirmed when you complete
											your subscription.
										</div>
										<FieldError errors={field.state.meta.errors} />
									</div>
								)}
							</form.Field>

							<form.Subscribe selector={(state) => state.canSubmit}>
								{(canSubmit) => (
									<Button
										type="submit"
										className="w-full"
										disabled={isSubmitting || !canSubmit}
									>
										{isSubmitting ? (
											<>
												<LoadingSpinner size="sm" className="mr-2" />
												Redirecting…
											</>
										) : (
											"Proceed to Subscription"
										)}
									</Button>
								)}
							</form.Subscribe>
						</form>

						<div className="mt-6 text-center text-sm text-zinc-500">
							<p>
								Next, you'll choose a subscription plan to activate your
								organization.
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
