import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/set-password")({
	component: SetPasswordPage,
});

function SetPasswordPage() {
	const { data: session, isPending } = authClient.useSession();

	const [password, setPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [done, setDone] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);

		if (password.length < 8) {
			setError("Password must be at least 8 characters.");
			return;
		}
		if (password !== confirm) {
			setError("Passwords do not match.");
			return;
		}

		setLoading(true);
		try {
			// Server-only Better-Auth setPassword (links a credential account for a
			// magic-link-claimed user). Idempotent: already-set is treated as success.
			await client.auth.setPassword({ newPassword: password });
			setDone(true);
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			setError(msg || "Failed to set password. Please try again.");
		} finally {
			setLoading(false);
		}
	};

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		);
	}

	// Link expired or user navigated here directly without a session.
	if (!session) {
		return (
			<div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center p-4">
				<Card className="w-full">
					<CardHeader>
						<CardTitle>Link expired</CardTitle>
						<CardDescription>
							This sign-in link has expired or has already been used. Ask your
							gym to send a new one.
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	// Password set successfully.
	if (done) {
		return (
			<div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center p-4">
				<Card className="w-full">
					<CardHeader className="items-center text-center">
						<div className="mb-2 flex size-12 items-center justify-center rounded-full bg-green-100">
							<CheckCircle className="size-6 text-green-600" />
						</div>
						<CardTitle>You're all set!</CardTitle>
						<CardDescription>
							Your password has been saved. Sign in to the Avantej app with your
							email and password to access your membership.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						<div className="flex items-center gap-3 rounded-lg border p-4">
							<Smartphone className="size-5 shrink-0 text-muted-foreground" />
							<div className="text-sm">
								<p className="font-medium">Sign in with</p>
								<p className="text-muted-foreground">{session.user.email}</p>
							</div>
						</div>
						<p className="text-center text-muted-foreground text-xs">
							Download the Avantej app from the App Store or Google Play to
							manage your membership.
						</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="mx-auto flex min-h-[70vh] w-full max-w-lg items-center justify-center p-4">
			<Card className="w-full">
				<CardHeader>
					<CardTitle>Set your password</CardTitle>
					<CardDescription>
						Welcome, {session.user.name || session.user.email}. Create a
						password to sign in to the Avantej app next time.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						{error && (
							<div className="rounded-md bg-red-50 p-3 text-red-700 text-sm">
								{error}
							</div>
						)}
						<div className="space-y-1.5">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								placeholder="At least 8 characters"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="new-password"
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="confirm">Confirm password</Label>
							<Input
								id="confirm"
								type="password"
								placeholder="Repeat your password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								autoComplete="new-password"
								required
							/>
						</div>
						<Button
							type="submit"
							className="w-full"
							disabled={loading || !password || !confirm}
						>
							{loading ? (
								<>
									<Loader2 className="mr-2 size-4 animate-spin" />
									Saving…
								</>
							) : (
								"Set password"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
