import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { authClient } from "@/lib/auth-client";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

export default function SignInLinkForm({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	const [sentTo, setSentTo] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "" },
		onSubmit: async ({ value }) => {
			const result = await authClient.signIn.magicLink({
				email: value.email,
				callbackURL: "/dashboard",
			});

			if (result.error) {
				toast.error(result.error.message || "Failed to send sign-in link");
				return;
			}

			setSentTo(value.email);
		},
		validators: {
			onSubmit: z.object({
				email: z.string().email("Invalid email address"),
			}),
		},
	});

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card className="overflow-hidden p-0">
				<CardContent className="grid p-0 md:grid-cols-2">
					{sentTo ? (
						<div className="p-6 md:p-8 flex flex-col gap-4 items-center text-center justify-center">
							<h1 className="text-2xl font-semibold">Check your inbox</h1>
							<p className="text-muted-foreground text-balance">
								We sent a sign-in link to <strong>{sentTo}</strong>. The link is
								valid for 30 minutes and can only be used once.
							</p>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setSentTo(null);
									form.reset();
								}}
							>
								Use a different email
							</Button>
							<div className="text-sm text-muted-foreground">
								<Link to="/login" className="underline underline-offset-4">
									Back to login
								</Link>
							</div>
						</div>
					) : (
						/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA: prevent native form GET nav, defer to tanstack-form handleSubmit */
						<form
							onSubmit={(e) => {
								e.preventDefault();
								e.stopPropagation();
								form.handleSubmit();
							}}
							className="p-6 md:p-8"
						>
							<div className="flex flex-col gap-6">
								<div className="flex flex-col items-center text-center">
									<h1 className="text-2xl font-semibold">Sign in by email</h1>
									<p className="text-muted-foreground text-balance">
										We'll email you a one-click sign-in link.
									</p>
								</div>
								<div className="grid gap-2">
									<form.Field name="email">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>Email</Label>
												<Input
													id={field.name}
													type="email"
													placeholder="example@gmail.com"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												{field.state.meta.errors.map((error) => (
													<p
														key={String(error)}
														className="text-sm text-destructive"
													>
														{typeof error === "string"
															? error
															: error?.message || "Invalid email"}
													</p>
												))}
											</div>
										)}
									</form.Field>
								</div>
								<form.Subscribe>
									{(state) => (
										<Button
											type="submit"
											className="w-full"
											disabled={!state.canSubmit || state.isSubmitting}
										>
											{state.isSubmitting ? (
												<>
													<LoadingSpinner size="sm" className="mr-2" />
													Sending…
												</>
											) : (
												"Send sign-in link"
											)}
										</Button>
									)}
								</form.Subscribe>
								<div className="text-center text-sm">
									Prefer a password?{" "}
									<Link to="/login" className="underline underline-offset-4">
										Sign in with password
									</Link>
								</div>
							</div>
						</form>
					)}
					<div className="bg-muted relative hidden md:block">
						<img
							src="/login-page-image.jpg"
							alt="Sign in"
							className="absolute inset-0 h-full w-full object-cover"
						/>
					</div>
				</CardContent>
			</Card>
			<div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
				By continuing, you agree to our <a href="/terms">Terms of Service</a>{" "}
				and <a href="/privacy">Privacy Policy</a>.
			</div>
		</div>
	);
}
