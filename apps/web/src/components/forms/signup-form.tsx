import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const formSchema = z
	.object({
		firstName: z.string().min(2, "First name must be at least 2 characters"),
		lastName: z.string().min(2, "Last name must be at least 2 characters"),
		email: z.string().email("Invalid email address"),
		password: z
			.string()
			.min(8, "Password must be at least 8 characters")
			.regex(/[A-Z]/, "Must contain at least one uppercase letter")
			.regex(/[0-9]/, "Must contain at least one number"),
		confirmPassword: z.string().min(8, "Please confirm your password"),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords do not match",
		path: ["confirmPassword"],
	});

type SignupValues = z.infer<typeof formSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

export function SignupForm({
	className,
	invitationEmail,
	invitationToken,
	orgId,
	onSignupSuccess,
	...props
}: React.ComponentProps<"div"> & {
	invitationEmail?: string;
	invitationToken?: string;
	orgId?: string;
	onSignupSuccess?: () => void;
}) {
	const navigate = useNavigate();
	const { isPending, refetch } = authClient.useSession();

	// Read search params without 'from' - will work on any route but may be undefined
	// Props take precedence, so this is just a fallback for when used on /signup route
	const searchParams = useSearch({ strict: false });
	const searchInvitationToken = searchParams.invitationToken as string | undefined;
	const searchOrgId = searchParams.orgId as string | undefined;

	// Use props first, then search params
	const finalInvitationToken = invitationToken || searchInvitationToken;
	const finalOrgId = orgId || searchOrgId;

	const form = useForm({
		defaultValues: {
			firstName: "",
			lastName: "",
			email: invitationEmail || "",
			password: "",
			confirmPassword: "",
		} as SignupValues,
		validators: {
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			if (
				invitationEmail &&
				value.email.toLowerCase() !== invitationEmail.toLowerCase()
			) {
				toast.error(
					`This invitation was sent to ${invitationEmail}. Please use that email address.`,
				);
				return;
			}

			try {
				await authClient.signUp.email(
					{
						email: value.email,
						password: value.password,
						name: `${value.firstName} ${value.lastName}`,
						firstName: value.firstName,
						lastName: value.lastName,
					} as any,
					{
						onSuccess: async () => {
							toast.success("Account created successfully!");
							await refetch();
							await new Promise((resolve) => setTimeout(resolve, 300));

							if (onSignupSuccess) {
								await onSignupSuccess();
							} else if (finalInvitationToken && finalOrgId) {
								navigate({
									to: "/accept-invitation",
									search: { token: finalInvitationToken, orgId: finalOrgId },
								});
							} else {
								navigate({ to: "/dashboard" });
							}
						},
						onError: (error) => {
							const errorMessage =
								error.error.message || error.error.statusText || "";
							const isUserExists =
								errorMessage.toLowerCase().includes("already exists") ||
								errorMessage.toLowerCase().includes("user already") ||
								errorMessage.toLowerCase().includes("email already") ||
								errorMessage.toLowerCase().includes("duplicate") ||
								errorMessage.toLowerCase().includes("already registered");

							if (isUserExists) {
								toast.info(
									"Account already exists. Please log in to accept the invitation.",
								);
								if (finalInvitationToken && finalOrgId) {
									navigate({
										to: "/login",
										search: {
											invitationToken: finalInvitationToken,
											orgId: finalOrgId,
										},
									});
								} else {
									navigate({ to: "/login", search: {} });
								}
							} else {
								toast.error(errorMessage || "Signup failed");
							}
						},
					},
				);
			} catch (error: unknown) {
				console.error("Signup error:", error);
				const errorMessage =
					error instanceof Error ? error.message : "Signup failed";

				const isUserExists =
					errorMessage.toLowerCase().includes("already exists") ||
					errorMessage.toLowerCase().includes("user already") ||
					errorMessage.toLowerCase().includes("email already") ||
					errorMessage.toLowerCase().includes("duplicate");

				if (isUserExists && finalInvitationToken && finalOrgId) {
					toast.info(
						"Account already exists. Please log in to accept the invitation.",
					);
					navigate({
						to: "/login",
						search: {
							invitationToken: finalInvitationToken,
							orgId: finalOrgId,
						},
					});
				} else if (isUserExists) {
					toast.info("Account already exists. Please log in.");
					navigate({ to: "/login", search: {} });
				} else {
					toast.error(errorMessage);
				}
			}
		},
	});

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<div className="flex flex-col gap-6">
					<form.Field name="firstName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>First Name</Label>
								<Input
									id={field.name}
									placeholder="John"
									required
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="lastName">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Last Name</Label>
								<Input
									id={field.name}
									placeholder="Doe"
									required
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email Address</Label>
								<Input
									id={field.name}
									type="email"
									placeholder="example@gmail.com"
									required
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending || !!invitationEmail}
									readOnly={!!invitationEmail}
									className={invitationEmail ? "bg-muted" : ""}
								/>
								{invitationEmail && (
									<p className="text-xs text-muted-foreground mt-1">
										This email is required for this invitation
									</p>
								)}
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									type="password"
									required
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="confirmPassword">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Confirm Password</Label>
								<Input
									id={field.name}
									type="password"
									required
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Subscribe>
						{(state) => (
							<Button
								type="submit"
								className="w-full"
								disabled={isPending || state.isSubmitting}
							>
								{state.isSubmitting
									? "Creating Account..."
									: invitationEmail
										? "Sign Up & Accept Invitation"
										: "Sign Up"}
							</Button>
						)}
					</form.Subscribe>
				</div>
				{!invitationEmail && (
					<div className="mt-4 text-center text-sm">
						Already have an account?{" "}
						<Link to="/login" search={{}} className="underline underline-offset-4">
							Login
						</Link>
					</div>
				)}
			</form>
		</div>
	);
}
