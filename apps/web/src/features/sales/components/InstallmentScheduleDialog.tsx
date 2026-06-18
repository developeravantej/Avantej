import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { PageLoader } from "@/components/ui/loading-spinner";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { AdjustCreditsDialog } from "./AdjustCreditsDialog";
import { OverdraftToggle } from "./OverdraftToggle";
import { RefundPackageDialog } from "./RefundPackageDialog";
import { UnlockPackageDialog } from "./UnlockPackageDialog";

export interface ScheduleDialogTarget {
	packageInstanceId: string;
	purchaseNumber: string | null;
	customerName: string | null;
	serviceName: string | null;
}

export interface InstallmentScheduleDialogProps {
	organizationId: string;
	target: ScheduleDialogTarget | null;
	onClose: () => void;
	/** Pass true (canCollect) to show admin action controls */
	canManage?: boolean;
}

function fmtDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	return new Date(value).toLocaleDateString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

const STATUS_STYLES: Record<string, string> = {
	paid: "bg-emerald-50 text-emerald-700",
	pending: "bg-blue-50 text-blue-700",
	overdue: "bg-amber-50 text-amber-700",
	waived: "bg-neutral-100 text-neutral-600",
	cancelled: "bg-neutral-100 text-neutral-500",
};

export function InstallmentScheduleDialog({
	organizationId,
	target,
	onClose,
	canManage = false,
}: InstallmentScheduleDialogProps) {
	const [showRefund, setShowRefund] = useState(false);
	const [showAdjust, setShowAdjust] = useState(false);
	const [showUnlock, setShowUnlock] = useState(false);

	const setupAutoCharge = useMutation({
		mutationFn: () =>
			client.payments.createCardSetupSession({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
			}),
		onSuccess: (data) => {
			// Open the Stripe hosted Checkout in the same tab.
			window.location.href = data.url;
		},
		onError: (err: unknown) => {
			const msg =
				err instanceof Error ? err.message : "Failed to create setup session";
			console.error("[InstallmentScheduleDialog] createCardSetupSession:", msg);
		},
	});

	const { data, isLoading } = useQuery({
		queryKey: [
			"sales-installments-schedule",
			organizationId,
			target?.packageInstanceId,
		],
		queryFn: () =>
			client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId: target?.packageInstanceId ?? "",
			}),
		enabled: !!organizationId && !!target?.packageInstanceId,
	});

	const { data: pkgState } = useQuery({
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
		enabled: !!organizationId && !!target?.packageInstanceId && canManage,
	});

	const rows = data ?? [];

	function handleClose() {
		setShowRefund(false);
		setShowAdjust(false);
		setShowUnlock(false);
		onClose();
	}

	return (
		<>
			<Dialog
				open={!!target && !showRefund && !showAdjust && !showUnlock}
				onOpenChange={(open) => {
					if (!open) handleClose();
				}}
			>
				<DialogContent
					className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							INSTALLMENTS
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Payment Schedule
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							{target
								? `${target.customerName ?? "Customer"}${target.serviceName ? ` — ${target.serviceName}` : ""}${target.purchaseNumber ? ` (${target.purchaseNumber})` : ""}`
								: "Full installment schedule for this package."}
						</DialogDescription>
					</DialogHeader>

					<div className="px-6 pt-4 pb-6 overflow-y-auto">
						{isLoading ? (
							<PageLoader />
						) : rows.length === 0 ? (
							<p className="py-8 text-center text-sm text-[#737373]">
								No installments found for this package.
							</p>
						) : (
							<div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
								<table className="w-full text-sm">
									<thead className="bg-[#f3f3f3]/60">
										<tr>
											<th className="px-3 py-2 text-left font-medium text-[#737373]">
												#
											</th>
											<th className="px-3 py-2 text-right font-medium text-[#737373]">
												Amount
											</th>
											<th className="px-3 py-2 text-left font-medium text-[#737373]">
												Due Date
											</th>
											<th className="px-3 py-2 text-left font-medium text-[#737373]">
												Paid At
											</th>
											<th className="px-3 py-2 text-left font-medium text-[#737373]">
												Status
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-[#e5e5e5]">
										{rows.map((inst) => {
											const rescheduled = !!inst.originalDueDate;
											return (
												<tr key={inst.id} className="hover:bg-[#fafafa]">
													<td className="px-3 py-2 font-medium tabular-nums">
														{inst.installmentNumber}
													</td>
													<td className="px-3 py-2 text-right tabular-nums">
														{formatPrice(
															(inst.amount ?? 0) + (inst.taxAmount ?? 0),
															"MYR",
														)}
													</td>
													<td className="px-3 py-2">
														{rescheduled ? (
															<div className="flex flex-col">
																<span className="text-[11px] text-[#a3a3a3] line-through">
																	{fmtDate(inst.originalDueDate)}
																</span>
																<span className="text-[#0a0a0a]">
																	{fmtDate(inst.dueDate)}
																	<span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[9px] font-semibold uppercase text-amber-700">
																		Rescheduled
																	</span>
																</span>
															</div>
														) : (
															fmtDate(inst.dueDate)
														)}
													</td>
													<td className="px-3 py-2">{fmtDate(inst.paidAt)}</td>
													<td className="px-3 py-2">
														<span
															className={cn(
																"rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
																STATUS_STYLES[inst.status] ??
																	"bg-neutral-100 text-neutral-600",
															)}
														>
															{inst.status}
														</span>
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}

						{/* Package admin actions — shown only when canManage and pkgState loaded */}
						{canManage && pkgState && (
							<div className="mt-5 rounded-xl border border-[#e5e5e5] bg-[#fafafa] p-4">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-3">
									ADMIN ACTIONS
								</p>

								{/* Credits summary */}
								<div className="mb-3 grid grid-cols-3 gap-2 text-xs">
									<div>
										<span className="block text-[#737373]">Credits Total</span>
										<span className="font-semibold text-[#0a0a0a]">
											{pkgState.creditsTotal}
										</span>
									</div>
									<div>
										<span className="block text-[#737373]">Unlocked</span>
										<span className="font-semibold text-[#0a0a0a]">
											{pkgState.creditsUnlocked ?? pkgState.creditsTotal}
										</span>
									</div>
									<div>
										<span className="block text-[#737373]">Used</span>
										<span className="font-semibold text-[#0a0a0a]">
											{pkgState.creditsUsed}
										</span>
									</div>
								</div>

								<div className="flex flex-wrap gap-2">
									{/* Unlock — only when locked */}
									{pkgState.isLocked && (
										<button
											type="button"
											data-testid="pkg-action-unlock"
											onClick={() => setShowUnlock(true)}
											className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
										>
											<span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
											Unlock Package
										</button>
									)}

									{/* Adjust Credits */}
									<button
										type="button"
										data-testid="pkg-action-adjust-credits"
										onClick={() => setShowAdjust(true)}
										className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
									>
										Adjust Credits
									</button>

									{/* Refund */}
									<button
										type="button"
										data-testid="pkg-action-refund"
										onClick={() => setShowRefund(true)}
										className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3]"
									>
										Refund
									</button>

									{/* Overdraft toggle */}
									<OverdraftToggle
										organizationId={organizationId}
										packageInstanceId={target?.packageInstanceId ?? ""}
										purchaseNumber={target?.purchaseNumber ?? null}
										customerName={target?.customerName ?? null}
										allowCreditOverdraft={pkgState.allowCreditOverdraft}
									/>
								</div>

								{pkgState.isLocked && pkgState.lockedReason && (
									<p className="mt-2 text-[11px] text-rose-600">
										Locked reason: {pkgState.lockedReason}
									</p>
								)}

								{/* Auto-charge status + setup — Phase E2 */}
								{(pkgState.installmentsTotal ?? 1) > 1 && (
									<div className="mt-4 rounded-lg border border-[#e5e5e5] bg-white p-3">
										<div className="flex items-center justify-between gap-3">
											<div className="flex items-center gap-2">
												<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
													AUTO-CHARGE
												</p>
												{pkgState.autoChargeEnabled ? (
													<span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
														On
													</span>
												) : (
													<span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-500">
														Off
													</span>
												)}
											</div>

											{!pkgState.autoChargeEnabled && canManage && (
												<button
													type="button"
													data-testid="installment-autocharge-setup"
													disabled={
														setupAutoCharge.isPending ||
														!target?.packageInstanceId
													}
													onClick={() => setupAutoCharge.mutate()}
													className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
												>
													{setupAutoCharge.isPending
														? "Redirecting…"
														: "Enable auto-charge (save card)"}
												</button>
											)}
										</div>

										{pkgState.autoChargeEnabled && pkgState.stripeCustomerId && (
											<p className="mt-1.5 text-[11px] text-[#737373]">
												Card on file — next due installment will be charged
												automatically overnight.
											</p>
										)}

										{setupAutoCharge.isError && (
											<p className="mt-1.5 text-[11px] text-rose-600">
												{setupAutoCharge.error instanceof Error
													? setupAutoCharge.error.message
													: "Could not open setup page"}
											</p>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>

			{/* Sub-dialogs — shown over the schedule dialog */}
			{target && (
				<>
					<RefundPackageDialog
						organizationId={organizationId}
						target={
							showRefund
								? {
										packageInstanceId: target.packageInstanceId,
										purchaseNumber: target.purchaseNumber,
										customerName: target.customerName,
									}
								: null
						}
						onClose={() => setShowRefund(false)}
					/>
					<AdjustCreditsDialog
						organizationId={organizationId}
						target={
							showAdjust
								? {
										packageInstanceId: target.packageInstanceId,
										purchaseNumber: target.purchaseNumber,
										customerName: target.customerName,
									}
								: null
						}
						onClose={() => setShowAdjust(false)}
					/>
					<UnlockPackageDialog
						organizationId={organizationId}
						target={
							showUnlock
								? {
										packageInstanceId: target.packageInstanceId,
										purchaseNumber: target.purchaseNumber,
										customerName: target.customerName,
										lockedReason: pkgState?.lockedReason ?? null,
									}
								: null
						}
						onClose={() => setShowUnlock(false)}
					/>
				</>
			)}
		</>
	);
}
