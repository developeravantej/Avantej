import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { useApiMutation } from "@/hooks/useApiMutation";
import type { RefundRow } from "@/features/refunds/refunds.types";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";

// ─── Bulk Approve Bar ─────────────────────────────────────────────────────────

export function BulkApproveBar({
	selectedIds,
	selectedRows,
	organizationId,
	onDone,
}: {
	selectedIds: string[];
	selectedRows: RefundRow[];
	organizationId: string;
	onDone: () => void;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	const count = selectedIds.length;
	const totalCents = selectedRows.reduce((s, r) => s + r.amountCents, 0);

	const bulkApproveMutation = useApiMutation({
		mutationFn: () =>
			client.refunds.bulkApprove({
				organizationId,
				items: selectedIds.map((id) => ({ id })),
			}),
		successMessage: `Approved ${count} refund${count !== 1 ? "s" : ""}.`,
		errorMessage: (err) => err.message ?? "Bulk approve failed.",
		invalidate: [["refunds"]],
		onSuccess: () => {
			setConfirmOpen(false);
			onDone();
		},
	});

	const pendingOnly = selectedRows.every((r) => r.status === "pending");
	if (count === 0 || !pendingOnly) return null;

	return (
		<>
			{/* Floating bar anchored to bottom of the edge-to-edge wrapper */}
			<div className="flex shrink-0 items-center gap-3 border-t border-[#e5e5e5] bg-white px-6 py-3">
				<span className="text-sm font-medium text-[#0a0a0a]">
					{count} refund{count !== 1 ? "s" : ""} selected
				</span>
				<span className="font-mono text-sm tabular-nums text-[#737373]">
					{formatPrice(totalCents, "MYR")} total
				</span>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={onDone}
						className="rounded-lg border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
					>
						Clear
					</button>
					<button
						type="button"
						onClick={() => setConfirmOpen(true)}
						className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3.5 py-2 text-[13px] font-semibold text-[#15803d] transition-colors hover:bg-[#dcfce7]"
					>
						Approve {count}
					</button>
				</div>
			</div>

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent className="sm:max-w-sm">
					<DialogHeader>
						<DialogTitle>Bulk Approve Refunds</DialogTitle>
						<DialogDescription>
							Approve {count} refund{count !== 1 ? "s" : ""} totalling{" "}
							<span className="font-semibold font-mono">
								{formatPrice(totalCents, "MYR")}
							</span>
							? Each will be approved at its full requested amount.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setConfirmOpen(false)}
							disabled={bulkApproveMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => bulkApproveMutation.mutate()}
							disabled={bulkApproveMutation.isPending}
						>
							{bulkApproveMutation.isPending ? "Approving…" : "Confirm Approve"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
