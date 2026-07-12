/**
 * Shared loading / error frames for the print pages (outside the dashboard
 * shell, so they carry their own minimal chrome).
 */

import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * Classify a print-page query error by the oRPC error's structured fields
 * (`code`/`status`) rather than message-substring matching — FORBIDDEN (an
 * out-of-scope branch) must read as access-denied, not a generic failure.
 * Falls back to message text for non-oRPC errors.
 */
export function classifyPrintError(
	error: unknown,
): "not_found" | "forbidden" | "no_payment" | "other" {
	const e = error as {
		code?: string;
		status?: number;
		message?: string;
	} | null;
	const code = e?.code ?? "";
	const status = e?.status ?? 0;
	const msg = e?.message ?? "";
	if (code === "NOT_FOUND" || status === 404 || msg.includes("NOT_FOUND"))
		return "not_found";
	if (code === "FORBIDDEN" || status === 403 || msg.includes("FORBIDDEN"))
		return "forbidden";
	if (code === "BAD_REQUEST" || status === 400 || msg.includes("BAD_REQUEST"))
		return "no_payment";
	return "other";
}

export function PrintPageLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-[#f4f4f5]">
			<div className="flex items-center gap-3 text-[#52525b]">
				<Loader2 className="h-5 w-5 animate-spin" />
				Preparing document…
			</div>
		</div>
	);
}

export function PrintPageError({ message }: { message: string }) {
	const router = useRouter();
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#f4f4f5] px-4">
			<p className="max-w-md text-center text-[#52525b]">{message}</p>
			<button
				type="button"
				onClick={() => router.history.back()}
				className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-[#16181d] text-sm shadow-sm transition hover:bg-gray-50"
			>
				<ArrowLeft className="h-4 w-4" />
				Back
			</button>
		</div>
	);
}
