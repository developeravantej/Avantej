import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";

export interface OverdraftToggleProps {
	organizationId: string;
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
	/** Current state of the allowCreditOverdraft flag */
	allowCreditOverdraft: boolean;
	disabled?: boolean;
}

export function OverdraftToggle({
	organizationId,
	packageInstanceId,
	purchaseNumber,
	customerName,
	allowCreditOverdraft,
	disabled,
}: OverdraftToggleProps) {
	const queryClient = useQueryClient();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const overdraftMutation = useMutation({
		mutationFn: (vars: { enabled: boolean; reason: string }) =>
			client.installments.setOverdraft({
				organizationId,
				packageInstanceId,
				enabled: vars.enabled,
				reason: vars.reason,
			}),
		onSuccess: (_data, vars) => {
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-due-soon-count"],
			});
			queryClient.invalidateQueries({
				queryKey: ["installments-pkg-state", organizationId, packageInstanceId],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success(
				vars.enabled
					? "Overdraft bypass enabled."
					: "Overdraft bypass disabled.",
			);
			reset();
			setConfirmOpen(false);
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to update overdraft setting."),
	});

	function handleConfirm() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!reason) return;
		overdraftMutation.mutate({ enabled: !allowCreditOverdraft, reason });
	}

	const targetEnabled = !allowCreditOverdraft;

	return (
		<>
			<button
				type="button"
				data-testid="pkg-action-overdraft"
				onClick={() => setConfirmOpen(true)}
				disabled={disabled}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
					allowCreditOverdraft
						? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
						: "border-[#e5e5e5] bg-white text-[#737373] hover:bg-[#f3f3f3] hover:text-[#0a0a0a]",
				)}
			>
				<span
					className={cn(
						"inline-block h-2 w-2 rounded-full",
						allowCreditOverdraft ? "bg-amber-500" : "bg-[#d4d4d4]",
					)}
				/>
				Overdraft{allowCreditOverdraft ? " Enabled" : " Disabled"}
			</button>

			<Dialog
				open={confirmOpen}
				onOpenChange={(open) => {
					if (!open) {
						reset();
						setConfirmOpen(false);
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
							{targetEnabled ? "Enable" : "Disable"} Overdraft Bypass
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							{customerName ?? "Customer"}
							{purchaseNumber ? ` (${purchaseNumber})` : ""}.{" "}
							{targetEnabled
								? "Credit-consuming operations (bookings, check-ins) will bypass the lock check for this package."
								: "The standard lock check will be re-applied for this package."}
						</DialogDescription>
					</DialogHeader>

					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="flex flex-col gap-4 py-2">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="overdraft-reason">
									Reason <span className="text-rose-600">*</span>
								</Label>
								<Textarea
									id="overdraft-reason"
									ref={reasonRef}
									placeholder={
										targetEnabled
											? "e.g. VIP customer — payment confirmed verbally…"
											: "e.g. Payment arrangement ended…"
									}
									rows={3}
									defaultValue=""
								/>
							</div>
						</div>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							variant="outline"
							onClick={() => {
								reset();
								setConfirmOpen(false);
							}}
							disabled={overdraftMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							data-testid="pkg-action-overdraft-confirm"
							onClick={handleConfirm}
							disabled={overdraftMutation.isPending}
							className={cn(
								"text-white",
								targetEnabled
									? "bg-amber-600 hover:bg-amber-700"
									: "bg-[#0a0a0a] hover:bg-[#262626]",
							)}
						>
							{overdraftMutation.isPending
								? "Saving…"
								: targetEnabled
									? "Enable Overdraft"
									: "Disable Overdraft"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
