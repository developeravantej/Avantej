import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { client, orpc } from "@/utils/orpc";

export interface UnlockPackageTarget {
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
	lockedReason: string | null;
}

export interface UnlockPackageDialogProps {
	organizationId: string;
	target: UnlockPackageTarget | null;
	onClose: () => void;
}

export function UnlockPackageDialog({
	organizationId,
	target,
	onClose,
}: UnlockPackageDialogProps) {
	const queryClient = useQueryClient();
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const unlockMutation = useMutation({
		mutationFn: (vars: { reason: string }) =>
			client.installments.manualUnlock({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
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
			queryClient.invalidateQueries({
				queryKey: [
					"installments-pkg-state",
					organizationId,
					target?.packageInstanceId,
				],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Package unlocked.");
			reset();
			onClose();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to unlock package."),
	});

	function handleSubmit() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!target || !reason) return;
		unlockMutation.mutate({ reason });
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
						Unlock Package
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `${target.customerName ?? "Customer"}${target.purchaseNumber ? ` (${target.purchaseNumber})` : ""}${target.lockedReason ? `. Currently locked: ${target.lockedReason}.` : "."} The package will be unlocked and the member can resume using credits.`
							: "Manually unlock this locked package."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="unlock-package-reason">
								Reason <span className="text-rose-600">*</span>
							</Label>
							<Textarea
								id="unlock-package-reason"
								ref={reasonRef}
								placeholder="Provide a reason for unlocking this package…"
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
							onClose();
						}}
						disabled={unlockMutation.isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="pkg-action-unlock-confirm"
						onClick={handleSubmit}
						disabled={unlockMutation.isPending}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{unlockMutation.isPending ? "Unlocking…" : "Unlock Package"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
