import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import DataTable from "@/components/tables/sales/view/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Receipt, Plus, CheckCircle, XCircle, DollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { PageLoader } from "@/components/ui/loading-spinner";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/expenses/view",
)({
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
// Helpers
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

// All expense statuses (pending/approved/rejected/paid) are in CanonicalStatus — use StatusBadge directly.

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

function ExpensesViewPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canCreate = hasPermission("expense_management:create");
	const canUpdate = hasPermission("expense_management:update");
	const queryClient = useQueryClient();

	// ---- Filter state ----
	const [statusFilter, setStatusFilter] = useState<string | undefined>(
		undefined,
	);

	// ---- Create sheet state ----
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [formCategory, setFormCategory] =
		useState<ExpenseCategory>("travel");
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
	const { data: apiData = [], isLoading, isError, error, refetch } = useQuery({
		queryKey: ["expenses", organizationId, statusFilter],
		queryFn: async () => {
			if (!organizationId) return [];
			return client.expenses.list({
				organizationId,
				status: statusFilter,
			});
		},
		enabled: !!organizationId,
	});

	// ---- Mutations ----
	const createMutation = useMutation({
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
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["expenses", organizationId],
			});
			toast.success("Expense submitted!");
			setIsCreateOpen(false);
			resetCreateForm();
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to submit expense: ${message}`);
		},
	});

	const approveMutation = useMutation({
		mutationFn: (id: string) =>
			client.expenses.approve({ organizationId: organizationId!, id }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["expenses", organizationId],
			});
			toast.success("Expense approved");
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to approve expense: ${message}`);
		},
	});

	const rejectMutation = useMutation({
		mutationFn: (vars: { id: string; rejectionReason: string }) =>
			client.expenses.reject({
				organizationId: organizationId!,
				id: vars.id,
				rejectionReason: vars.rejectionReason,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["expenses", organizationId],
			});
			toast.success("Expense rejected");
			setRejectTarget(null);
			setRejectionReason("");
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to reject expense: ${message}`);
		},
	});

	const markPaidMutation = useMutation({
		mutationFn: (vars: { id: string; paymentReference?: string }) =>
			client.expenses.markPaid({
				organizationId: organizationId!,
				id: vars.id,
				paymentReference: vars.paymentReference || undefined,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["expenses", organizationId],
			});
			toast.success("Expense marked as paid");
			setPaidTarget(null);
			setPaymentReference("");
		},
		onError: (error: unknown) => {
			const message = error instanceof Error ? error.message : "An unexpected error occurred";
			toast.error(`Failed to mark expense as paid: ${message}`);
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
				toast.error("Receipt URL must be a valid URL (e.g. https://example.com/receipt.pdf).");
				return;
			}
		}
		const amountCents = Math.round(rmValue * 100);
		// Convert local date string to ISO datetime (start of day UTC)
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
		expenseDate: item.expenseDate
			? new Date(item.expenseDate).toLocaleDateString()
			: "",
		submittedBy: item.submittedBy,
		status: item.status as ExpenseStatus,
		branchId: item.branchId ?? null,
		receiptUrl: item.receiptUrl ?? null,
		rejectionReason: item.rejectionReason ?? null,
		approvedBy: item.approvedBy ?? null,
		paidBy: item.paidBy ?? null,
		createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : "",
	}));

	// ---- Columns ----
	const columns: ColumnDef<ExpenseRow>[] = [
		{
			accessorKey: "expenseDate",
			header: "Date",
			cell: ({ getValue }) => (
				<span className="text-sm">{getValue<string>()}</span>
			),
		},
		{
			accessorKey: "category",
			header: "Category",
			cell: ({ getValue }) => {
				const cat = getValue<string>();
				return (
					<Badge variant="outline" className="capitalize">
						{cat}
					</Badge>
				);
			},
		},
		{
			accessorKey: "description",
			header: "Description",
			cell: ({ getValue }) => {
				const desc = getValue<string>();
				return (
					<span
						className="text-sm text-muted-foreground"
						title={desc}
					>
						{desc.length > 50 ? `${desc.slice(0, 50)}…` : desc}
					</span>
				);
			},
		},
		{
			accessorKey: "amount",
			header: "Amount (MYR)",
			cell: ({ getValue }) => (
				<span className="font-medium">
					{formatPrice(getValue<number>(), "MYR")}
				</span>
			),
		},
		{
			accessorKey: "submittedBy",
			header: "Submitted By",
			cell: ({ getValue }) => (
				<CopyableCell value={getValue<string>()} />
			),
		},
		{
			accessorKey: "status",
			header: "Status",
			cell: ({ getValue }) => (
				<StatusBadge status={getValue<ExpenseStatus>()} />
			),
		},
		{
			id: "actions",
			header: "Actions",
			enableSorting: false,
			enableHiding: false,
			cell: ({ row }) => {
				const { id, status } = row.original;
				if (!canUpdate) {
					return <span className="text-muted-foreground text-xs">—</span>;
				}
				if (status === "pending") {
					return (
						<div className="flex items-center gap-2">
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-green-700 border-green-300 hover:bg-green-50"
								onClick={() => approveMutation.mutate(id)}
								disabled={approveMutation.isPending}
							>
								<CheckCircle className="h-3.5 w-3.5" />
								Approve
							</Button>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-red-700 border-red-300 hover:bg-red-50"
								onClick={() => {
									setRejectTarget(id);
									setRejectionReason("");
								}}
							>
								<XCircle className="h-3.5 w-3.5" />
								Reject
							</Button>
						</div>
					);
				}
				if (status === "approved") {
					return (
						<Button
							size="sm"
							variant="outline"
							className="h-7 gap-1 text-blue-700 border-blue-300 hover:bg-blue-50"
							onClick={() => {
								setPaidTarget(id);
								setPaymentReference("");
							}}
						>
							<DollarSign className="h-3.5 w-3.5" />
							Mark Paid
						</Button>
					);
				}
				return <span className="text-muted-foreground text-xs">—</span>;
			},
		},
	];

	// ---- Guard ----
	if (!organizationId) {
		return (
			<div className="flex items-center justify-center min-h-96 text-muted-foreground">
				Select an organization to view expenses.
			</div>
		);
	}

	if (isLoading) {
		return <PageLoader />;
	}

	// ---- Render ----
	return (
		<div className="p-6 space-y-6">
			{/* Header */}
			<PageHeader
				icon={Receipt}
				title="Expenses"
				description="Submit and manage expense claims"
				actions={
					canCreate ? (
						<Button
							onClick={() => {
								resetCreateForm();
								setIsCreateOpen(true);
							}}
							className="gap-2"
						>
							<Plus className="h-4 w-4" />
							Submit Expense
						</Button>
					) : undefined
				}
			/>

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
			<DataTable<ExpenseRow, unknown>
					columns={columns}
					data={data}
					emptyTitle="No expenses found"
					emptyAction={canCreate ? { label: "Submit Expense", onClick: () => setIsCreateOpen(true) } : undefined}
					error={isError ? error : undefined}
					onRetry={() => refetch()}
				/>

			{/* ------------------------------------------------------------------ */}
			{/* Create Expense Sheet                                                */}
			{/* ------------------------------------------------------------------ */}
			<Sheet open={isCreateOpen} onOpenChange={setIsCreateOpen}>
				<SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
					<SheetHeader>
						<SheetTitle>Submit Expense</SheetTitle>
						<SheetDescription>
							Fill in the details to submit a new expense claim.
						</SheetDescription>
					</SheetHeader>

					<div className="flex flex-col gap-4 px-4 py-2">
						{/* Category */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">Category</label>
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

						{/* Description */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Description{" "}
								<span className="text-destructive">*</span>
							</label>
							<Textarea
								placeholder="Describe the expense..."
								value={formDescription}
								onChange={(e) => setFormDescription(e.target.value)}
								rows={3}
							/>
						</div>

						{/* Amount */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Amount (RM){" "}
								<span className="text-destructive">*</span>
							</label>
							<Input
								type="number"
								step="0.01"
								min="0"
								placeholder="0.00"
								value={formAmountRm}
								onChange={(e) => setFormAmountRm(e.target.value)}
							/>
						</div>

						{/* Expense Date */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Expense Date{" "}
								<span className="text-destructive">*</span>
							</label>
							<Input
								type="date"
								value={formDate}
								onChange={(e) => setFormDate(e.target.value)}
							/>
						</div>

						{/* Receipt URL */}
						<div className="flex flex-col gap-1.5">
							<label className="text-sm font-medium">
								Receipt URL{" "}
								<span className="text-muted-foreground text-xs">
									(optional)
								</span>
							</label>
							<Input
								type="url"
								placeholder="https://..."
								value={formReceiptUrl}
								onChange={(e) => setFormReceiptUrl(e.target.value)}
							/>
						</div>
					</div>

					<SheetFooter className="px-4">
						<Button
							variant="outline"
							onClick={() => setIsCreateOpen(false)}
							disabled={createMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleCreateSubmit}
							disabled={createMutation.isPending}
						>
							{createMutation.isPending ? "Submitting…" : "Submit"}
						</Button>
					</SheetFooter>
				</SheetContent>
			</Sheet>

			{/* ------------------------------------------------------------------ */}
			{/* Reject Dialog                                                       */}
			{/* ------------------------------------------------------------------ */}
			<Dialog
				open={rejectTarget !== null}
				onOpenChange={(open) => {
					if (!open) setRejectTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Reject Expense</DialogTitle>
						<DialogDescription>
							Please provide a reason for rejecting this expense claim.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-1.5 py-2">
						<label className="text-sm font-medium">
							Rejection Reason{" "}
							<span className="text-destructive">*</span>
						</label>
						<Textarea
							placeholder="Explain why this expense is being rejected..."
							value={rejectionReason}
							onChange={(e) => setRejectionReason(e.target.value)}
							rows={3}
						/>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRejectTarget(null)}
							disabled={rejectMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={handleRejectConfirm}
							disabled={rejectMutation.isPending}
						>
							{rejectMutation.isPending ? "Rejecting…" : "Reject"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* ------------------------------------------------------------------ */}
			{/* Mark Paid Dialog                                                    */}
			{/* ------------------------------------------------------------------ */}
			<Dialog
				open={paidTarget !== null}
				onOpenChange={(open) => {
					if (!open) setPaidTarget(null);
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Mark as Paid</DialogTitle>
						<DialogDescription>
							Optionally enter a payment reference before confirming.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-1.5 py-2">
						<label className="text-sm font-medium">
							Payment Reference{" "}
							<span className="text-muted-foreground text-xs">
								(optional)
							</span>
						</label>
						<Input
							placeholder="e.g. TXN-20240101-001"
							value={paymentReference}
							onChange={(e) => setPaymentReference(e.target.value)}
						/>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setPaidTarget(null)}
							disabled={markPaidMutation.isPending}
						>
							Cancel
						</Button>
						<Button
							onClick={handleMarkPaidConfirm}
							disabled={markPaidMutation.isPending}
						>
							{markPaidMutation.isPending ? "Processing…" : "Confirm"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
