import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { CreditCard, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { CopyableCell } from "@/components/tables/copyable-cell";
import DataTable from "@/components/tables/sales/view/data-table";
import { Badge } from "@/components/ui/badge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { requirePermission } from "@/lib/route-guards";
import { client } from "@/utils/orpc";

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
			<Badge className="border-yellow-200 bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
				Overdue
			</Badge>
		);
	}
	return (
		<Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
			Active
		</Badge>
	);
}

function InstallmentStatusBadge({ status }: { status: string }) {
	if (status === "paid") {
		return (
			<Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
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

	// ── Filter state ─────────────────────────────────────────────────────────────
	const [searchQuery, setSearchQuery] = useState("");
	const [dueBefore, setDueBefore] = useState<string | undefined>(undefined);
	const [dueAfter, setDueAfter] = useState<string | undefined>(undefined);
	const [planCode, setPlanCode] = useState<string | undefined>(undefined);
	const debouncedSearch = useDebounce(searchQuery, 300);

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

	// ── Data queries ─────────────────────────────────────────────────────────────

	const { data: plans } = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async () => {
			if (!organizationId) return [];
			return (client as any).installmentPlans.list({
				organizationId,
				activeOnly: true,
			});
		},
		enabled: !!organizationId,
	});
	const plansMap = useMemo(
		() =>
			new Map<string, { code: string; name: string; numInstallments: number }>(
				(plans ?? []).map((p: any) => [p.code as string, p]),
			),
		[plans],
	);

	const { data: overviewData, isLoading } = useQuery({
		queryKey: [
			"installments-overview",
			organizationId,
			statusFilter,
			debouncedSearch,
			dueBefore,
			dueAfter,
			planCode,
		],
		queryFn: async () => {
			if (!organizationId) return { items: [], total: 0 };
			return (client as any).installments.adminOverview({
				organizationId,
				status: statusFilter,
				limit: 50,
				offset: 0,
				search: debouncedSearch || undefined,
				dueBefore: dueBefore ? new Date(dueBefore).toISOString() : undefined,
				dueAfter: dueAfter ? new Date(dueAfter).toISOString() : undefined,
				paymentPlanCode: planCode,
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
		enabled:
			showRefundDialog &&
			!!selectedInstance?.id &&
			!!userContext?.currentOrganizationId,
	});

	// Note: refund amount is now managed by RequestRefundDialog via suggestedAmountCents prop

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

	/**
	 * Note: installments.processRefund is deprecated in favour of the new refunds
	 * workflow (request → approve → process). The UI now opens RequestRefundDialog
	 * which calls refunds.request to create a Pending row for review.
	 */

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
	}

	// Handler: open the request-refund dialog when user clicks "Request Refund" in the sheet
	const handleOpenRefundDialog = useCallback(() => {
		setShowRefundDialog(true);
	}, []);

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
			cell: ({ row }) => {
				const code = row.original.paymentPlanType;
				const label = code
					? (plansMap.get(code)?.name ??
						String(code)
							.replace(/_/g, " ")
							.replace(/\b\w/g, (c: string) => c.toUpperCase()))
					: "—";
				return <Badge variant="outline">{label}</Badge>;
			},
		},
		{
			id: "credits",
			header: "Credits",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
					{row.original.creditsUnlocked ?? 0} unlocked /{" "}
					{row.original.creditsTotal ?? 0} total
				</span>
			),
		},
		{
			id: "progress",
			header: "Progress",
			cell: ({ row }) => (
				<span className="text-sm tabular-nums">
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
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view installment packages.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-r-transparent">
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
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
						<CreditCard className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="font-bold font-heading text-2xl">
							Installment Packages
						</h1>
						<p className="text-muted-foreground text-sm">
							Manage installment payment plans for package instances.
						</p>
					</div>
				</div>
			</div>

			{/* Filter row */}
			<div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
				<div className="flex min-w-[200px] flex-1 flex-col gap-1">
					<label className="font-medium text-muted-foreground text-xs">
						Search
					</label>
					<Input
						placeholder="Search client ID or purchase number"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label className="font-medium text-muted-foreground text-xs">
						Due After
					</label>
					<Input
						type="date"
						value={dueAfter ?? ""}
						onChange={(e) => setDueAfter(e.target.value || undefined)}
						className="w-40"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<label className="font-medium text-muted-foreground text-xs">
						Due Before
					</label>
					<Input
						type="date"
						value={dueBefore ?? ""}
						onChange={(e) => setDueBefore(e.target.value || undefined)}
						className="w-40"
					/>
				</div>

				<div className="flex min-w-[160px] flex-col gap-1">
					<label className="font-medium text-muted-foreground text-xs">
						Plan
					</label>
					<Select
						value={planCode ?? "__all__"}
						onValueChange={(v) => setPlanCode(v === "__all__" ? undefined : v)}
					>
						<SelectTrigger>
							<SelectValue placeholder="All plans" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__all__">All plans</SelectItem>
							{(plans ?? []).map((p: any) => (
								<SelectItem key={p.code} value={p.code}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Button
					variant="ghost"
					size="sm"
					className="gap-1.5 self-end"
					onClick={() => {
						setSearchQuery("");
						setDueBefore(undefined);
						setDueAfter(undefined);
						setPlanCode(undefined);
					}}
				>
					<X className="h-3.5 w-3.5" />
					Clear
				</Button>
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
							className={`border-b-2 px-4 py-2 font-medium text-sm transition-colors ${
								isActive
									? "border-primary text-primary"
									: "border-transparent text-muted-foreground hover:border-muted hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>

			{/* Table */}
			<DataTable<any, unknown> columns={columns} data={instances} />

			{/* ── Detail Sheet ─────────────────────────────────────────────────────── */}
			<Sheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
				}}
			>
				<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
					<SheetHeader>
						<SheetTitle>Installment Package Detail</SheetTitle>
						<SheetDescription>
							Review installments and take actions for this package instance.
						</SheetDescription>
					</SheetHeader>

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
											</p>
										</div>
									)}
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
												{installments.map((inst: any) => (
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
															) : (
																<Button
																	size="sm"
																	variant="outline"
																	onClick={() => setConfirmInstallment(inst)}
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
									className="border-destructive/40 text-destructive hover:bg-destructive/5"
									onClick={handleOpenRefundDialog}
								>
									Request Refund
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
									? Number.parseInt(nextIntervalDays, 10) || undefined
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
							{manualUnlockMutation.isPending ? "Unlocking…" : "Unlock Package"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ── Request Refund Dialog (replaces deprecated installments.processRefund UI) ── */}
			{organizationId && selectedInstance && (
				<RequestRefundDialog
					open={showRefundDialog}
					onOpenChange={setShowRefundDialog}
					organizationId={organizationId}
					packageInstanceId={selectedInstance.id}
					suggestedAmountCents={
						suggestRefundQuery.data
							? (suggestRefundQuery.data as any).suggestedRefund
							: undefined
					}
				/>
			)}
		</div>
	);
}
