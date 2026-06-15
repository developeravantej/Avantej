import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { client } from "@/utils/orpc";
import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { z } from "zod";

export const Route = createFileRoute("/verify-email")({
	component: VerifyEmailPage,
	validateSearch: z.object({
		token: z.string().catch(""),
		callbackURL: z
			.string()
			.catch("")
			.transform((v) =>
				v.startsWith("/") && !v.startsWith("//") ? v : "/login",
			),
	}),
});

function VerifyEmailPage() {
	const { token, callbackURL } = useSearch({ from: "/verify-email" });
	const navigate = useNavigate();
	const [state, setState] = useState<{
		status: "loading" | "success" | "error";
		errorMessage: string;
	}>({ status: "loading", errorMessage: "" });
	const { status, errorMessage } = state;

	// react-doctor-disable-next-line react-doctor/no-cascading-set-state -- consolidated to single setState({status,errorMessage}); the rule still flags multiple call sites across try/catch/early-return branches, but each branch performs exactly one atomic state transition
	useEffect(() => {
		let cancelled = false;
		let redirectTimer: ReturnType<typeof setTimeout> | null = null;

		async function run() {
			if (!token) {
				setState({
					status: "error",
					errorMessage: "Missing verification token.",
				});
				return;
			}

			try {
				// Use oRPC client for type-safe API calls
				await client.auth.verifyEmail({ token });

				if (cancelled) return;
				setState({ status: "success", errorMessage: "" });

				// Redirect after short delay (to login by default)
				redirectTimer = setTimeout(() => {
					navigate({ to: callbackURL });
				}, 1200);
			} catch (e) {
				if (cancelled) return;
				console.error("Email verification error:", e);
				setState({
					status: "error",
					errorMessage:
						"Email verification failed. The link may be expired or invalid.",
				});
			}
		}

		run();
		return () => {
			cancelled = true;
			if (redirectTimer !== null) clearTimeout(redirectTimer);
		};
	}, [token, callbackURL, navigate]);

	return (
		<div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center p-4">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Verify your email</CardTitle>
					<CardDescription>
						We’re verifying your email address. You’ll be redirected
						automatically.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{status === "loading" && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Verifying…
						</div>
					)}
					{status === "success" && (
						<div className="flex items-center gap-2 text-sm text-green-600">
							<CheckCircle className="size-4" />
							Email verified. Redirecting…
						</div>
					)}
					{status === "error" && (
						<div className="flex items-start gap-2 text-sm text-red-600">
							<XCircle className="mt-0.5 size-4" />
							<div>
								<div className="font-medium">Verification failed</div>
								<div className="text-red-600/90">{errorMessage}</div>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
