import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, CheckCircle, XCircle, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";
import { SignupForm } from "@/components/forms/signup-form";

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
	const acceptMutation = useMutation({
		mutationFn: async () => {
			if (!token || !orgId) {
				throw new Error("Token and organization ID are required");
			}
			return await client.invitations.accept({
				token,
				organizationId: orgId,
			});
		},
		onSuccess: () => {
			toast.success("Successfully joined organization!");
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
		onError: (error: Error) => {
			// Handle specific error cases
			if (error.message.includes("UNAUTHORIZED")) {
				toast.error("Please sign up or log in to accept this invitation");
			} else if (error.message.includes("different email address") || error.message.includes("sent to")) {
				toast.error(error.message || "This invitation was sent to a different email address");
			} else {
				toast.error(`Failed to accept invitation: ${error.message}`);
			}
		},
	});

	// Auto-accept if user is logged in and invitation is valid (for existing users logging in)
	useEffect(() => {
		if (
			!isSessionLoading &&
			session?.user &&
			isValid &&
			!acceptMutation.isPending &&
			!acceptMutation.isSuccess
		) {
			// Verify email matches invitation before auto-accepting
			const userEmail = session.user.email?.toLowerCase();
			const invitationEmail = invitation?.email.toLowerCase();
			
			if (userEmail === invitationEmail) {
				acceptMutation.mutate();
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

	// Function to handle signup success and accept invitation directly
	const handleSignupSuccess = async () => {
		try {
			// Refresh session after signup
			await refetchSession();
			
			// Wait a moment for session to propagate
			await new Promise(resolve => setTimeout(resolve, 500));

			const sessionResult = await authClient.getSession();
			
			// Verify session is available and email matches
			if (!sessionResult.data?.user) {
				console.error("Session not available after signup");
				toast.error("Failed to verify session after signup. Please try accepting the invitation again.");
				return;
			}
			
			const userEmail = sessionResult.data.user.email?.toLowerCase();
			const invitationEmail = invitation?.email.toLowerCase();
			
			if (userEmail !== invitationEmail) {
				toast.error(`Email mismatch: signed up with ${sessionResult.data.user.email} but invitation is for ${invitation?.email}`);
				return;
			}
			
			// Directly call accept mutation
			if (!acceptMutation.isPending && !acceptMutation.isSuccess) {
				acceptMutation.mutate();
			}
		} catch (error) {
			console.error("Error handling signup success:", error);
			toast.error("Failed to accept invitation after signup. Please try again.");
		}
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
									<UserPlus className="h-6 w-6 text-primary" />
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
									<Mail className="h-4 w-4 text-muted-foreground" />
									<span className="text-muted-foreground">Invited email:</span>
									<span className="font-medium">{invitation.email}</span>
								</div>
								<div className="flex items-center gap-2 text-sm">
									<span className="text-muted-foreground">Role:</span>
									<span className="font-medium capitalize">{invitation.role}</span>
								</div>
							</div>

							{/* Signup form with pre-filled email */}
							<div className="pt-2">
								<p className="text-sm text-muted-foreground mb-4 text-center">
									Create your account to accept this invitation and join the organization
								</p>
								<SignupForm 
									invitationEmail={invitation.email}
									invitationToken={token}
									orgId={orgId}
									onSignupSuccess={handleSignupSuccess}
								/>
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
				<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
							<XCircle className="h-5 w-5" />
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
									<CheckCircle className="h-5 w-5 text-green-600" />
									Success!
								</>
							) : (
								<>
									<Loader2 className="h-5 w-5 animate-spin" />
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
			<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
		</div>
	);
}
