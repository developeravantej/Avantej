import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/ui/loading-spinner";
import { rmToCents, centsToRm } from "@/lib/money";
import { formatPrice } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";

export interface RefundPackageTarget {
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
}

export interface RefundPackageDialogProps {
	organizationId: string;
	target: RefundPackageTarget | null;
	onClose: () => void;
}

export function RefundPackageDialog({
	organizationId,
	target,
	onClose,
}: RefundPackageDialogProps) {
	const queryClient = useQueryClient();
	const amountRef = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (amountRef.current) amountRef.current.value = "";
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const { data: suggestion, isLoading: suggestionLoading } = useQuery({
		queryKey: [
			"installments-suggest-refund",
			organizationId,
			target?.packageInstanceId,
		],
		queryFn: () =>
			client.installments.suggestRefund({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
			}),
		enabled: !!organizationId && !!target?.packageInstanceId,
	});

	// Pre-fill the amount field when suggestion loads
	const suggestedAmountRm =
		suggestion != null ? centsToRm(suggestion.suggestedRefund) : "";

	const refundMutation = useMutation({
		mutationFn: (vars: { amountCents: number; reason: string }) =>
			client.installments.processRefund({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
				amount: vars.amountCents,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-due-soon-count"],
			});
			queryClient.invalidateQueries({
				queryKey: [
					"sales-installments-schedule",
					organizationId,
					target?.packageInstanceId,
				],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Refund processed. Pending installments have been cancelled.");
			reset();
			onClose();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to process refund."),
	});

	function handleSubmit() {
		const rawAmount = amountRef.current?.value?.trim() ?? "";
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!target || !rawAmount || !reason) return;
		const amountCents = rmToCents(rawAmount);
		if (isNaN(amountCents) || amountCents <= 0) {
			toast.error("Enter a valid refund amount.");
			return;
		}
		refundMutation.mutate({ amountCents, reason });
	}

	return (
		<Dialog
			open={!!target}
			onOpenChange={(open) => {
				if (!open) {
					reset();
					onClose();
				}
			}}
		>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENTS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Process Refund
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `${target.customerName ?? "Customer"}${target.purchaseNumber ? ` (${target.purchaseNumber})` : ""}. Pending and overdue installments will be cancelled.`
							: "Process a refund for this package."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{suggestionLoading ? (
						<div className="py-6">
							<PageLoader />
						</div>
					) : (
						<div className="flex flex-col gap-4 py-2">
							{suggestion && (
								<div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-sm">
									<p className="font-medium text-[#0a0a0a] mb-1">
										Suggested refund:{" "}
										<span className="font-bold">
											{formatPrice(suggestion.suggestedRefund, "MYR")}
										</span>
									</p>
									<p className="text-[#737373] text-xs">{suggestion.reasoning}</p>
									{suggestion.suggestedRefundTax > 0 && (
										<p className="text-[#737373] text-xs mt-1">
											Includes approx. tax:{" "}
											{formatPrice(suggestion.suggestedRefundTax, "MYR")}
										</p>
									)}
								</div>
							)}

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="refund-amount">
									Refund Amount (RM) <span className="text-rose-600">*</span>
								</Label>
								<Input
									id="refund-amount"
									ref={amountRef}
									type="number"
									min="0"
									step="0.01"
									placeholder="0.00"
									defaultValue={suggestedAmountRm}
									key={suggestedAmountRm}
								/>
								<p className="text-[11px] text-[#737373]">
									Already-paid installments are flagged for{" "}
									<strong>manual refund</strong> — no automatic Stripe money
									movement occurs. Record the actual amount refunded.
								</p>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="refund-reason">
									Reason <span className="text-rose-600">*</span>
								</Label>
								<Textarea
									id="refund-reason"
									ref={reasonRef}
									placeholder="Provide a reason for this refund…"
									rows={3}
									defaultValue=""
								/>
							</div>
						</div>
					)}
				</div>

				<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
					<Button
						variant="outline"
						onClick={() => {
							reset();
							onClose();
						}}
						disabled={refundMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="refund-package-confirm"
						onClick={handleSubmit}
						disabled={refundMutation.isPending || suggestionLoading}
						className="bg-rose-600 text-white hover:bg-rose-700"
					>
						{refundMutation.isPending ? "Processing…" : "Process Refund"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
