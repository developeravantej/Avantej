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
import { client, orpc } from "@/utils/orpc";

export interface AdjustCreditsTarget {
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
}

export interface AdjustCreditsDialogProps {
	organizationId: string;
	target: AdjustCreditsTarget | null;
	onClose: () => void;
}

export function AdjustCreditsDialog({
	organizationId,
	target,
	onClose,
}: AdjustCreditsDialogProps) {
	const queryClient = useQueryClient();
	const creditsUnlockedRef = useRef<HTMLInputElement>(null);
	const creditsUsedRef = useRef<HTMLInputElement>(null);
	const reasonRef = useRef<HTMLTextAreaElement>(null);

	function reset() {
		if (creditsUnlockedRef.current) creditsUnlockedRef.current.value = "";
		if (creditsUsedRef.current) creditsUsedRef.current.value = "";
		if (reasonRef.current) reasonRef.current.value = "";
	}

	const { data: pkgState, isLoading: stateLoading } = useQuery({
		queryKey: [
			"installments-pkg-state",
			organizationId,
			target?.packageInstanceId,
		],
		queryFn: () =>
			client.installments.getPackageState({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
			}),
		enabled: !!organizationId && !!target?.packageInstanceId,
	});

	const adjustMutation = useMutation({
		mutationFn: (vars: {
			creditsUnlocked?: number;
			creditsUsed?: number;
			reason: string;
		}) =>
			client.installments.adjustCredits({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
				creditsUnlocked: vars.creditsUnlocked,
				creditsUsed: vars.creditsUsed,
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
			toast.success("Credits adjusted.");
			reset();
			onClose();
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to adjust credits."),
	});

	const resetOverrideMutation = useMutation({
		mutationFn: (vars: { reason: string }) =>
			client.installments.resetOverride({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: [
					"installments-pkg-state",
					organizationId,
					target?.packageInstanceId,
				],
			});
			queryClient.invalidateQueries({
				queryKey: ["sales-installments-upcoming"],
			});
			queryClient.invalidateQueries(
				orpc.installments.adminOverview.queryOptions({
					input: { organizationId },
				}),
			);
			toast.success("Admin override cleared — credits reset to formula.");
			reset();
			onClose();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to reset override."),
	});

	function handleSubmit() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!target || !reason) return;

		const rawUnlocked = creditsUnlockedRef.current?.value?.trim();
		const rawUsed = creditsUsedRef.current?.value?.trim();
		const creditsUnlocked =
			rawUnlocked !== "" && rawUnlocked !== undefined
				? parseInt(rawUnlocked, 10)
				: undefined;
		const creditsUsed =
			rawUsed !== "" && rawUsed !== undefined
				? parseInt(rawUsed, 10)
				: undefined;

		if (creditsUnlocked === undefined && creditsUsed === undefined) {
			toast.error(
				"Enter at least one credit value to adjust (unlocked or used).",
			);
			return;
		}

		adjustMutation.mutate({ creditsUnlocked, creditsUsed, reason });
	}

	function handleResetOverride() {
		const reason = reasonRef.current?.value?.trim() ?? "";
		if (!reason) {
			toast.error("Provide a reason before resetting the override.");
			return;
		}
		resetOverrideMutation.mutate({ reason });
	}

	const isPending = adjustMutation.isPending || resetOverrideMutation.isPending;

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
						Adjust Credits
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{target
							? `${target.customerName ?? "Customer"}${target.purchaseNumber ? ` (${target.purchaseNumber})` : ""}. Set creditsUnlocked and/or creditsUsed directly.`
							: "Adjust credit counts for this package."}
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 pt-4 pb-2 overflow-y-auto">
					{stateLoading ? (
						<div className="py-6">
							<PageLoader />
						</div>
					) : (
						<div className="flex flex-col gap-4 py-2">
							{pkgState && (
								<div className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-4 py-3 text-xs text-[#737373] grid grid-cols-3 gap-2">
									<div>
										<span className="block font-semibold text-[#0a0a0a]">
											Total
										</span>
										{pkgState.creditsTotal}
									</div>
									<div>
										<span className="block font-semibold text-[#0a0a0a]">
											Unlocked
										</span>
										{pkgState.creditsUnlocked ?? pkgState.creditsTotal}
									</div>
									<div>
										<span className="block font-semibold text-[#0a0a0a]">
											Used
										</span>
										{pkgState.creditsUsed}
									</div>
								</div>
							)}

							{pkgState?.creditsAdminOverride && (
								<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
									Admin override is active — payments use{" "}
									<code>max(current, formula)</code> for credits.{" "}
									<button
										type="button"
										data-testid="pkg-action-reset-override"
										onClick={handleResetOverride}
										disabled={isPending}
										className="underline font-semibold hover:text-amber-900 disabled:opacity-50"
									>
										Reset to formula
									</button>
								</div>
							)}

							<div className="grid grid-cols-2 gap-3">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="adjust-credits-unlocked">
										Credits Unlocked
									</Label>
									<Input
										id="adjust-credits-unlocked"
										ref={creditsUnlockedRef}
										type="number"
										min="0"
										step="1"
										placeholder={String(
											pkgState?.creditsUnlocked ?? pkgState?.creditsTotal ?? "",
										)}
										defaultValue=""
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor="adjust-credits-used">Credits Used</Label>
									<Input
										id="adjust-credits-used"
										ref={creditsUsedRef}
										type="number"
										min="0"
										step="1"
										placeholder={String(pkgState?.creditsUsed ?? "")}
										defaultValue=""
									/>
								</div>
							</div>

							<div className="flex flex-col gap-1.5">
								<Label htmlFor="adjust-credits-reason">
									Reason <span className="text-rose-600">*</span>
								</Label>
								<Textarea
									id="adjust-credits-reason"
									ref={reasonRef}
									placeholder="Provide a reason for this credit adjustment…"
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
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						data-testid="pkg-action-adjust-credits-confirm"
						onClick={handleSubmit}
						disabled={isPending || stateLoading}
						className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
					>
						{adjustMutation.isPending ? "Saving…" : "Save Adjustments"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
