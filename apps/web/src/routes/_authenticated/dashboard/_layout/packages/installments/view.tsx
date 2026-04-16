import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
} from "@/components/ui/sheet";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import DataTable from "@/components/tables/sales/view/data-table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { CreditCard } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/installments/view",
)({
	beforeLoad: async () => {
		await requirePermission("service_management:read");
	},
	component: InstallmentsViewPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string | number | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function getInstanceStatus(instance: any): "Active" | "Overdue" | "Locked" {
	if (instance.isLocked) return "Locked";
	if (instance.gracePeriodEndsAt) return "Overdue";
	return "Active";
}

function StatusBadge({ instance }: { instance: any }) {
	const status = getInstanceStatus(instance);
	if (status === "Locked") {
		return <Badge variant="destructive">Locked</Badge>;
	}
	if (status === "Overdue") {
		return (
			<Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100">
				Overdue
			</Badge>
		);
	}
	return (
		<Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
			Active
		</Badge>
	);
}

function InstallmentStatusBadge({ status }: { status: string }) {
	if (status === "paid") {
		return (
			<Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
				Paid
			</Badge>
		);
	}
	if (status === "overdue") {
		return <Badge variant="destructive">Overdue</Badge>;
	}
	return <Badge variant="outline">Pending</Badge>;
}

// ── Main component ─────────────────────────────────────────────────────────────

function InstallmentsViewPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// ── List state ──────────────────────────────────────────────────────────────
	const [statusFilter, setStatusFilter] = useState<
		"active" | "overdue" | "locked" | undefined
	>(undefined);

	// ── Sheet / detail state ─────────────────────────────────────────────────────
	const [selectedInstance, setSelectedInstance] = useState<any>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// ── Dialog states ────────────────────────────────────────────────────────────
	const [confirmInstallment, setConfirmInstallment] = useState<any>(null);
	const [showUnlockDialog, setShowUnlockDialog] = useState(false);
	const [showRefundDialog, setShowRefundDialog] = useState(false);

	// ── Form state ───────────────────────────────────────────────────────────────
	const [paymentMethod, setPaymentMethod] = useState<
		"manual_transfer" | "cash"
	>("manual_transfer");
	const [notes, setNotes] = useState("");
	const [nextIntervalDays, setNextIntervalDays] = useState("");
	const [unlockReason, setUnlockReason] = useState("");
	const [refundAmount, setRefundAmount] = useState("");
	const [refundReason, setRefundReason] = useState("");

	// ── Data queries ─────────────────────────────────────────────────────────────

	const { data: overviewData, isLoading } = useQuery({
		queryKey: ["installments-overview", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return { items: [], total: 0 };
			return (client as any).installments.adminOverview({
				organizationId,
				status: statusFilter,
				limit: 50,
				offset: 0,
			});
		},
		enabled: !!organizationId,
	});

	const instances: any[] = overviewData?.items ?? [];

	const { data: installments = [] } = useQuery({
		queryKey: [
			"installments-by-instance",
			organizationId,
			selectedInstance?.id,
		],
		queryFn: async () => {
			if (!organizationId || !selectedInstance?.id) return [];
			return (client as any).installments.listByPackageInstance({
				organizationId,
				packageInstanceId: selectedInstance.id,
			});
		},
		enabled: !!organizationId && !!selectedInstance?.id,
	});

	// Fetch suggested refund when the refund dialog opens
	const suggestRefundQuery = useQuery({
		queryKey: ["installments", "suggestRefund", selectedInstance?.id],
		queryFn: () =>
			(client as any).installments.suggestRefund({
				organizationId: userContext?.currentOrganizationId ?? "",
				packageInstanceId: selectedInstance?.id ?? "",
			}),
		enabled: showRefundDialog && !!selectedInstance?.id && !!userContext?.currentOrganizationId,
	});

	// Auto-populate refund amount from suggestion when dialog opens
	useEffect(() => {
		if (suggestRefundQuery.data && showRefundDialog && refundAmount === "") {
			const suggested = (suggestRefundQuery.data as any).suggestedRefund;
			if (suggested > 0) {
				setRefundAmount((suggested / 100).toFixed(2));
			}
		}
	}, [suggestRefundQuery.data, showRefundDialog]);

	// ── Mutations ────────────────────────────────────────────────────────────────

	const confirmPaymentMutation = useMutation({
		mutationFn: (vars: {
			installmentId: string;
			paymentMethod: string;
			notes?: string;
			nextIntervalDays?: number;
		}) =>
			(client as any).installments.confirmPayment({
				organizationId,
				installmentId: vars.installmentId,
				paymentMethod: vars.paymentMethod,
				notes: vars.notes || undefined,
				nextIntervalDays: vars.nextIntervalDays,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["installments-overview", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: [
					"installments-by-instance",
					organizationId,
					selectedInstance?.id,
				],
			});
			toast.success("Payment confirmed successfully.");
			setConfirmInstallment(null);
			resetConfirmForm();
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to confirm payment."),
	});

	const manualUnlockMutation = useMutation({
		mutationFn: (vars: { packageInstanceId: string; reason: string }) =>
			(client as any).installments.manualUnlock({
				organizationId,
				packageInstanceId: vars.packageInstanceId,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["installments-overview", organizationId],
			});
			queryClient.invalidateQueries({
				queryKey: [
					"installments-by-instance",
					organizationId,
					selectedInstance?.id,
				],
			});
			toast.success("Package unlocked successfully.");
			setShowUnlockDialog(false);
			setUnlockReason("");
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to unlock package."),
	});

	const processRefundMutation = useMutation({
		mutationFn: (vars: {
			packageInstanceId: string;
			amount: number;
			reason: string;
		}) =>
			(client as any).installments.processRefund({
				organizationId,
				packageInstanceId: vars.packageInstanceId,
				amount: vars.amount,
				reason: vars.reason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["installments-overview", organizationId],
			});
			toast.success("Refund processed successfully.");
			setShowRefundDialog(false);
			setRefundAmount("");
			setRefundReason("");
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to process refund."),
	});

	// ── Form reset helpers ────────────────────────────────────────────────────────

	function resetConfirmForm() {
		setPaymentMethod("manual_transfer");
		setNotes("");
		setNextIntervalDays("");
	}

	function openSheet(instance: any) {
		setSelectedInstance(instance);
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setSelectedInstance(null);
		setShowUnlockDialog(false);
		setShowRefundDialog(false);
		setConfirmInstallment(null);
		resetConfirmForm();
		setUnlockReason("");
		setRefundAmount("");
		setRefundReason("");
	}

	// ── Status filter tabs ────────────────────────────────────────────────────────

	const STATUS_TABS = [
		{ value: undefined, label: "All" },
		{ value: "active" as const, label: "Active" },
		{ value: "overdue" as const, label: "Overdue" },
		{ value: "locked" as const, label: "Locked" },
	];

	// ── Table columns ─────────────────────────────────────────────────────────────

	const columns: ColumnDef<any>[] = [
		{
			id: "clientId",
			header: "Client ID",
			cell: ({ row }) => (
				<CopyableCell
					value={row.original.clientId}
					displayText={`${row.original.clientId.slice(0, 8)}…`}
				/>
			),
		},
		{
			id: "planType",
			header: "Plan Type",
			cell: ({ row }) => (
				<Badge variant="outline">
					{row.original.paymentPlanType
						? String(row.original.paymentPlanType)
								.replace(/_/g, " ")
								.replace(/\b\w/g, (c: string) => c.toUpperCase())
						: "—"}
				</Badge>
			),
		},
		{
			id: "credits",
			header: "Credits",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm">
					{row.original.creditsUnlocked ?? 0} unlocked /{" "}
					{row.original.creditsTotal ?? 0} total
				</span>
			),
		},
		{
			id: "progress",
			header: "Progress",
			cell: ({ row }) => (
				<span className="tabular-nums text-sm">
					{row.original.installmentsPaid ?? 0} of{" "}
					{row.original.installmentsTotal ?? 0}
				</span>
			),
		},
		{
			id: "nextDueDate",
			header: "Next Due Date",
			cell: ({ row }) => formatDate(row.original.nextDueDate),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge instance={row.original} />,
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => (
				<Button
					size="sm"
					variant="outline"
					onClick={(e) => {
						e.stopPropagation();
						openSheet(row.original);
					}}
				>
					View
				</Button>
			),
		},
	];

	// ── Guard ─────────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view installment packages.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex items-center justify-center min-h-96">
				<div className="animate-spin h-8 w-8 border-2 border-current border-r-transparent rounded-full">
					<span className="sr-only">Loading…</span>
				</div>
			</div>
		);
	}

	// ── Computed values for detail sheet ─────────────────────────────────────────

	const totalPaidCents: number = installments
		.filter((i: any) => i.status === "paid")
		.reduce((sum: number, i: any) => sum + (i.amount ?? 0), 0);

	// ── Render ────────────────────────────────────────────────────────────────────

	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<CreditCard className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-2xl font-bold font-heading">
							Installment Packages
						</h1>
						<p className="text-sm text-muted-foreground">
							Manage installment payment plans for package instances.
						</p>
					</div>
				</div>
			</div>

			{/* Status filter tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = statusFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Table */}
			<DataTable<any, unknown>
				columns={columns}
				data={instances}
			/>

			{/* ── Detail Sheet ─────────────────────────────────────────────────────── */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
				}}
			>
				<SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Installment Package Detail</SheetTitle>
						<SheetDescription>
							Review installments and take actions for this package instance.
						</SheetDescription>
					</SheetHeader>

					{selectedInstance && (
						<div className="flex flex-col gap-6 px-1 py-4">
							{/* Package summary */}
							<div className="rounded-lg border p-4 space-y-3">
								<h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
									Package Info
								</h3>
								<div className="grid grid-cols-2 gap-3 text-sm">
									<div>
										<span className="text-muted-foreground">Plan Type</span>
										<p className="font-medium mt-0.5">
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
										<p className="font-medium mt-0.5">
											{selectedInstance.creditsUnlocked ?? 0} unlocked,{" "}
											{selectedInstance.creditsUsed ?? 0} used,{" "}
											{selectedInstance.creditsRemaining ?? 0} available
										</p>
									</div>
									<div>
										<span className="text-muted-foreground">Progress</span>
										<p className="font-medium mt-0.5">
											{selectedInstance.installmentsPaid ?? 0} of{" "}
											{selectedInstance.installmentsTotal ?? 0} paid
										</p>
									</div>
									{selectedInstance.nextDueDate && (
										<div>
											<span className="text-muted-foreground">Next Due</span>
											<p className="font-medium mt-0.5">
												{formatDate(selectedInstance.nextDueDate)}
											</p>
										</div>
									)}
									{selectedInstance.isLocked && (
										<div className="col-span-2">
											<span className="text-muted-foreground">Lock Reason</span>
											<p className="font-medium mt-0.5 text-destructive">
												{selectedInstance.lockedReason ?? "—"}
											</p>
										</div>
									)}
								</div>
							</div>

							{/* Installment timeline */}
							<div className="space-y-3">
								<h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
									Installments
								</h3>
								{installments.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No installments found.
									</p>
								) : (
									<div className="rounded-lg border overflow-hidden">
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
												{installments.map((inst: any) => (
													<tr key={inst.id} className="hover:bg-muted/30">
														<td className="px-3 py-2 tabular-nums font-medium">
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
																<span className="text-green-700 text-xs font-medium">
																	Paid ✓{" "}
																	{inst.paidAt
																		? formatDate(inst.paidAt)
																		: ""}
																</span>
															) : (
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() =>
																		setConfirmInstallment(inst)
																	}
																>
																	Confirm Payment
																</Button>
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
										onClick={() => setShowUnlockDialog(true)}
									>
										Manual Unlock
									</Button>
								)}
								<Button
									variant="outline"
									className="text-destructive border-destructive/40 hover:bg-destructive/5"
									onClick={() => {
										setRefundAmount(
											totalPaidCents > 0
												? (totalPaidCents / 100).toFixed(2)
												: ""
										);
										setShowRefundDialog(true);
									}}
								>
									Process Refund
								</Button>
							</div>
						</div>
					)}
				</SheetContent>
			</Sheet>

			{/* ── Confirm Payment Dialog ───────────────────────────────────────────── */}
			<Dialog
				open={!!confirmInstallment}
				onOpenChange={(open) => {
					if (!open) {
						setConfirmInstallment(null);
						resetConfirmForm();
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Confirm Payment</DialogTitle>
						<DialogDescription>
							{confirmInstallment && selectedInstance
								? `Confirm payment for Installment ${confirmInstallment.installmentNumber} of ${selectedInstance.installmentsTotal ?? "?"}.`
								: "Confirm this installment payment."}
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						{/* Payment method */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="payment-method">Payment Method</Label>
							<Select
								value={paymentMethod}
								onValueChange={(v) =>
									setPaymentMethod(v as "manual_transfer" | "cash")
								}
							>
								<SelectTrigger id="payment-method">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="manual_transfer">
										Manual Transfer
									</SelectItem>
									<SelectItem value="cash">Cash</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Notes */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="confirm-notes">Notes (optional)</Label>
							<Textarea
								id="confirm-notes"
								placeholder="Add any notes…"
								rows={2}
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
							/>
						</div>

						{/* Next interval days override */}
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="next-interval">
								Override Next Interval (days, optional)
							</Label>
							<Input
								id="next-interval"
								type="number"
								min="1"
								step="1"
								placeholder="e.g. 30"
								value={nextIntervalDays}
								onChange={(e) => setNextIntervalDays(e.target.value)}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setConfirmInstallment(null);
								resetConfirmForm();
							}}
							disabled={confirmPaymentMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!confirmInstallment) return;
								const intervalDays = nextIntervalDays
									? parseInt(nextIntervalDays, 10) || undefined
									: undefined;
								confirmPaymentMutation.mutate({
									installmentId: confirmInstallment.id,
									paymentMethod,
									notes: notes.trim() || undefined,
									nextIntervalDays: intervalDays,
								});
							}}
							disabled={confirmPaymentMutation.isPending}
						>
							{confirmPaymentMutation.isPending ? "Confirming…" : "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Manual Unlock Dialog ─────────────────────────────────────────────── */}
			<Dialog
				open={showUnlockDialog}
				onOpenChange={(open) => {
					if (!open) {
						setShowUnlockDialog(false);
						setUnlockReason("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Manual Unlock</DialogTitle>
						<DialogDescription>
							Manually unlock this package. A reason is required for audit
							purposes.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="unlock-reason">
								Reason <span className="text-destructive">*</span>
							</Label>
							<Textarea
								id="unlock-reason"
								placeholder="Provide a reason for manual unlock…"
								rows={3}
								value={unlockReason}
								onChange={(e) => setUnlockReason(e.target.value)}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowUnlockDialog(false);
								setUnlockReason("");
							}}
							disabled={manualUnlockMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!unlockReason.trim()) {
									toast.error("A reason is required to unlock the package.");
									return;
								}
								if (!selectedInstance) return;
								manualUnlockMutation.mutate({
									packageInstanceId: selectedInstance.id,
									reason: unlockReason.trim(),
								});
							}}
							disabled={manualUnlockMutation.isPending}
						>
							{manualUnlockMutation.isPending
								? "Unlocking…"
								: "Unlock Package"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Refund Dialog ────────────────────────────────────────────────────── */}
			<Dialog
				open={showRefundDialog}
				onOpenChange={(open) => {
					if (!open) {
						setShowRefundDialog(false);
						setRefundAmount("");
						setRefundReason("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Process Refund</DialogTitle>
						<DialogDescription>
							Enter the amount to refund and provide a reason.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						{/* Suggested refund breakdown */}
						{suggestRefundQuery.isLoading && (
							<div className="text-sm text-muted-foreground">
								Calculating suggested refund…
							</div>
						)}
						{suggestRefundQuery.data &&
							(() => {
								const s = suggestRefundQuery.data as any;
								return (
									<div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
										<div className="flex justify-between">
											<span className="text-muted-foreground">Customer paid</span>
											<span>{formatPrice(s.paidAmount / 100, "MYR")}</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Credits used</span>
											<span>
												{s.creditsUsed} of {s.creditsUnlocked} unlocked
											</span>
										</div>
										<div className="flex justify-between">
											<span className="text-muted-foreground">Unused value</span>
											<span>{formatPrice(s.unusedCreditValue / 100, "MYR")}</span>
										</div>
										<div className="flex justify-between font-medium">
											<span>Suggested refund</span>
											<span>{formatPrice(s.suggestedRefund / 100, "MYR")}</span>
										</div>
										<p className="text-xs text-muted-foreground pt-1">
											{s.reasoning}
										</p>
									</div>
								);
							})()}

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="refund-amount">
								Refund Amount (RM){" "}
								<span className="text-destructive">*</span>
							</Label>
							<Input
								id="refund-amount"
								type="number"
								min="0.01"
								step="0.01"
								placeholder="0.00"
								value={refundAmount}
								onChange={(e) => setRefundAmount(e.target.value)}
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="refund-reason">
								Reason <span className="text-destructive">*</span>
							</Label>
							<Textarea
								id="refund-reason"
								placeholder="Provide a reason for the refund…"
								rows={3}
								value={refundReason}
								onChange={(e) => setRefundReason(e.target.value)}
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowRefundDialog(false);
								setRefundAmount("");
								setRefundReason("");
							}}
							disabled={processRefundMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								if (!refundAmount || !refundReason.trim()) {
									toast.error("Amount and reason are required.");
									return;
								}
								const amountCents = Math.round(
									parseFloat(refundAmount) * 100
								);
								if (!Number.isFinite(amountCents) || amountCents <= 0) {
									toast.error("Please enter a valid refund amount.");
									return;
								}
								if (!selectedInstance) return;
								processRefundMutation.mutate({
									packageInstanceId: selectedInstance.id,
									amount: amountCents,
									reason: refundReason.trim(),
								});
							}}
							disabled={processRefundMutation.isPending}
						>
							{processRefundMutation.isPending
								? "Processing…"
								: "Confirm Refund"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
