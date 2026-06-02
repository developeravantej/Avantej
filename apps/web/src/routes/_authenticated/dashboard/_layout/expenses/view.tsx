import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice, rmToCents } from "@/lib/money";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Receipt, Lock } from "lucide-react";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Skeleton } from "boneyard-js/react";
import { StatusCallout } from "@/components/ui/status-callout";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/expenses/view",
)({
	beforeLoad: async () => {
		await requirePermission("expense_management:read");
	},
	component: ExpensesViewPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpenseCategory =
	| "travel"
	| "equipment"
	| "supplies"
	| "training"
	| "other";

type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

interface ExpenseRow {
	id: string;
	category: ExpenseCategory;
	description: string;
	amount: number; // cents
	expenseDate: string;
	submittedBy: string;
	status: ExpenseStatus;
	branchId?: string | null;
	receiptUrl?: string | null;
	rejectionReason?: string | null;
	approvedBy?: string | null;
	paidBy?: string | null;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function getTodayDateString(): string {
	return new Date().toISOString().split("T")[0];
}

const CATEGORY_OPTIONS: { value: ExpenseCategory; label: string }[] = [
	{ value: "travel", label: "Travel" },
	{ value: "equipment", label: "Equipment" },
	{ value: "supplies", label: "Supplies" },
	{ value: "training", label: "Training" },
	{ value: "other", label: "Other" },
];

const STATUS_TABS: { value: string | undefined; label: string }[] = [
	{ value: undefined, label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "paid", label: "Paid" },
];

const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
	travel: "bg-blue-50 text-blue-700",
	equipment: "bg-purple-50 text-purple-700",
	supplies: "bg-amber-50 text-amber-700",
	training: "bg-emerald-50 text-emerald-700",
	other: "bg-slate-100 text-slate-500",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
	if (!iso) return "—";
	try {
		return new Date(iso).toLocaleDateString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return "—";
	}
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
	const map: Record<ExpenseStatus, string> = {
		pending: "bg-amber-50 text-amber-700",
		approved: "bg-emerald-50 text-emerald-700",
		rejected: "bg-rose-50 text-rose-600",
		paid: "bg-blue-50 text-blue-700",
	};
	const dotMap: Record<ExpenseStatus, string> = {
		pending: "bg-amber-500",
		approved: "bg-emerald-500",
		rejected: "bg-rose-500",
		paid: "bg-blue-500",
	};
	const cls = map[status] ?? "bg-slate-100 text-slate-500";
	const dot = dotMap[status] ?? "bg-slate-400";
	const label = status.charAt(0).toUpperCase() + status.slice(1);
	return (
		<span
			className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}
		>
			<span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
			{label}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Category chip
// ---------------------------------------------------------------------------

function CategoryChip({ category }: { category: ExpenseCategory }) {
	const cls = CATEGORY_COLORS[category] ?? "bg-slate-100 text-slate-500";
	return (
		<span
			className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${cls}`}
		>
			{category}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Table row actions
// ---------------------------------------------------------------------------

function RowActions({
	row,
	canUpdate,
	onApprove,
	onReject,
	onMarkPaid,
}: {
	row: ExpenseRow;
	canUpdate: boolean;
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
	onMarkPaid: (id: string) => void;
}) {
	if (!canUpdate) {
		return (
			<span className="font-mono tabular-nums text-[#737373] text-xs">—</span>
		);
	}
	if (row.status === "pending") {
		return (
			<div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => onApprove(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
				>
					Approve
				</button>
				<button
					type="button"
					onClick={() => onReject(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 transition-colors"
				>
					Reject
				</button>
			</div>
		);
	}
	if (row.status === "approved") {
		return (
			<div className="opacity-0 group-hover:opacity-100 transition-opacity">
				<button
					type="button"
					onClick={() => onMarkPaid(row.id)}
					className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
				>
					Mark Paid
				</button>
			</div>
		);
	}
	return (
		<span className="font-mono tabular-nums text-[#737373] text-xs">—</span>
	);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function ExpensesViewPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canCreate = hasPermission("expense_management:create");
	const canUpdate = hasPermission("expense_management:update");

	// ---- Filter state ----
	const [statusFilter, setStatusFilter] = useState<string | undefined>(
		undefined,
	);

	// ---- Create dialog state ----
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [formCategory, setFormCategory] = useState<ExpenseCategory>("travel");
	const [formDescription, setFormDescription] = useState("");
	const [formAmountRm, setFormAmountRm] = useState("");
	const [formDate, setFormDate] = useState(getTodayDateString());
	const [formReceiptUrl, setFormReceiptUrl] = useState("");

	// ---- Reject dialog state ----
	const [rejectTarget, setRejectTarget] = useState<string | null>(null);
	const [rejectionReason, setRejectionReason] = useState("");

	// ---- Mark paid dialog state ----
	const [paidTarget, setPaidTarget] = useState<string | null>(null);
	const [paymentReference, setPaymentReference] = useState("");

	// ---- Query ----
	const {
		data: apiData = [],
		isLoading,
		isError,
		error,
		refetch,
	} = useQuery({
		...orpc.expenses.list.queryOptions({
			input: { organizationId: organizationId!, status: statusFilter },
		}),
		enabled: !!organizationId,
	});

	// ---- Mutations ----
	const createMutation = useApiMutation({
		mutationFn: (vars: {
			category: ExpenseCategory;
			description: string;
			amount: number;
			expenseDate: string;
			receiptUrl?: string;
		}) =>
			client.expenses.create({
				organizationId: organizationId!,
				category: vars.category,
				description: vars.description,
				amount: vars.amount,
				expenseDate: vars.expenseDate,
				receiptUrl: vars.receiptUrl || undefined,
			}),
		successMessage: "Expense submitted!",
		errorMessage: (err) =>
			`Failed to submit expense: ${err.message || "An unexpected error occurred"}`,
		invalidate: [["expenses", organizationId]],
		onSuccess: () => {
			setIsCreateOpen(false);
			resetCreateForm();
		},
	});

	const approveMutation = useApiMutation({
		mutationFn: (id: string) =>
			client.expenses.approve({ organizationId: organizationId!, id }),
		successMessage: "Expense approved",
		errorMessage: (err) =>
			`Failed to approve expense: ${err.message || "An unexpected error occurred"}`,
		invalidate: [["expenses", organizationId]],
	});

	const rejectMutation = useApiMutation({
		mutationFn: (vars: { id: string; rejectionReason: string }) =>
			client.expenses.reject({
				organizationId: organizationId!,
				id: vars.id,
				rejectionReason: vars.rejectionReason,
			}),
		successMessage: "Expense rejected",
		errorMessage: (err) =>
			`Failed to reject expense: ${err.message || "An unexpected error occurred"}`,
		invalidate: [["expenses", organizationId]],
		onSuccess: () => {
			setRejectTarget(null);
			setRejectionReason("");
		},
	});

	const markPaidMutation = useApiMutation({
		mutationFn: (vars: { id: string; paymentReference?: string }) =>
			client.expenses.markPaid({
				organizationId: organizationId!,
				id: vars.id,
				paymentReference: vars.paymentReference || undefined,
			}),
		successMessage: "Expense marked as paid",
		errorMessage: (err) =>
			`Failed to mark expense as paid: ${err.message || "An unexpected error occurred"}`,
		invalidate: [["expenses", organizationId]],
		onSuccess: () => {
			setPaidTarget(null);
			setPaymentReference("");
		},
	});

	// ---- Helpers ----
	function resetCreateForm() {
		setFormCategory("travel");
		setFormDescription("");
		setFormAmountRm("");
		setFormDate(getTodayDateString());
		setFormReceiptUrl("");
	}

	function handleCreateSubmit() {
		const rmValue = parseFloat(formAmountRm);
		if (!formDescription.trim()) {
			toast.error("Description is required");
			return;
		}
		if (Number.isNaN(rmValue) || rmValue <= 0) {
			toast.error("Please enter a valid amount");
			return;
		}
		if (!formDate) {
			toast.error("Expense date is required");
			return;
		}
		if (formReceiptUrl.trim()) {
			try {
				new URL(formReceiptUrl.trim());
			} catch {
				toast.error(
					"Receipt URL must be a valid URL (e.g. https://example.com/receipt.pdf).",
				);
				return;
			}
		}
		const amountCents = rmToCents(rmValue);
		const expenseDate = new Date(`${formDate}T00:00:00.000Z`).toISOString();
		createMutation.mutate({
			category: formCategory,
			description: formDescription.trim(),
			amount: amountCents,
			expenseDate,
			receiptUrl: formReceiptUrl.trim() || undefined,
		});
	}

	function handleRejectConfirm() {
		if (!rejectTarget) return;
		if (!rejectionReason.trim()) {
			toast.error("Rejection reason is required");
			return;
		}
		rejectMutation.mutate({
			id: rejectTarget,
			rejectionReason: rejectionReason.trim(),
		});
	}

	function handleMarkPaidConfirm() {
		if (!paidTarget) return;
		markPaidMutation.mutate({
			id: paidTarget,
			paymentReference: paymentReference.trim() || undefined,
		});
	}

	// ---- Table data ----
	const data: ExpenseRow[] = apiData.map((item) => ({
		id: item.id,
		category: item.category as ExpenseCategory,
		description: item.description,
		amount: item.amount,
		expenseDate: item.expenseDate ? formatDate(item.expenseDate as any) : "—",
		submittedBy: item.submittedBy,
		status: item.status as ExpenseStatus,
		branchId: item.branchId ?? null,
		receiptUrl: item.receiptUrl ?? null,
		rejectionReason: item.rejectionReason ?? null,
		approvedBy: item.approvedBy ?? null,
		paidBy: item.paidBy ?? null,
		createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
	}));

	// ---- KPI summaries ----
	const totalCents = data.reduce((s, r) => s + r.amount, 0);
	const pendingCount = data.filter((r) => r.status === "pending").length;
	const pendingCents = data
		.filter((r) => r.status === "pending")
		.reduce((s, r) => s + r.amount, 0);

	// ---- Guards ----
	if (!organizationId) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
				<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					No organization selected
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Select an organization to view expenses.
				</p>
			</div>
		);
	}

	if (!hasPermission("expense_management:read")) {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6 flex flex-col items-center justify-center">
				<Lock className="h-8 w-8 mb-3 opacity-30 text-[#737373]" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					You don&apos;t have access to this page
				</p>
				<p className="text-xs mt-1 text-[#737373]">
					Ask an admin to grant expense management access.
				</p>
			</div>
		);
	}

	// ---- Render ----
	return (
		<Skeleton
			name="expenses-view"
			loading={isLoading}
			fallback={<PageLoader />}
		>
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
					<div className="flex items-center gap-3 text-sm">
						<span className="text-[#737373]">Finance</span>
						<span className="text-[#a3a3a3]">/</span>
						<span className="font-semibold">Expenses</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						{canCreate && (
							<button
								type="button"
								onClick={() => {
									resetCreateForm();
									setIsCreateOpen(true);
								}}
								className="flex items-center gap-2 rounded-lg bg-[#0a0a0a] text-white px-4 py-2 text-xs font-semibold transition hover:bg-[#262626]"
							>
								<Plus className="h-3.5 w-3.5" />
								Submit Expense
							</button>
						)}
					</div>
				</header>
				<div className="px-6 py-6">
					{/* ── KPI tiles ── */}
					<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								TOTAL CLAIMS
							</p>
							<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">
								{data.length}
							</p>
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								TOTAL VALUE
							</p>
							<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">
								{formatPrice(totalCents, "MYR")}
							</p>
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								PENDING
							</p>
							<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">
								{pendingCount}
							</p>
						</div>
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
							<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
								PENDING VALUE
							</p>
							<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-amber-700">
								{pendingCents > 0 ? formatPrice(pendingCents, "MYR") : "—"}
							</p>
						</div>
					</div>

					{/* ── Status tabs ── */}
					<div className="mb-4 flex flex-wrap items-center gap-2">
						{STATUS_TABS.map((tab) => {
							const isActive = statusFilter === tab.value;
							return (
								<button
									key={tab.label}
									type="button"
									onClick={() => setStatusFilter(tab.value)}
									className={
										isActive
											? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
											: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
									}
								>
									{tab.label}
								</button>
							);
						})}
					</div>

					{/* ── Table ── */}
					{isError ? (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
							<StatusCallout variant="error" onRetry={() => refetch()}>
								Failed to load expenses. Please try again.
							</StatusCallout>
						</div>
					) : (
						<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
							<table className="w-full">
								<thead className="bg-[#f3f3f3]">
									<tr className="border-b border-[#e5e5e5]">
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Date
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Category
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Description
										</th>
										<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Amount
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Submitted By
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Status
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-[#e5e5e5]">
									{data.length === 0 ? (
										<tr>
											<td colSpan={7}>
												<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
													<Receipt className="h-8 w-8 mb-3 opacity-30" />
													<p className="text-sm font-medium text-[#0a0a0a]">
														No expenses found
													</p>
													<p className="text-xs mt-1">
														{statusFilter
															? "Try clearing the status filter."
															: canCreate
																? "Submit your first expense claim to get started."
																: "No expense claims have been submitted yet."}
													</p>
													{canCreate && !statusFilter && (
														<button
															type="button"
															onClick={() => {
																resetCreateForm();
																setIsCreateOpen(true);
															}}
															className="mt-4 inline-flex items-center gap-1.5 bg-[#0a0a0a] text-white px-3.5 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition"
														>
															<Plus className="h-4 w-4" />
															Submit Expense
														</button>
													)}
												</div>
											</td>
										</tr>
									) : (
										data.map((row) => (
											<tr
												key={row.id}
												className="group hover:bg-[#fafafa] transition-colors"
											>
												<td className="px-4 py-3 font-mono tabular-nums text-sm text-[#737373]">
													{row.expenseDate}
												</td>
												<td className="px-4 py-3">
													<CategoryChip category={row.category} />
												</td>
												<td className="px-4 py-3 text-sm text-[#0a0a0a] max-w-xs">
													<span
														title={row.description}
														className="block truncate"
													>
														{row.description}
													</span>
													{row.rejectionReason && row.status === "rejected" && (
														<span className="block text-[10px] text-rose-600 mt-0.5 truncate">
															{row.rejectionReason}
														</span>
													)}
												</td>
												<td className="px-4 py-3 text-right font-mono tabular-nums text-sm font-medium text-[#0a0a0a]">
													{formatPrice(row.amount, "MYR")}
												</td>
												<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">
													{row.submittedBy.length > 20
														? `${row.submittedBy.slice(0, 20)}…`
														: row.submittedBy}
												</td>
												<td className="px-4 py-3">
													<ExpenseStatusBadge status={row.status} />
												</td>
												<td className="px-4 py-3">
													<RowActions
														row={row}
														canUpdate={canUpdate}
														onApprove={(id) => approveMutation.mutate(id)}
														onReject={(id) => {
															setRejectTarget(id);
															setRejectionReason("");
														}}
														onMarkPaid={(id) => {
															setPaidTarget(id);
															setPaymentReference("");
														}}
													/>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					)}

					{/* ── Create Expense Dialog ── */}
					<Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
						<DialogContent
							className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									EXPENSE TRACKER
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Submit Expense
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									Fill in the details to submit a new expense claim.
								</DialogDescription>
							</DialogHeader>

							<div className="px-6 pt-4 pb-2 overflow-y-auto">
								<div className="flex flex-col gap-5">
									<div className="flex flex-col gap-1.5">
										<Label>Category</Label>
										<Select
											value={formCategory}
											onValueChange={(val) =>
												setFormCategory(val as ExpenseCategory)
											}
										>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select category" />
											</SelectTrigger>
											<SelectContent>
												{CATEGORY_OPTIONS.map((opt) => (
													<SelectItem key={opt.value} value={opt.value}>
														{opt.label}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="flex flex-col gap-1.5">
										<Label>
											Description <span className="text-rose-600">*</span>
										</Label>
										<Textarea
											placeholder="Describe the expense..."
											value={formDescription}
											onChange={(e) => setFormDescription(e.target.value)}
											rows={3}
										/>
									</div>

									<div className="flex flex-col gap-1.5">
										<Label>
											Amount (RM) <span className="text-rose-600">*</span>
										</Label>
										<Input
											type="number"
											step="0.01"
											min="0"
											placeholder="0.00"
											value={formAmountRm}
											onChange={(e) => setFormAmountRm(e.target.value)}
										/>
									</div>

									<div className="flex flex-col gap-1.5">
										<Label>
											Expense Date <span className="text-rose-600">*</span>
										</Label>
										<Input
											type="date"
											value={formDate}
											onChange={(e) => setFormDate(e.target.value)}
										/>
									</div>

									<div className="flex flex-col gap-1.5">
										<Label>
											Receipt URL{" "}
											<span className="text-[#737373] text-xs font-normal">
												(optional)
											</span>
										</Label>
										<Input
											type="url"
											placeholder="https://..."
											value={formReceiptUrl}
											onChange={(e) => setFormReceiptUrl(e.target.value)}
										/>
									</div>
								</div>
							</div>

							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									variant="outline"
									onClick={() => setIsCreateOpen(false)}
									disabled={createMutation.isPending}
								>
									Cancel
								</Button>
								<Button
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
									onClick={handleCreateSubmit}
									disabled={createMutation.isPending}
								>
									{createMutation.isPending ? "Submitting…" : "Submit"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					{/* ── Reject Dialog ── */}
					<Dialog
						open={rejectTarget !== null}
						onOpenChange={(open) => {
							if (!open) setRejectTarget(null);
						}}
					>
						<DialogContent
							className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									EXPENSE TRACKER
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Reject Expense
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									Please provide a reason for rejecting this expense claim.
								</DialogDescription>
							</DialogHeader>

							<div className="px-6 pt-4 pb-2 overflow-y-auto">
								<div className="flex flex-col gap-1.5">
									<Label>
										Rejection Reason <span className="text-rose-600">*</span>
									</Label>
									<Textarea
										placeholder="Explain why this expense is being rejected..."
										value={rejectionReason}
										onChange={(e) => setRejectionReason(e.target.value)}
										rows={3}
									/>
								</div>
							</div>

							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									variant="outline"
									onClick={() => setRejectTarget(null)}
									disabled={rejectMutation.isPending}
								>
									Cancel
								</Button>
								<Button
									className="bg-red-600 hover:bg-red-700 text-white"
									onClick={handleRejectConfirm}
									disabled={rejectMutation.isPending}
								>
									{rejectMutation.isPending ? "Rejecting…" : "Reject"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>

					{/* ── Mark Paid Dialog ── */}
					<Dialog
						open={paidTarget !== null}
						onOpenChange={(open) => {
							if (!open) setPaidTarget(null);
						}}
					>
						<DialogContent
							className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									EXPENSE TRACKER
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Mark as Paid
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									Optionally enter a payment reference before confirming.
								</DialogDescription>
							</DialogHeader>

							<div className="px-6 pt-4 pb-2 overflow-y-auto">
								<div className="flex flex-col gap-1.5">
									<Label>
										Payment Reference{" "}
										<span className="text-[#737373] text-xs font-normal">
											(optional)
										</span>
									</Label>
									<Input
										placeholder="e.g. TXN-20240101-001"
										value={paymentReference}
										onChange={(e) => setPaymentReference(e.target.value)}
									/>
								</div>
							</div>

							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									variant="outline"
									onClick={() => setPaidTarget(null)}
									disabled={markPaidMutation.isPending}
								>
									Cancel
								</Button>
								<Button
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
									onClick={handleMarkPaidConfirm}
									disabled={markPaidMutation.isPending}
								>
									{markPaidMutation.isPending ? "Processing…" : "Confirm"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</div>
			</div>
		</Skeleton>
	);
}
