import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronUp, CreditCard, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { RequestRefundDialog } from "@/components/refunds/request-refund-dialog";
import { CopyableCell } from "@/components/tables/copyable-cell";
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
import { Skeleton } from "@/components/ui/skeleton";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
import { client } from "@/utils/orpc";

// ── Inferred types ─────────────────────────────────────────────────────────────

type InstallmentOverviewItem = Awaited<
	ReturnType<typeof client.installments.adminOverview>
>["items"][number];

type InstallmentPlan = Awaited<
	ReturnType<typeof client.installmentPlans.list>
>[number];

type Installment = Awaited<
	ReturnType<typeof client.installments.listByPackageInstance>
>[number];

type SuggestRefundResult = Awaited<
	ReturnType<typeof client.installments.suggestRefund>
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: string | number | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function getInstanceStatus(
	instance: InstallmentOverviewItem,
): "Active" | "Overdue" | "Locked" {
	if (instance.isLocked) return "Locked";
	if (instance.gracePeriodEndsAt) return "Overdue";
	return "Active";
}

function StatusBadge({ instance }: { instance: InstallmentOverviewItem }) {
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

export function PackageInstallmentsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// ── List state ──────────────────────────────────────────────────────────────
	const [statusFilter, setStatusFilter] = useState<
		"active" | "overdue" | "locked" | "due_soon" | undefined
	>(undefined);

	// ── Filter state ─────────────────────────────────────────────────────────────
	const [showFilters, setShowFilters] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [dueBefore, setDueBefore] = useState<string | undefined>(undefined);
	const [dueAfter, setDueAfter] = useState<string | undefined>(undefined);
	const [planCode, setPlanCode] = useState<string | undefined>(undefined);
	const debouncedSearch = useDebounce(searchQuery, 300);

	// ── Sheet / detail state ─────────────────────────────────────────────────────
	const [selectedInstance, setSelectedInstance] =
		useState<InstallmentOverviewItem | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	// ── Dialog states ────────────────────────────────────────────────────────────
	const [confirmInstallment, setConfirmInstallment] =
		useState<Installment | null>(null);
	const [showUnlockDialog, setShowUnlockDialog] = useState(false);
	const [showRefundDialog, setShowRefundDialog] = useState(false);
	const [showAdjustCreditsDialog, setShowAdjustCreditsDialog] = useState(false);

	// ── Form state ───────────────────────────────────────────────────────────────
	const [paymentMethod, setPaymentMethod] = useState<
		"manual_transfer" | "cash"
	>("manual_transfer");
	const [notes, setNotes] = useState("");
	const [nextIntervalDays, setNextIntervalDays] = useState("");
	const [unlockReason, setUnlockReason] = useState("");
	const [adjustUnlocked, setAdjustUnlocked] = useState("");
	const [adjustUsed, setAdjustUsed] = useState("");
	const [adjustReason, setAdjustReason] = useState("");

	// ── Data queries ─────────────────────────────────────────────────────────────

	const { data: plans } = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async (): Promise<InstallmentPlan[]> => {
			if (!organizationId) return [];
			return client.installmentPlans.list({
				organizationId,
				activeOnly: true,
			});
		},
		enabled: !!organizationId,
	});
	const plansMap = useMemo(
		() =>
			new Map<string, { code: string; name: string; numInstallments: number }>(
				(plans ?? []).map((p) => [p.code, p]),
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
			return client.installments.adminOverview({
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

	const instances: InstallmentOverviewItem[] = overviewData?.items ?? [];

	const { data: installments = [] } = useQuery({
		queryKey: [
			"installments-by-instance",
			organizationId,
			selectedInstance?.id,
		],
		queryFn: async (): Promise<Installment[]> => {
			if (!organizationId || !selectedInstance?.id) return [];
			return client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId: selectedInstance.id,
			});
		},
		enabled: !!organizationId && !!selectedInstance?.id,
	});

	// Fetch suggested refund when the refund dialog opens
	const suggestRefundQuery = useQuery({
		queryKey: ["installments", "suggestRefund", selectedInstance?.id],
		queryFn: (): Promise<SuggestRefundResult> =>
			client.installments.suggestRefund({
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
			client.installments.confirmPayment({
				organizationId: organizationId ?? "",
				installmentId: vars.installmentId,
				paymentMethod: vars.paymentMethod as "manual_transfer" | "cash",
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
			client.installments.manualUnlock({
				organizationId: organizationId ?? "",
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

	const adjustCreditsMutation = useMutation({
		mutationFn: (vars: {
			packageInstanceId: string;
			creditsUnlocked?: number;
			creditsUsed?: number;
			reason: string;
		}) =>
			client.installments.adjustCredits({
				organizationId: organizationId ?? "",
				packageInstanceId: vars.packageInstanceId,
				creditsUnlocked: vars.creditsUnlocked,
				creditsUsed: vars.creditsUsed,
				reason: vars.reason,
			}),
		onSuccess: (updated) => {
			queryClient.invalidateQueries({ queryKey: ["installments-overview", organizationId] });
			setSelectedInstance((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
			toast.success("Credits adjusted successfully.");
			setShowAdjustCreditsDialog(false);
			setAdjustUnlocked("");
			setAdjustUsed("");
			setAdjustReason("");
		},
		onError: (err: Error) => toast.error(err.message ?? "Failed to adjust credits."),
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

	function openSheet(instance: InstallmentOverviewItem) {
		setSelectedInstance(instance);
		setSheetOpen(true);
	}

	function closeSheet() {
		setSheetOpen(false);
		setSelectedInstance(null);
		setShowUnlockDialog(false);
		setShowRefundDialog(false);
		setShowAdjustCreditsDialog(false);
		setConfirmInstallment(null);
		resetConfirmForm();
		setUnlockReason("");
		setAdjustUnlocked("");
		setAdjustUsed("");
		setAdjustReason("");
	}

	// Handler: open the request-refund dialog when user clicks "Request Refund" in the sheet
	const handleOpenRefundDialog = useCallback(() => {
		setShowRefundDialog(true);
	}, []);

	// ── Status filter tabs ────────────────────────────────────────────────────────

	const STATUS_TABS = [
		{ value: undefined, label: "All" },
		{ value: "active" as const, label: "Active" },
		{ value: "due_soon" as const, label: "Due Soon" },
		{ value: "overdue" as const, label: "Overdue" },
		{ value: "locked" as const, label: "Locked" },
	];

	// ── Table columns (kept for ColumnDef type usage, not rendered via DataTable) ─

	const columns: ColumnDef<InstallmentOverviewItem>[] = [
		{
			id: "clientId",
			header: "Client",
			cell: ({ row }) => (
				<CopyableCell
					value={row.original.clientId ?? ""}
					displayText={(row.original as { clientName?: string | null }).clientName ?? `${(row.original.clientId ?? "").slice(0, 8)}…`}
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
	];

	// ── Active filter count ───────────────────────────────────────────────────────

	const activeFilterCount = [searchQuery, dueBefore, dueAfter, planCode].filter(Boolean).length;

	// ── Guard ─────────────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-60 items-center justify-center text-muted-foreground">
				Select an organization to view installment packages.
			</div>
		);
	}

	// ── Computed values for detail sheet ─────────────────────────────────────────

	const totalPaidCents: number = installments
		.filter((i) => i.status === "paid")
		.reduce((sum: number, i) => sum + (i.amount ?? 0), 0);

	// ── Render ────────────────────────────────────────────────────────────────────

	return (
		<>
			{/* Header */}
				<div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
					<div className="mr-auto">
						<h1 className="text-base font-semibold tracking-tight">Installments</h1>
						<p className="text-xs text-muted-foreground">
							{isLoading ? "Loading…" : `${instances.length} record${instances.length !== 1 ? "s" : ""}`}
						</p>
					</div>
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowFilters((v) => !v)}
						className="gap-1.5"
					>
						<SlidersHorizontal className="h-3.5 w-3.5" />
						Filters
						{activeFilterCount > 0 && (
							<span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
								{activeFilterCount}
							</span>
						)}
						{showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
					</Button>
				</div>

				{/* Collapsible filter row */}
				{showFilters && (
					<div className="flex flex-wrap items-end gap-3 border-b bg-muted/30 px-5 py-4">
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
									{(plans ?? []).map((p) => (
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
				)}

				{/* Status filter tabs */}
				<div className="flex items-center gap-1.5 overflow-x-auto border-b px-5 py-3">
					{STATUS_TABS.map((tab) => (
						<button
							key={tab.label}
							type="button"
							onClick={() => setStatusFilter(tab.value)}
							className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
								statusFilter === tab.value
									? "bg-foreground text-background shadow-sm"
									: "text-muted-foreground hover:bg-muted hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Table */}
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</TableHead>
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan Type</TableHead>
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credits</TableHead>
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progress</TableHead>
							{statusFilter === "due_soon" && (
								<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next Amount</TableHead>
							)}
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next Due Date</TableHead>
							<TableHead className="px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 5 }).map((_, i) => (
								<TableRow key={i}>
									<TableCell className="px-5 py-4"><Skeleton className="h-4 w-24" /></TableCell>
									<TableCell className="px-5 py-4"><Skeleton className="h-4 w-20" /></TableCell>
									<TableCell className="px-5 py-4"><Skeleton className="h-4 w-28" /></TableCell>
									<TableCell className="px-5 py-4"><Skeleton className="h-4 w-16" /></TableCell>
									{statusFilter === "due_soon" && (
										<TableCell className="px-5 py-4"><Skeleton className="h-4 w-20" /></TableCell>
									)}
									<TableCell className="px-5 py-4"><Skeleton className="h-4 w-24" /></TableCell>
									<TableCell className="px-5 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
								</TableRow>
							))
						) : instances.length === 0 ? (
							<TableRow>
								<TableCell colSpan={statusFilter === "due_soon" ? 7 : 6} className="h-60">
									<div className="flex flex-col items-center justify-center gap-3 text-center">
										<div className="flex size-14 items-center justify-center rounded-full bg-muted">
											<CreditCard className="h-6 w-6 text-muted-foreground" />
										</div>
										<p className="text-sm font-medium">No installment packages found</p>
										<p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
									</div>
								</TableCell>
							</TableRow>
						) : (
							instances.map((row) => {
								const planCode = row.paymentPlanType;
								const planLabel = planCode
									? (plansMap.get(planCode)?.name ??
										String(planCode)
											.replace(/_/g, " ")
											.replace(/\b\w/g, (c: string) => c.toUpperCase()))
									: "—";
								// nextInstallmentAmount is an optional field added by Agent 1A (backend).
								// Use optional chaining to tolerate when the backend hasn't deployed yet.
								const nextAmount = (row as { nextInstallmentAmount?: number | null }).nextInstallmentAmount;
								return (
									<TableRow
										key={row.id}
										className="cursor-pointer transition-colors hover:bg-muted/30"
										onClick={() => openSheet(row)}
									>
										<TableCell className="px-5 py-4">
											<CopyableCell
												value={row.clientId ?? ""}
												displayText={(row as { clientName?: string | null }).clientName ?? `${(row.clientId ?? "").slice(0, 8)}…`}
											/>
										</TableCell>
										<TableCell className="px-5 py-4">
											<Badge variant="outline">{planLabel}</Badge>
										</TableCell>
										<TableCell className="px-5 py-4">
											<span className="text-sm tabular-nums">
												{row.creditsUnlocked ?? 0} unlocked / {row.creditsTotal ?? 0} total
											</span>
										</TableCell>
										<TableCell className="px-5 py-4">
											<span className="text-sm tabular-nums">
												{row.installmentsPaid ?? 0} of {row.installmentsTotal ?? 0}
											</span>
										</TableCell>
										{statusFilter === "due_soon" && (
											<TableCell className="px-5 py-4 text-sm font-medium tabular-nums">
												{nextAmount != null ? formatPrice(nextAmount, "MYR") : "—"}
											</TableCell>
										)}
										<TableCell className="px-5 py-4 text-sm">
											{formatDate(row.nextDueDate)}
										</TableCell>
										<TableCell className="px-5 py-4">
											<StatusBadge instance={row} />
										</TableCell>
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>

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
									onClick={() => {
										setAdjustUnlocked(String(selectedInstance.creditsUnlocked ?? selectedInstance.creditsTotal ?? 0));
										setAdjustUsed(String(selectedInstance.creditsUsed ?? 0));
										setShowAdjustCreditsDialog(true);
									}}
								>
									Adjust Credits
								</Button>
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

			{/* ── Adjust Credits Dialog ───────────────────────────────────────────── */}
			<Dialog
				open={showAdjustCreditsDialog}
				onOpenChange={(open) => {
					if (!open) {
						setShowAdjustCreditsDialog(false);
						setAdjustUnlocked("");
						setAdjustUsed("");
						setAdjustReason("");
					}
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Adjust Credits</DialogTitle>
						<DialogDescription>
							Override the credits for this package. Future installment payments will only increase
							unlocked credits, never decrease them past this value.
						</DialogDescription>
					</DialogHeader>

					{selectedInstance && (() => {
						const total = selectedInstance.creditsTotal ?? 0;
						const unlocked = adjustUnlocked === "" ? (selectedInstance.creditsUnlocked ?? total) : (Number.parseInt(adjustUnlocked, 10) || 0);
						const used = adjustUsed === "" ? (selectedInstance.creditsUsed ?? 0) : (Number.parseInt(adjustUsed, 10) || 0);
						const available = unlocked - used;
						const isValid = unlocked <= total && used <= unlocked && available >= 0;

						return (
							<div className="flex flex-col gap-4 py-2">
								<div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
									<span className="text-muted-foreground">Total credits: </span>
									<span className="font-semibold">{total}</span>
									{selectedInstance.creditsAdminOverride && (
										<span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
											Admin override active
										</span>
									)}
								</div>

								<div className="flex flex-col gap-1.5">
									<Label htmlFor="adjust-unlocked">Credits Unlocked</Label>
									<Input
										id="adjust-unlocked"
										type="number"
										min="0"
										max={total}
										step="1"
										value={adjustUnlocked}
										onChange={(e) => setAdjustUnlocked(e.target.value)}
										placeholder={String(selectedInstance.creditsUnlocked ?? total)}
									/>
									<p className="text-xs text-muted-foreground">Max: {total}</p>
								</div>

								<div className="flex flex-col gap-1.5">
									<Label htmlFor="adjust-used">Credits Used</Label>
									<Input
										id="adjust-used"
										type="number"
										min="0"
										max={unlocked}
										step="1"
										value={adjustUsed}
										onChange={(e) => setAdjustUsed(e.target.value)}
										placeholder={String(selectedInstance.creditsUsed ?? 0)}
									/>
									<p className="text-xs text-muted-foreground">Max: {unlocked} (cannot exceed unlocked)</p>
								</div>

								<div className="rounded-md border px-3 py-2 text-sm">
									<span className="text-muted-foreground">Credits available (preview): </span>
									<span className={`font-semibold ${available < 0 ? "text-destructive" : ""}`}>
										{available}
									</span>
								</div>

								{!isValid && (
									<p className="text-xs text-destructive">
										{unlocked > total
											? `Unlocked (${unlocked}) cannot exceed total (${total}).`
											: used > unlocked
											? `Used (${used}) cannot exceed unlocked (${unlocked}).`
											: "Invalid values."}
									</p>
								)}

								<div className="flex flex-col gap-1.5">
									<Label htmlFor="adjust-reason">
										Reason <span className="text-destructive">*</span>
									</Label>
									<Textarea
										id="adjust-reason"
										placeholder="Provide a reason for this adjustment…"
										rows={2}
										value={adjustReason}
										onChange={(e) => setAdjustReason(e.target.value)}
									/>
								</div>
							</div>
						);
					})()}

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setShowAdjustCreditsDialog(false);
								setAdjustUnlocked("");
								setAdjustUsed("");
								setAdjustReason("");
							}}
							disabled={adjustCreditsMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={() => {
								if (!selectedInstance || !adjustReason.trim()) {
									toast.error("A reason is required.");
									return;
								}
								const total = selectedInstance.creditsTotal ?? 0;
								const newUnlocked = adjustUnlocked !== "" ? Number.parseInt(adjustUnlocked, 10) : undefined;
								const newUsed = adjustUsed !== "" ? Number.parseInt(adjustUsed, 10) : undefined;
								const resolvedUnlocked = newUnlocked ?? (selectedInstance.creditsUnlocked ?? total);
								const resolvedUsed = newUsed ?? (selectedInstance.creditsUsed ?? 0);
								if (resolvedUnlocked > total) {
									toast.error(`Unlocked credits cannot exceed total (${total}).`);
									return;
								}
								if (resolvedUsed > resolvedUnlocked) {
									toast.error(`Used credits cannot exceed unlocked (${resolvedUnlocked}).`);
									return;
								}
								adjustCreditsMutation.mutate({
									packageInstanceId: selectedInstance.id,
									creditsUnlocked: newUnlocked,
									creditsUsed: newUsed,
									reason: adjustReason.trim(),
								});
							}}
							disabled={adjustCreditsMutation.isPending}
						>
							{adjustCreditsMutation.isPending ? "Saving…" : "Save Changes"}
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
						suggestRefundQuery.data?.suggestedRefund ?? undefined
					}
				/>
			)}

			{/* totalPaidCents is computed but used only for potential future display */}
			{totalPaidCents > 0 && null}
		</>
	);
}
