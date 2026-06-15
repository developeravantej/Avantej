import { useState } from "react";
import { useApiMutation } from "@/hooks/useApiMutation";
import { formatPrice, rmToCents } from "@/lib/money";
import { saleRef } from "@/features/refunds/refunds.helpers";
import type { RefundRow } from "@/features/refunds/refunds.types";
import { client, orpc } from "@/utils/orpc";

// ─── Inline expanded decision panel ───────────────────────────────────────────

export function InlineDecisionPanel({
	refund,
	organizationId,
	onApproved,
	onReject,
}: {
	refund: RefundRow;
	organizationId: string;
	onApproved: () => void;
	onReject: (refund: RefundRow) => void;
}) {
	const [amountRm, setAmountRm] = useState(
		(refund.amountCents / 100).toFixed(2),
	);
	const [notes, setNotes] = useState("");
	const [error, setError] = useState<string | null>(null);

	const approveMutation = useApiMutation({
		mutationFn: (vars: {
			id: string;
			approveAmountCents?: number;
			reviewNotes?: string;
		}) =>
			client.refunds.approve({
				organizationId,
				id: vars.id,
				approveAmountCents: vars.approveAmountCents,
				reviewNotes: vars.reviewNotes,
			}),
		successMessage: () => {
			const cents = rmToCents(Number(amountRm));
			return cents < refund.amountCents
				? `Partial approval: ${formatPrice(cents, "MYR")} approved.`
				: "Refund approved in full.";
		},
		errorMessage: (err) => err.message ?? "Failed to approve refund.",
		invalidate: [orpc.refunds.list.key()],
		onSuccess: () => {
			onApproved();
		},
	});

	function handleApprove() {
		const parsed = Number(amountRm);
		if (Number.isNaN(parsed) || parsed <= 0) {
			setError("Enter a valid amount greater than 0.");
			return;
		}
		const cents = rmToCents(parsed);
		if (cents > refund.amountCents) {
			setError(
				`Cannot exceed requested amount (${formatPrice(refund.amountCents, "MYR")}).`,
			);
			return;
		}
		setError(null);
		approveMutation.mutate({
			id: refund.id,
			approveAmountCents: cents,
			reviewNotes: notes.trim() || undefined,
		});
	}

	return (
		<div
			className="border-t border-[#e5e5e5] bg-[#f3f3f3] px-6 py-5"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="grid grid-cols-3 gap-8">
				{/* Refund Details */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Refund Details
					</div>
					<div className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-[#737373]">Refund ID</span>
							<span className="font-mono text-xs">{refund.refundNumber}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Original sale</span>
							<span className="font-mono text-xs">{saleRef(refund)}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Requested amount</span>
							<span className="font-mono font-semibold">
								{formatPrice(refund.amountCents, "MYR")}
							</span>
						</div>
						<div className="flex justify-between">
							<span className="text-[#737373]">Reason category</span>
							<span className="text-xs truncate max-w-[140px]">
								{refund.reason}
							</span>
						</div>
					</div>
				</div>

				{/* Customer Note */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Customer Note
					</div>
					<div className="rounded-lg border border-[#e5e5e5] bg-white p-3 text-sm text-[#737373] leading-relaxed">
						{refund.notes ? (
							<span>"{refund.notes}"</span>
						) : (
							<span className="italic">No additional notes provided.</span>
						)}
					</div>
					<div className="mt-2 text-xs text-[#737373]">No attachments</div>
				</div>

				{/* Decision */}
				<div>
					<div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Decision
					</div>
					<div className="mb-3">
						<label className="mb-1.5 block text-xs font-medium text-[#0a0a0a]">
							Approve amount (edit if partial)
						</label>
						<div className="flex gap-0">
							<span className="flex items-center rounded-l-lg border border-r-0 border-[#e5e5e5] bg-white px-3 text-sm font-medium text-[#737373]">
								RM
							</span>
							<input
								type="number"
								step="0.01"
								min="0.01"
								className="w-full rounded-l-none rounded-r-lg border border-[#e5e5e5] bg-white px-3 py-[9px] text-sm text-[#0a0a0a] outline-none transition-colors focus:border-[#0a0a0a]"
								value={amountRm}
								onChange={(e) => {
									setAmountRm(e.target.value);
									setError(null);
								}}
							/>
						</div>
						{error && <p className="mt-1 text-xs text-red-600">{error}</p>}
					</div>
					<div className="mb-4">
						<label className="mb-1.5 block text-xs font-medium text-[#0a0a0a]">
							Internal note (optional)
						</label>
						<textarea
							rows={2}
							className="w-full resize-none rounded-lg border border-[#e5e5e5] bg-white px-3 py-[9px] text-sm text-[#0a0a0a] placeholder-[#6b7170] outline-none transition-colors focus:border-[#0a0a0a]"
							placeholder="e.g. Verified relocation documents…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={approveMutation.isPending}
							onClick={handleApprove}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-semibold text-[#15803d] transition-colors hover:bg-[#dcfce7] disabled:opacity-50"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								aria-hidden
							>
								<path d="M20 6 9 17l-5-5" />
							</svg>
							{approveMutation.isPending ? "Approving…" : "Approve"}
						</button>
						<button
							type="button"
							disabled={approveMutation.isPending}
							onClick={() => onReject(refund)}
							className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3.5 py-2 text-[13px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fee2e2] disabled:opacity-50"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								aria-hidden
							>
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
							Reject
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
