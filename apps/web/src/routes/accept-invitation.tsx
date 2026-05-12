import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { AcceptInvitationSignupCard } from "./accept-invitation-signup-card";

export const Route = createFileRoute("/accept-invitation")({
	component: AcceptInvitationPage,
	validateSearch: (search: Record<string, unknown>) => {
		return {
			token: (search.token as string) || "",
			orgId: (search.orgId as string) || "",
		};
	},
});

// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
function AcceptInvitationPage() {
	const { token, orgId } = useSearch({ from: "/accept-invitation" });
	const navigate = useNavigate();
	const { data: session, isPending: isSessionLoading, refetch: _refetchSession } = authClient.useSession();

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
	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- terminal auth flow: navigates to login after invitation acceptance, no cached queries to invalidate
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
			<AcceptInvitationSignupCard
				invitation={invitation}
				firstName={firstName}
				setFirstName={setFirstName}
				lastName={lastName}
				setLastName={setLastName}
				phone={phone}
				setPhone={setPhone}
				password={password}
				setPassword={setPassword}
				confirmPassword={confirmPassword}
				setConfirmPassword={setConfirmPassword}
				onSubmit={handleSubmitSignup}
				isPending={acceptWithSignupMutation.isPending}
				onLoginInstead={() => navigate({ to: "/login", search: { invitationToken: token, orgId } })}
			/>
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
			<div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
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
			<div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
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
									Accepting Invitation…
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
