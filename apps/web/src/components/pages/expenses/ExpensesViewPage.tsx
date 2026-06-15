import { useQuery } from "@tanstack/react-query";
import { Lock, Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice, rmToCents } from "@/lib/money";
import { client, orpc } from "@/utils/orpc";
import { Skeleton } from "boneyard-js/react";
import { ExpenseStatusBadge, CategoryChip } from "./badges";
import { CreateExpenseDialog } from "./CreateExpenseDialog";
import { getTodayDateString, STATUS_TABS } from "./constants";
import { formatDate } from "./helpers";
import { MarkPaidDialog } from "./MarkPaidDialog";
import { RejectExpenseDialog } from "./RejectExpenseDialog";
import { RowActions } from "./RowActions";
import type { ExpenseCategory, ExpenseRow, ExpenseStatus } from "./types";

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ExpensesViewPage() {
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
		invalidate: [orpc.expenses.list.key()],
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
		invalidate: [orpc.expenses.list.key()],
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
		invalidate: [orpc.expenses.list.key()],
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
		invalidate: [orpc.expenses.list.key()],
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
					<CreateExpenseDialog
						open={isCreateOpen}
						onOpenChange={setIsCreateOpen}
						formCategory={formCategory}
						setFormCategory={setFormCategory}
						formDescription={formDescription}
						setFormDescription={setFormDescription}
						formAmountRm={formAmountRm}
						setFormAmountRm={setFormAmountRm}
						formDate={formDate}
						setFormDate={setFormDate}
						formReceiptUrl={formReceiptUrl}
						setFormReceiptUrl={setFormReceiptUrl}
						isPending={createMutation.isPending}
						onSubmit={handleCreateSubmit}
					/>

					{/* ── Reject Dialog ── */}
					<RejectExpenseDialog
						open={rejectTarget !== null}
						onOpenChange={(open) => {
							if (!open) setRejectTarget(null);
						}}
						rejectionReason={rejectionReason}
						setRejectionReason={setRejectionReason}
						isPending={rejectMutation.isPending}
						onConfirm={handleRejectConfirm}
						onCancel={() => setRejectTarget(null)}
					/>

					{/* ── Mark Paid Dialog ── */}
					<MarkPaidDialog
						open={paidTarget !== null}
						onOpenChange={(open) => {
							if (!open) setPaidTarget(null);
						}}
						paymentReference={paymentReference}
						setPaymentReference={setPaymentReference}
						isPending={markPaidMutation.isPending}
						onConfirm={handleMarkPaidConfirm}
						onCancel={() => setPaidTarget(null)}
					/>
				</div>
			</div>
		</Skeleton>
	);
}
