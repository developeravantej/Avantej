import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useForm } from "react-hook-form";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
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

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			firstName: "",
			lastName: "",
			email: invitationEmail || "", // Pre-fill email from invitation
			password: "",
			confirmPassword: "",
		},
	});

	async function onSubmit(values: z.infer<typeof formSchema>) {
		try {
			// Validate email matches invitation if provided
			if (invitationEmail && values.email.toLowerCase() !== invitationEmail.toLowerCase()) {
				toast.error(`This invitation was sent to ${invitationEmail}. Please use that email address.`);
				form.setError("email", {
					type: "manual",
					message: `This invitation was sent to ${invitationEmail}`,
				});
				return;
			}

			await authClient.signUp.email(
				{
					email: values.email,
					password: values.password,
					name: `${values.firstName} ${values.lastName}`,
					firstName: values.firstName,
					lastName: values.lastName,
				},
				{
					onSuccess: async () => {
						toast.success("Account created successfully!");
						
						// Refresh session to ensure user is logged in
						await refetch();
						
						// Small delay to ensure session is propagated
						await new Promise(resolve => setTimeout(resolve, 300));
						
						// Call onSignupSuccess callback if provided (for auto-accept)
						if (onSignupSuccess) {
							await onSignupSuccess();
						} else if (finalInvitationToken && finalOrgId) {
							// Otherwise redirect to accept invitation page
							navigate({
								to: "/accept-invitation",
								search: { token: finalInvitationToken, orgId: finalOrgId },
							});
						} else {
							navigate({ to: "/dashboard" });
						}
					},
					onError: (error) => {
						// Check if user already exists
						const errorMessage = error.error.message || error.error.statusText || "";
						const isUserExists = 
							errorMessage.toLowerCase().includes("already exists") ||
							errorMessage.toLowerCase().includes("user already") ||
							errorMessage.toLowerCase().includes("email already") ||
							errorMessage.toLowerCase().includes("duplicate") ||
							errorMessage.toLowerCase().includes("already registered");
						
						if (isUserExists) {
							// User already exists - redirect to login with invitation params
							toast.info("Account already exists. Please log in to accept the invitation.");
							if (finalInvitationToken && finalOrgId) {
								navigate({
									to: "/login",
									search: { invitationToken: finalInvitationToken, orgId: finalOrgId },
								});
							} else {
								navigate({ to: "/login", search: {} });
							}
						} else {
							toast.error(errorMessage || "Signup failed");
						}
					},
				}
			);
		} catch (error: unknown) {
			console.error("Signup error:", error);
			const errorMessage = error instanceof Error ? error.message : "Signup failed";
			
			// Check if user already exists
			const isUserExists = 
				errorMessage.toLowerCase().includes("already exists") ||
				errorMessage.toLowerCase().includes("user already") ||
				errorMessage.toLowerCase().includes("email already") ||
				errorMessage.toLowerCase().includes("duplicate");
			
			if (isUserExists && finalInvitationToken && finalOrgId) {
				toast.info("Account already exists. Please log in to accept the invitation.");
				navigate({
					to: "/login",
					search: { invitationToken: finalInvitationToken, orgId: finalOrgId },
				});
			} else if (isUserExists) {
				toast.info("Account already exists. Please log in.");
				navigate({ to: "/login", search: {} });
			} else {
				toast.error(errorMessage);
			}
		}
	}

	return (
		<div
			className={cn("flex flex-col gap-6", className)}
			{...props}
		>
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)}>
					<div className="flex flex-col gap-6">
						<FormField
							control={form.control}
							name="firstName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>First Name</FormLabel>
									<FormControl>
										<Input
											id="firstName"
											placeholder="John"
											required
											{...field}
											disabled={isPending}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="lastName"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Last Name</FormLabel>
									<FormControl>
										<Input
											id="lastName"
											placeholder="Doe"
											required
											{...field}
											disabled={isPending}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email Address</FormLabel>
									<FormControl>
										<Input
											id="email"
											type="email"
											placeholder="example@gmail.com"
											required
											{...field}
											disabled={isPending || !!invitationEmail} // Disable if pre-filled from invitation
											readOnly={!!invitationEmail} // Make read-only if pre-filled
											className={invitationEmail ? "bg-muted" : ""}
										/>
									</FormControl>
									{invitationEmail && (
										<p className="text-xs text-muted-foreground mt-1">
											This email is required for this invitation
										</p>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
								<FormField
									control={form.control}
									name="password"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Password</FormLabel>
											<FormControl>
												<Input
													id="password"
													type="password"
													required
													{...field}
													disabled={isPending}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="confirmPassword"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Confirm Password</FormLabel>
											<FormControl>
												<Input
													id="confirmPassword"
													type="password"
													required
													{...field}
													disabled={isPending}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
						<div className="flex flex-col gap-3">
							<Button
								type="submit"
								className="w-full"
								disabled={isPending || form.formState.isSubmitting}
							>
								{form.formState.isSubmitting 
									? "Creating Account..." 
									: invitationEmail 
										? "Sign Up & Accept Invitation" 
										: "Sign Up"}
							</Button>
						</div>
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
			</Form>
		</div>
	);
}

