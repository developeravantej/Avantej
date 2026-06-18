import { useState } from "react";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import {
	type PayoutListItem,
	useCancelPayout,
	useMarkPayoutFailed,
	useMarkPayoutPaid,
	useRetryPayout,
} from "@/features/payouts/api";
import {
	CancelPayoutDialog,
	MarkFailedDialog,
	MarkPaidDialog,
	RetryPayoutDialog,
} from "@/features/payouts/components/payout-action-dialogs";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// F-PAY-6: per-row state-machine actions gated by commission_payout:process
export function PayoutRowActions({
	payout,
	organizationId,
	canProcess,
}: {
	payout: PayoutListItem;
	organizationId: string;
	canProcess: boolean;
}) {
	// One slot drives which dialog is open. null = closed. Each item in the
	// dropdown sets this; the dialog component then owns the form + mutation.
	type DialogKind = "markPaid" | "markFailed" | "retry" | "cancel";
	const [activeDialog, setActiveDialog] = useState<DialogKind | null>(null);

	// Surface pending state on the trigger button. Each mutation runs inside
	// its dialog component now, so we read from the same hooks here just to
	// reflect the loading state on the row — actual `mutate` calls happen
	// in the dialog.
	const markPaid = useMarkPayoutPaid(organizationId);
	const markFailed = useMarkPayoutFailed(organizationId);
	const retry = useRetryPayout(organizationId);
	const cancel = useCancelPayout(organizationId);
	const isBusy =
		markPaid.isPending ||
		markFailed.isPending ||
		retry.isPending ||
		cancel.isPending;

	const { status } = payout;

	// Terminal statuses or no permission — render nothing
	if (
		!canProcess ||
		status === "paid" ||
		status === "canceled" ||
		status === "cancelled"
	) {
		return null;
	}

	const close = () => setActiveDialog(null);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={isBusy}
					className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8a8f91] transition-colors hover:bg-[#f3f3f3] hover:text-[#0a0a0a] disabled:opacity-40"
					aria-label="Payout actions"
					data-testid="payout-row-actions"
				>
					{isBusy ? (
						<RefreshCw className="h-3.5 w-3.5 animate-spin" />
					) : (
						<MoreHorizontal className="h-4 w-4" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-48">
				{(status === "pending" || status === "processing") && (
					<>
						<DropdownMenuItem
							onClick={() => setActiveDialog("markPaid")}
							className="text-emerald-700 focus:bg-emerald-50 focus:text-emerald-700"
						>
							Mark Paid
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setActiveDialog("markFailed")}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Mark Failed
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setActiveDialog("cancel")}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Cancel
						</DropdownMenuItem>
					</>
				)}
				{status === "failed" && (
					<>
						<DropdownMenuItem
							onClick={() => setActiveDialog("retry")}
							className="text-blue-600 focus:bg-blue-50 focus:text-blue-600"
						>
							Retry
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setActiveDialog("cancel")}
							className="text-rose-600 focus:bg-rose-50 focus:text-rose-600"
						>
							Cancel
						</DropdownMenuItem>
					</>
				)}
			</DropdownMenuContent>

			{/* Dialogs render alongside the menu — each owns its form + mutation.
			    They're conditionally mounted via `payout` prop (null = closed) so
			    Radix's Dialog focus traps don't fight with the dropdown's. */}
			<MarkPaidDialog
				organizationId={organizationId}
				payout={activeDialog === "markPaid" ? payout : null}
				onClose={close}
			/>
			<MarkFailedDialog
				organizationId={organizationId}
				payout={activeDialog === "markFailed" ? payout : null}
				onClose={close}
			/>
			<RetryPayoutDialog
				organizationId={organizationId}
				payout={activeDialog === "retry" ? payout : null}
				onClose={close}
			/>
			<CancelPayoutDialog
				organizationId={organizationId}
				payout={activeDialog === "cancel" ? payout : null}
				onClose={close}
			/>
		</DropdownMenu>
	);
}
