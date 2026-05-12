import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, CheckCircle, XCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/accept-invitation")({
	component: AcceptInvitationPage,
	validateSearch: (search: Record<string, unknown>) => {
		return {
			token: (search.token as string) || "",
			orgId: (search.orgId as string) || "",
		};
	},
});

function AcceptInvitationPage() {
	const { token, orgId } = useSearch({ from: "/accept-invitation" });
	const navigate = useNavigate();
	const { data: session, isPending: isSessionLoading, refetch: refetchSession } = authClient.useSession();

	// Fetch invitation details
	const {
		data: invitationData,
		isLoading: isLoadingInvitation,
		error: invitationError,
	} = useQuery({
		queryKey: ["invitation", token, orgId],
		queryFn: async () => {
			if (!token || !orgId) {
				throw new Error("Token and organization ID are required");
			}
			return await client.invitations.getByToken({
				token,
				organizationId: orgId,
			});
		},
		enabled: !!token && !!orgId,
		retry: false,
	});

	const invitation = invitationData?.invitation;
	const isValid = invitationData?.isValid;

	// Pre-verify invited email (enables existing-but-unverified users to log in)
	const verifyEmailMutation = useMutation({
		mutationFn: async () => {
			if (!token || !orgId) {
				throw new Error("Token and organization ID are required");
			}
			return await client.invitations.verifyEmailByToken({
				token,
				organizationId: orgId,
			});
		},
		retry: false,
	});

	// Accept invitation mutation
	const acceptMutation = useApiMutation({
		mutationFn: async (_: void) => {
			if (!token || !orgId) {
				throw new Error("Token and organization ID are required");
			}
			return await client.invitations.accept({
				token,
				organizationId: orgId,
			});
		},
		successMessage: "Successfully joined organization!",
		errorMessage: (error) => {
			if (error.message.includes("UNAUTHORIZED")) {
				return "Please sign up or log in to accept this invitation";
			}
			if (error.message.includes("different email address") || error.message.includes("sent to")) {
				return error.message || "This invitation was sent to a different email address";
			}
			return `Failed to accept invitation: ${error.message}`;
		},
		onSuccess: () => {
			// Ensure the app routes into the invited tenant context immediately
			try {
				if (orgId) {
					localStorage.setItem("current_organization_id", orgId);
				}
			} catch {
				// ignore storage errors
			}
			// Redirect to dashboard after a short delay
			setTimeout(() => {
				navigate({ to: `/dashboard` });
			}, 2000);
		},
	});

	const hasProcessedRef = useRef(false);

	// Auto-accept if user is logged in and invitation is valid (for existing users logging in)
	useEffect(() => {
		if (hasProcessedRef.current) return;

		if (
			!isSessionLoading &&
			session?.user &&
			isValid &&
			!acceptMutation.isPending &&
			!acceptMutation.isSuccess
		) {
			// Verify email matches invitation before auto-accepting
			const userEmail = session.user.email?.toLowerCase();
			const invitationEmail = invitation?.email?.toLowerCase();

			if (userEmail === invitationEmail) {
				hasProcessedRef.current = true;
				acceptMutation.mutate();
			} else if (userEmail && invitationEmail) {
				// Email mismatch — show a user-facing warning instead of silently ignoring
				toast.warning(
					`This invitation was sent to ${invitation?.email}. You're signed in as ${session.user.email}. Please sign out and use the correct email.`,
					{ duration: 10000 }
				);
			}
		}
	}, [
		session,
		isSessionLoading,
		isValid,
		invitation,
		acceptMutation.isPending,
		acceptMutation.isSuccess,
	]);

	// When we have a valid invitation, try to pre-verify the invited email (safe no-op for new users)
	useEffect(() => {
		if (
			isValid &&
			!!invitation?.email &&
			!verifyEmailMutation.isPending &&
			!verifyEmailMutation.isSuccess &&
			!verifyEmailMutation.isError
		) {
			verifyEmailMutation.mutate();
		}
	}, [
		isValid,
		invitation?.email,
		verifyEmailMutation.isPending,
		verifyEmailMutation.isSuccess,
		verifyEmailMutation.isError,
	]);

	// Atomic signup + accept + GHL sync. Single round-trip — avoids the
	// `requireEmailVerification:true` chicken-and-egg where Better-Auth
	// signUp doesn't return a session.
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [phone, setPhone] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const acceptWithSignupMutation = useApiMutation({
		mutationFn: async (_: void) => {
			if (!token || !orgId || !invitation) {
				throw new Error("Missing invitation context");
			}
			const trimmedPhone = phone.trim();
			return await client.invitations.acceptWithSignup({
				token,
				organizationId: orgId,
				email: invitation.email,
				password,
				firstName: firstName.trim(),
				lastName: lastName.trim(),
				phone: trimmedPhone.length > 0 ? trimmedPhone : undefined,
			});
		},
		successMessage: "Welcome! Your account is set up.",
		errorMessage: (error) => error.message || "Failed to accept invitation",
		onSuccess: () => {
			try {
				if (orgId) localStorage.setItem("current_organization_id", orgId);
			} catch {
				// ignore storage errors
			}
			// Hard reload installs the session cookie set by the server.
			setTimeout(() => {
				window.location.href = "/dashboard";
			}, 800);
		},
	});

	const handleSubmitSignup = (e: React.FormEvent) => {
		e.preventDefault();
		if (!firstName.trim() || !lastName.trim()) {
			toast.error("First name and last name are required");
			return;
		}
		if (password.length < 8) {
			toast.error("Password must be at least 8 characters");
			return;
		}
		if (password !== confirmPassword) {
			toast.error("Passwords do not match");
			return;
		}
		acceptWithSignupMutation.mutate();
	};

	// Show signup form directly if not authenticated and invitation is valid
	if (!isSessionLoading && !session?.user && isValid && invitation) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
				<div className="w-full max-w-md space-y-4">
					<Card>
						<CardHeader className="text-center space-y-2">
							<div className="flex justify-center">
								<div className="rounded-full bg-primary/10 p-3">
									<UserPlus className="size-6 text-primary" />
								</div>
							</div>
							<CardTitle className="text-2xl">You've Been Invited!</CardTitle>
							<CardDescription className="text-base">
								Sign up to join and accept your invitation as a{" "}
								<span className="font-semibold text-primary">{invitation.role}</span>
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{/* Invitation details */}
							<div className="rounded-lg bg-muted/50 p-4 space-y-2">
								<div className="flex items-center gap-2 text-sm">
									<Mail className="size-4 text-muted-foreground" />
									<span className="text-muted-foreground">Invited email:</span>
									<span className="font-medium">{invitation.email}</span>
								</div>
								<div className="flex items-center gap-2 text-sm">
									<span className="text-muted-foreground">Role:</span>
									<span className="font-medium capitalize">{invitation.role}</span>
								</div>
							</div>

							{/* Atomic signup-and-accept form */}
							<div className="pt-2">
								<p className="text-sm text-muted-foreground mb-4 text-center">
									Create your account to accept this invitation and join the organization
								</p>
								<form onSubmit={handleSubmitSignup} className="space-y-3">
									<div>
										<Label htmlFor="firstName">First Name</Label>
										<Input
											id="firstName"
											value={firstName}
											onChange={(e) => setFirstName(e.target.value)}
											required
										/>
									</div>
									<div>
										<Label htmlFor="lastName">Last Name</Label>
										<Input
											id="lastName"
											value={lastName}
											onChange={(e) => setLastName(e.target.value)}
											required
										/>
									</div>
									<div>
										<Label htmlFor="email">Email Address</Label>
										<Input
											id="email"
											value={invitation.email}
											readOnly
											className="bg-muted"
										/>
										<p className="text-xs text-muted-foreground mt-1">
											This email is required for this invitation
										</p>
									</div>
									<div>
										<Label htmlFor="phone">
											Phone <span className="text-muted-foreground">(optional)</span>
										</Label>
										<Input
											id="phone"
											type="tel"
											value={phone}
											onChange={(e) => setPhone(e.target.value)}
											placeholder="+60123456789"
											autoComplete="tel"
										/>
									</div>
									<div>
										<Label htmlFor="password">Password</Label>
										<Input
											id="password"
											type="password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
											required
											minLength={8}
										/>
									</div>
									<div>
										<Label htmlFor="confirmPassword">Confirm Password</Label>
										<Input
											id="confirmPassword"
											type="password"
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
											required
											minLength={8}
										/>
									</div>
									<Button
										type="submit"
										className="w-full"
										disabled={acceptWithSignupMutation.isPending}
									>
										{acceptWithSignupMutation.isPending
											? "Setting up your account…"
											: "Sign Up & Accept Invitation"}
									</Button>
								</form>
							</div>

							{/* Login option */}
							<div className="pt-4 border-t">
								<p className="text-sm text-center text-muted-foreground">
									Already have an account?{" "}
									<Button
										variant="link"
										className="h-auto p-0 text-primary"
										onClick={() => {
											navigate({
												to: "/login",
												search: { invitationToken: token, orgId },
											});
										}}
									>
										Log in to accept invitation
									</Button>
								</p>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	// Loading state
	if (isSessionLoading || isLoadingInvitation) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	// Error state
	if (invitationError || !isValid) {
		const errorMessage =
			invitationData?.error ||
			(invitationError instanceof Error
				? invitationError.message
				: "Invalid invitation");

		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-destructive">
							<XCircle className="size-5" />
							Invalid Invitation
						</CardTitle>
						<CardDescription>{errorMessage}</CardDescription>
					</CardHeader>
					<CardContent>
						<Button
							className="w-full"
							variant="outline"
							onClick={() => navigate({ to: "/", search: {} })}
						>
							Go to Home
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	// Processing acceptance
	if (acceptMutation.isPending || acceptMutation.isSuccess) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
				<Card className="w-full max-w-md">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							{acceptMutation.isSuccess ? (
								<>
									<CheckCircle className="size-5 text-green-600" />
									Success!
								</>
							) : (
								<>
									<Loader2 className="size-5 animate-spin" />
									Accepting Invitation...
								</>
							)}
						</CardTitle>
						<CardDescription>
							{acceptMutation.isSuccess
								? "You've successfully joined the organization. Redirecting to dashboard..."
								: "Please wait while we process your invitation"}
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	// Default loading state
	return (
		<div className="min-h-screen flex items-center justify-center">
			<Loader2 className="size-8 animate-spin text-muted-foreground" />
		</div>
	);
}
