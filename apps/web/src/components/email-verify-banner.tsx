"use client";

import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const DISMISS_KEY = "email_verify_banner_dismissed_until";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
	try {
		const raw = localStorage.getItem(DISMISS_KEY);
		if (!raw) return false;
		const until = Number(raw);
		return Date.now() < until;
	} catch {
		return false;
	}
}

function dismiss(): void {
	try {
		const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
		localStorage.setItem(DISMISS_KEY, String(until));
	} catch {
		// ignore storage errors
	}
}

export function EmailVerifyBanner() {
	const { data: userContext } = useUserContext();
	const [dismissed, setDismissed] = useState<boolean>(() => isDismissed());

	// Only show when we have user data and email is not verified
	const emailVerified = userContext?.user?.emailVerified ?? true;
	if (emailVerified || dismissed) return null;

	function handleDismiss() {
		dismiss();
		setDismissed(true);
	}

	return (
		<>
			<div
				data-testid="email-verify-banner"
				className={cn(
					"fixed top-0 left-0 right-0 z-50",
					"bg-amber-50 border-b border-amber-200 text-amber-900",
					"px-4 py-2.5 flex items-center justify-between gap-4 shadow-sm",
				)}
			>
				<p className="text-sm font-medium">
					Verify your email to receive booking confirmations and invoices.{" "}
					<span className="font-normal text-amber-800">
						Check your inbox for the verification link.
					</span>
				</p>
				<div className="flex shrink-0 items-center gap-2">
					<Button
						size="sm"
						variant="outline"
						className="h-7 border-amber-300 bg-amber-50 px-3 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
						onClick={handleDismiss}
						aria-label="Dismiss email verification reminder"
					>
						<X className="mr-1 h-3 w-3" />
						Dismiss
					</Button>
				</div>
			</div>
			{/* Spacer so content below is not covered by the fixed banner */}
			<div className="h-10" />
		</>
	);
}
