import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
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
			<DialogContent className="overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Installment Package Detail</DialogTitle>
					<DialogDescription>
						Review installments and take actions for this package instance.
					</DialogDescription>
				</DialogHeader>

				{selectedInstance && (
					<div className="flex flex-col gap-6 px-1 py-4">
						{/* Package summary */}
						<div className="space-y-3 rounded-lg border p-4">
							<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Package Info
							</h3>
							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<span className="text-muted-foreground">Plan Type</span>
									<p className="mt-0.5 font-medium">
										{selectedInstance.paymentPlanType
											? String(selectedInstance.paymentPlanType)
													.replace(/_/g, " ")
													.replace(/\b\w/g, (c: string) => c.toUpperCase())
											: "—"}
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">Status</span>
									<p className="mt-0.5">
										<StatusBadge instance={selectedInstance} />
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">Credits</span>
									<p className="mt-0.5 font-medium">
										{selectedInstance.creditsUnlocked ?? 0} unlocked,{" "}
										{selectedInstance.creditsUsed ?? 0} used,{" "}
										{selectedInstance.creditsRemaining ?? 0} available
									</p>
								</div>
								<div>
									<span className="text-muted-foreground">Progress</span>
									<p className="mt-0.5 font-medium">
										{selectedInstance.installmentsPaid ?? 0} of{" "}
										{selectedInstance.installmentsTotal ?? 0} paid
									</p>
								</div>
								{selectedInstance.nextDueDate && (
									<div>
										<span className="text-muted-foreground">Next Due</span>
										<p className="mt-0.5 font-medium">
											{formatDate(selectedInstance.nextDueDate)}
											{(selectedInstance as { nextInstallmentAmount?: number | null }).nextInstallmentAmount != null &&
												` (${formatPrice((selectedInstance as { nextInstallmentAmount?: number | null }).nextInstallmentAmount as number, "MYR")})`}
										</p>
									</div>
								)}
								{(selectedInstance as { gracePeriodEndsAt?: string | Date | null }).gracePeriodEndsAt && (
									<div>
										<span className="text-muted-foreground">Grace Period Ends</span>
										<p className="mt-0.5 font-medium text-amber-700">
											{formatDate((selectedInstance as { gracePeriodEndsAt?: string | Date | null }).gracePeriodEndsAt)}
											{" "}
											<span className="text-xs text-muted-foreground">
												({daysFromNow((selectedInstance as { gracePeriodEndsAt?: string | Date | null }).gracePeriodEndsAt as Date | string)} days remaining)
											</span>
										</p>
									</div>
								)}
								<div>
									<span className="text-muted-foreground">Overdraft</span>
									<p className="mt-0.5 font-medium">
										{(selectedInstance as { allowCreditOverdraft?: boolean }).allowCreditOverdraft ? (
											<span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
												On
											</span>
										) : (
											<span className="text-muted-foreground text-xs">Off</span>
										)}
									</p>
								</div>
								{selectedInstance.isLocked && (
									<div className="col-span-2">
										<span className="text-muted-foreground">Lock Reason</span>
										<p className="mt-0.5 font-medium text-destructive">
											{selectedInstance.lockedReason ?? "—"}
										</p>
									</div>
								)}
							</div>
						</div>

						{/* Step progress */}
						<div className="space-y-1.5">
							<div className="flex items-center gap-1">
								{Array.from({ length: selectedInstance.installmentsTotal ?? 0 }).map((_, i) => {
									const paid = i < (selectedInstance.installmentsPaid ?? 0);
									return (
										<div
											key={i}
											className={`h-2 flex-1 rounded-full transition-colors ${paid ? "bg-primary" : "bg-muted"}`}
										/>
									);
								})}
							</div>
							<p className="text-xs text-muted-foreground">
								{selectedInstance.installmentsPaid ?? 0} of {selectedInstance.installmentsTotal ?? 0} installments paid
							</p>
						</div>

						{/* Installment timeline */}
						<div className="space-y-3">
							<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Installments
							</h3>
							{installments.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No installments found.
								</p>
							) : (
								<div className="overflow-hidden rounded-lg border">
									<table className="w-full text-sm">
										<thead className="bg-muted/50">
											<tr>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													#
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													Amount
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													Due Date
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													Paid At
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													Status
												</th>
												<th className="px-3 py-2 text-left font-medium text-muted-foreground">
													Action
												</th>
											</tr>
										</thead>
										<tbody className="divide-y">
											{installments.map((inst) => (
												<tr key={inst.id} className="hover:bg-muted/30">
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
															<span className="font-medium text-muted-foreground text-xs">
																Waived
															</span>
														) : inst.status === "cancelled" ? (
															<span className="font-medium text-muted-foreground text-xs">
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
																{(inst.status === "pending" || inst.status === "overdue") && (
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
																			className="border-destructive/40 text-destructive hover:bg-destructive/5"
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

						<Separator />

						{/* Action buttons */}
						<div className="flex flex-wrap gap-3">
							{selectedInstance.isLocked && (
								<Button
									variant="outline"
									onClick={onOpenUnlockDialog}
								>
									Manual Unlock
								</Button>
							)}
							<Button
								variant="outline"
								onClick={onOpenOverdraftDialog}
							>
								{(selectedInstance as { allowCreditOverdraft?: boolean }).allowCreditOverdraft
									? "Disable Overdraft"
									: "Allow Overdraft"}
							</Button>
							<Button
								variant="outline"
								onClick={onOpenAdjustCreditsDialog}
							>
								Adjust Credits
							</Button>
							<Button
								variant="outline"
								className="border-destructive/40 text-destructive hover:bg-destructive/5"
								onClick={onOpenRefundDialog}
							>
								Request Refund
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
