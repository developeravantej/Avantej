import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { formatPrice } from "@/lib/money";
import type { Installment, InstallmentOverviewItem } from "../types";
import { formatDate, daysFromNow } from "../utils";
import { StatusBadge, InstallmentStatusBadge } from "./status-badges";

interface PackageDetailDialogProps {
	open: boolean;
	selectedInstance: InstallmentOverviewItem | null;
	installments: Installment[];
	onClose: () => void;
	onConfirmInstallment: (inst: Installment) => void;
	onReschedule: (inst: Installment) => void;
	onWaive: (inst: Installment) => void;
	onOpenUnlockDialog: () => void;
	onOpenOverdraftDialog: () => void;
	onOpenAdjustCreditsDialog: () => void;
	onOpenRefundDialog: () => void;
}

export function PackageDetailDialog({
	open,
	selectedInstance,
	installments,
	onClose,
	onConfirmInstallment,
	onReschedule,
	onWaive,
	onOpenUnlockDialog,
	onOpenOverdraftDialog,
	onOpenAdjustCreditsDialog,
	onOpenRefundDialog,
}: PackageDetailDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						INSTALLMENT PLANS
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						Installment Package Detail
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						Review installments and take actions for this package instance.
					</DialogDescription>
				</DialogHeader>

				{selectedInstance && (
					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="flex flex-col gap-6 py-4">
							{/* Package summary */}
							<div className="space-y-3 rounded-lg border border-[#e5e5e5] p-4">
								<h3 className="font-semibold text-[#737373] text-sm uppercase tracking-wide">
									Package Info
								</h3>
								<div className="grid grid-cols-2 gap-3 text-sm">
									<div>
										<span className="text-[#737373]">Plan Type</span>
										<p className="mt-0.5 font-medium">
											{selectedInstance.paymentPlanType
												? String(selectedInstance.paymentPlanType)
														.replace(/_/g, " ")
														.replace(/\b\w/g, (c: string) => c.toUpperCase())
												: "—"}
										</p>
									</div>
									<div>
										<span className="text-[#737373]">Status</span>
										<p className="mt-0.5">
											<StatusBadge instance={selectedInstance} />
										</p>
									</div>
									<div>
										<span className="text-[#737373]">Credits</span>
										<p className="mt-0.5 font-medium">
											{selectedInstance.creditsUnlocked ?? 0} unlocked,{" "}
											{selectedInstance.creditsUsed ?? 0} used,{" "}
											{selectedInstance.creditsRemaining ?? 0} available
										</p>
									</div>
									<div>
										<span className="text-[#737373]">Progress</span>
										<p className="mt-0.5 font-medium">
											{selectedInstance.installmentsPaid ?? 0} of{" "}
											{selectedInstance.installmentsTotal ?? 0} paid
										</p>
									</div>
									{selectedInstance.nextDueDate && (
										<div>
											<span className="text-[#737373]">Next Due</span>
											<p className="mt-0.5 font-medium">
												{formatDate(selectedInstance.nextDueDate)}
												{(
													selectedInstance as {
														nextInstallmentAmount?: number | null;
													}
												).nextInstallmentAmount != null &&
													` (${formatPrice((selectedInstance as { nextInstallmentAmount?: number | null }).nextInstallmentAmount as number, "MYR")})`}
											</p>
										</div>
									)}
									{(
										selectedInstance as {
											gracePeriodEndsAt?: string | Date | null;
										}
									).gracePeriodEndsAt && (
										<div>
											<span className="text-[#737373]">Grace Period Ends</span>
											<p className="mt-0.5 font-medium text-amber-700">
												{formatDate(
													(
														selectedInstance as {
															gracePeriodEndsAt?: string | Date | null;
														}
													).gracePeriodEndsAt,
												)}{" "}
												<span className="text-xs text-[#737373]">
													(
													{daysFromNow(
														(
															selectedInstance as {
																gracePeriodEndsAt?: string | Date | null;
															}
														).gracePeriodEndsAt as Date | string,
													)}{" "}
													days remaining)
												</span>
											</p>
										</div>
									)}
									<div>
										<span className="text-[#737373]">Overdraft</span>
										<p className="mt-0.5 font-medium">
											{(selectedInstance as { allowCreditOverdraft?: boolean })
												.allowCreditOverdraft ? (
												<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
													On
												</span>
											) : (
												<span className="text-[#737373] text-xs">Off</span>
											)}
										</p>
									</div>
									{selectedInstance.isLocked && (
										<div className="col-span-2">
											<span className="text-[#737373]">Lock Reason</span>
											<p className="mt-0.5 font-medium text-rose-600">
												{selectedInstance.lockedReason ?? "—"}
											</p>
										</div>
									)}
								</div>
							</div>

							{/* Step progress */}
							<div className="space-y-1.5">
								<div className="flex items-center gap-1">
									{Array.from({
										length: selectedInstance.installmentsTotal ?? 0,
									}).map((_, i) => {
										const paid = i < (selectedInstance.installmentsPaid ?? 0);
										return (
											<div
												key={i}
												className={`h-2 flex-1 rounded-full transition-colors ${paid ? "bg-primary" : "bg-[#f3f3f3]"}`}
											/>
										);
									})}
								</div>
								<p className="text-xs text-[#737373]">
									{selectedInstance.installmentsPaid ?? 0} of{" "}
									{selectedInstance.installmentsTotal ?? 0} installments paid
								</p>
							</div>

							{/* Installment timeline */}
							<div className="space-y-3">
								<h3 className="font-semibold text-[#737373] text-sm uppercase tracking-wide">
									Installments
								</h3>
								{installments.length === 0 ? (
									<p className="text-[#737373] text-sm">
										No installments found.
									</p>
								) : (
									<div className="overflow-hidden rounded-lg border border-[#e5e5e5]">
										<table className="w-full text-sm">
											<thead className="bg-[#f3f3f3]/50">
												<tr>
													<th className="px-3 py-2 text-left font-medium text-[#737373]">
														#
													</th>
													<th className="px-3 py-2 text-left font-medium text-[#737373]">
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
													<th className="px-3 py-2 text-left font-medium text-[#737373]">
														Action
													</th>
												</tr>
											</thead>
											<tbody className="divide-y">
												{installments.map((inst) => (
													<tr key={inst.id} className="hover:bg-[#f3f3f3]">
														<td className="px-3 py-2 font-medium tabular-nums">
															{inst.installmentNumber}
														</td>
														<td className="px-3 py-2 tabular-nums">
															{formatPrice(inst.amount ?? 0, "MYR")}
														</td>
														<td className="px-3 py-2">
															{formatDate(inst.dueDate)}
														</td>
														<td className="px-3 py-2">
															{inst.paidAt ? formatDate(inst.paidAt) : "—"}
														</td>
														<td className="px-3 py-2">
															<InstallmentStatusBadge status={inst.status} />
														</td>
														<td className="px-3 py-2">
															{inst.status === "paid" ? (
																<span className="font-medium text-green-700 text-xs">
																	Paid ✓{" "}
																	{inst.paidAt ? formatDate(inst.paidAt) : ""}
																</span>
															) : inst.status === "waived" ? (
																<span className="font-medium text-[#737373] text-xs">
																	Waived
																</span>
															) : inst.status === "cancelled" ? (
																<span className="font-medium text-[#737373] text-xs">
																	Cancelled
																</span>
															) : (
																<div className="flex flex-wrap items-center gap-1.5">
																	<Button
																		size="sm"
																		variant="outline"
																		onClick={() => onConfirmInstallment(inst)}
																	>
																		Confirm Payment
																	</Button>
																	{(inst.status === "pending" ||
																		inst.status === "overdue") && (
																		<>
																			<Button
																				size="sm"
																				variant="outline"
																				onClick={() => onReschedule(inst)}
																			>
																				Reschedule
																			</Button>
																			<Button
																				size="sm"
																				variant="outline"
																				className="border-[#e5e5e5] text-rose-600 hover:bg-rose-50"
																				onClick={() => onWaive(inst)}
																			>
																				Waive
																			</Button>
																		</>
																	)}
																</div>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</div>

							{/* Action buttons */}
							<div className="flex flex-wrap gap-3">
								{selectedInstance.isLocked && (
									<Button variant="outline" onClick={onOpenUnlockDialog}>
										Manual Unlock
									</Button>
								)}
								<Button variant="outline" onClick={onOpenOverdraftDialog}>
									{(selectedInstance as { allowCreditOverdraft?: boolean })
										.allowCreditOverdraft
										? "Disable Overdraft"
										: "Allow Overdraft"}
								</Button>
								<Button variant="outline" onClick={onOpenAdjustCreditsDialog}>
									Adjust Credits
								</Button>
								<Button
									variant="outline"
									className="border-[#e5e5e5] text-rose-600 hover:bg-rose-50"
									onClick={onOpenRefundDialog}
								>
									Request Refund
								</Button>
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
