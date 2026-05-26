/**
 * Phase 4 — Customer 360 magic-link actions.
 *
 * Two surfaces:
 *   - Placeholder email (lead came from GHL with phone only) → "Add email
 *     + send sign-in" form. Backfills `user.email`, flips verified, and
 *     dispatches a fresh magic-link.
 *   - Real email → "Resend sign-in link" button. Generic recovery for
 *     customers who lost or missed their original sign-in email.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";

const PLACEHOLDER_DOMAINS = ["@ghl.placeholder", "@avantej.placeholder"];

function isPlaceholder(email: string | null | undefined): boolean {
	if (!email) return false;
	return PLACEHOLDER_DOMAINS.some((d) => email.endsWith(d));
}

export function MagicLinkActions(props: {
	organizationId: string;
	customerProfileId: string;
	customerEmail: string | null | undefined;
	isUnclaimed?: boolean;
}) {
	const { organizationId, customerProfileId, customerEmail, isUnclaimed } = props;
	const placeholder = isPlaceholder(customerEmail);
	const [newEmail, setNewEmail] = useState("");

	const sendClaim = useApiMutation({
		mutationFn: (input: { email: string }) =>
			client.customerProfiles.sendClaimLink({
				organizationId,
				customerProfileId,
				email: input.email,
			}) as Promise<{ success: boolean; email: string }>,
		successMessage: (result) =>
			`Claim link sent to ${(result as { email: string }).email}`,
		errorMessage: (err) => err.message || "Failed to send claim link",
		onSuccess: () => setNewEmail(""),
	});

	const addEmail = useApiMutation({
		mutationFn: (input: { email: string }) =>
			client.customerProfiles.addEmailAndDispatchMagicLink({
				organizationId,
				customerProfileId,
				email: input.email,
			}) as Promise<{ success: boolean; email: string }>,
		successMessage: (result) =>
			`Sign-in link sent to ${(result as { email: string }).email}`,
		errorMessage: (err) =>
			err.message || "Failed to add email and dispatch link",
		onSuccess: () => setNewEmail(""),
	});

	const resend = useApiMutation({
		mutationFn: () =>
			client.customerProfiles.resendMagicLink({
				organizationId,
				customerProfileId,
			}) as Promise<{ success: boolean; email: string }>,
		successMessage: (result) =>
			`Sign-in link resent to ${(result as { email: string }).email}`,
		errorMessage: (err) => err.message || "Failed to resend sign-in link",
	});

	if (isUnclaimed) {
		return (
			<div className="rounded-md border border-blue-200 bg-blue-50 p-3">
				<div className="mb-2 flex items-center gap-2">
					<Badge variant="outline" className="border-blue-400 text-blue-700">
						Unclaimed
					</Badge>
					<span className="text-blue-700 text-xs">
						This profile was created by staff. Send a claim link so the customer can log in and take ownership.
					</span>
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						if (!newEmail.trim()) {
							toast.error("Email is required");
							return;
						}
						sendClaim.mutate({ email: newEmail.trim() });
					}}
					className="flex flex-col gap-2 sm:flex-row"
				>
					<div className="flex-1">
						<Label htmlFor="claim-email" className="sr-only">
							Customer email
						</Label>
						<Input
							id="claim-email"
							type="email"
							placeholder="customer@example.com"
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
							disabled={sendClaim.isPending}
						/>
					</div>
					<Button
						type="submit"
						disabled={sendClaim.isPending || !newEmail.trim()}
					>
						{sendClaim.isPending ? "Sending…" : "Send claim link"}
					</Button>
				</form>
			</div>
		);
	}

	if (placeholder) {
		return (
			<div className="rounded-md border border-amber-300 bg-amber-50 p-3">
				<div className="mb-2 flex items-center gap-2">
					<Badge variant="outline" className="border-amber-500 text-amber-700">
						Pending email
					</Badge>
					<span className="text-amber-700 text-xs">
						Customer was registered via GHL with phone only. Add their real
						email below to send a sign-in link.
					</span>
				</div>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						if (!newEmail.trim()) {
							toast.error("Email is required");
							return;
						}
						addEmail.mutate({ email: newEmail.trim() });
					}}
					className="flex flex-col gap-2 sm:flex-row"
				>
					<div className="flex-1">
						<Label htmlFor="placeholder-backfill-email" className="sr-only">
							Real email
						</Label>
						<Input
							id="placeholder-backfill-email"
							type="email"
							placeholder="customer@example.com"
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
							disabled={addEmail.isPending}
						/>
					</div>
					<Button
						type="submit"
						disabled={addEmail.isPending || !newEmail.trim()}
					>
						{addEmail.isPending ? "Sending…" : "Add email + send sign-in"}
					</Button>
				</form>
			</div>
		);
	}

	if (!customerEmail) return null;

	return (
		<div className="flex items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={resend.isPending}
				onClick={() => resend.mutate()}
			>
				{resend.isPending ? "Sending…" : "Resend sign-in link"}
			</Button>
		</div>
	);
}
