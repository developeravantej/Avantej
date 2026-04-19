import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ProcessRefundDialog } from "@/components/refunds/process-refund-dialog";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/refunds/view",
)({
	component: RefundsLedgerPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type RefundStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "processed"
	| "cancelled";

type RefundRow = {
	id: string;
	refundNumber: string;
	status: string;
	salesOrderId: string | null;
	paymentId: string | null;
	packageInstanceId: string | null;
	amountCents: number;
	taxAmountCents: number;
	reason: string;
	notes: string | null;
	requestedBy: string;
	requestedAt: string | Date;
	reviewedBy: string | null;
	reviewedAt: string | Date | null;
	reviewNotes: string | null;
	processedBy: string | null;
	processedAt: string | Date | null;
	refundMethod: string | null;
	refundReference: string | null;
	customerId: string;
	customerName: string;
	// Enriched fields from backend join
	requestedByName?: string | null;
	salesOrderNumber?: string | null;
};

// ─── Status tab definition ─────────────────────────────────────────────────────

const STATUS_TABS: { value: RefundStatus | "all"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pending", label: "Pending" },
	{ value: "approved", label: "Approved" },
	{ value: "rejected", label: "Rejected" },
	{ value: "processed", label: "Processed" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY");
	} catch {
		return "—";
	}
}

function formatDateTime(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

function StatusBadge({ status }: { status: string }) {
	const configs: Record<string, { className: string; label: string }> = {
		pending: {
			className:
				"bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
			label: "Pending",
		},
		approved: {
			className: "bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-100",
			label: "Approved",
		},
		rejected: {
			className: "bg-red-100 text-red-800 border-red-200 hover:bg-red-100",
			label: "Rejected",
		},
		processed: {
			className:
				"bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
			label: "Processed",
		},
		cancelled: {
			className: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100",
			label: "Cancelled",
		},
	};
	const cfg = configs[status] ?? { className: "", label: status };
	return <Badge className={cfg.className}>{cfg.label}</Badge>;
}

function TargetCell({ refund }: { refund: RefundRow }) {
	if (refund.salesOrderId) {
		const label = refund.salesOrderNumber
			? `Sale ${refund.salesOrderNumber}`
			: `Sale ${refund.salesOrderId.slice(0, 8)}…`;
		return (
			<Link
				to="/dashboard/sales/$id"
				params={{ id: refund.salesOrderId }}
				className="font-mono text-primary text-sm hover:underline"
			>
				{label}
			</Link>
		);
	}
	if (refund.paymentId) {
		return (
			<span className="font-mono text-muted-foreground text-sm">
				Payment {refund.paymentId.slice(0, 8)}…
			</span>
		);
	}
	if (refund.packageInstanceId) {
		return (
			<span className="font-mono text-muted-foreground text-sm">
				Package {refund.packageInstanceId.slice(0, 8)}…
			</span>
		);
	}
	return <span className="text-muted-foreground">—</span>;
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function RefundDetailDrawer({
	refund,
	open,
	onOpenChange,
	organizationId,
}: {
	refund: RefundRow | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
}) {
	// Audit trail for this refund
	const { data: auditData } = useQuery({
		queryKey: ["audit-refund", organizationId, refund?.id],
		queryFn: async () => {
			if (!refund?.id) return { rows: [] };
			return client.auditLogs.list({
				organizationId,
				entityType: "refund",
				entityId: refund.id,
				limit: 20,
				offset: 0,
			});
		},
		enabled: open && !!refund?.id,
	});

	if (!refund) return null;

	const auditRows = (auditData as any)?.rows ?? [];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-xl">
				<SheetHeader>
					<SheetTitle>Refund Details</SheetTitle>
					<SheetDescription>
						Full information and audit trail for {refund.refundNumber}.
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-col gap-5 px-1 py-4">
					{/* Core info */}
					<div className="space-y-3 rounded-lg border p-4">
						<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							Refund Info
						</h3>
						<div className="grid grid-cols-2 gap-3 text-sm">
							<div>
								<p className="text-muted-foreground">Refund #</p>
								<p className="font-medium font-mono">{refund.refundNumber}</p>
							</div>
							<div>
								<p className="text-muted-foreground">Status</p>
								<StatusBadge status={refund.status} />
							</div>
							<div>
								<p className="text-muted-foreground">Customer</p>
								<p className="font-medium">{refund.customerName}</p>
							</div>
							<div>
								<p className="text-muted-foreground">Amount</p>
								<p className="font-medium">
									{formatPrice(refund.amountCents, "MYR")}
								</p>
							</div>
							{refund.taxAmountCents > 0 && (
								<div>
									<p className="text-muted-foreground">Tax</p>
									<p className="font-medium">
										{formatPrice(refund.taxAmountCents, "MYR")}
									</p>
								</div>
							)}
							<div>
								<p className="text-muted-foreground">Requested At</p>
								<p className="font-medium">
									{formatDateTime(refund.requestedAt)}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground">Requested By</p>
								<p className="font-medium">
									{refund.requestedByName ??
										refund.requestedBy.slice(0, 8) + "…"}
								</p>
							</div>
							<div className="col-span-2">
								<p className="text-muted-foreground">Reason</p>
								<p className="font-medium">{refund.reason}</p>
							</div>
							{refund.notes && (
								<div className="col-span-2">
									<p className="text-muted-foreground">Notes</p>
									<p className="font-medium">{refund.notes}</p>
								</div>
							)}
						</div>
					</div>

					{/* Review info */}
					{(refund.reviewedBy || refund.reviewNotes) && (
						<div className="space-y-3 rounded-lg border p-4">
							<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Review
							</h3>
							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<p className="text-muted-foreground">Reviewed At</p>
									<p className="font-medium">
										{formatDateTime(refund.reviewedAt)}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground">Reviewed By</p>
									<p className="font-medium">
										{refund.reviewedBy?.slice(0, 8) ?? "—"}…
									</p>
								</div>
								{refund.reviewNotes && (
									<div className="col-span-2">
										<p className="text-muted-foreground">Review Notes</p>
										<p className="font-medium">{refund.reviewNotes}</p>
									</div>
								)}
							</div>
						</div>
					)}

					{/* Processing info */}
					{refund.status === "processed" && refund.processedAt && (
						<div className="space-y-3 rounded-lg border p-4">
							<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
								Processing
							</h3>
							<div className="grid grid-cols-2 gap-3 text-sm">
								<div>
									<p className="text-muted-foreground">Processed At</p>
									<p className="font-medium">
										{formatDateTime(refund.processedAt)}
									</p>
								</div>
								<div>
									<p className="text-muted-foreground">Method</p>
									<p className="font-medium capitalize">
										{refund.refundMethod?.replace(/_/g, " ") ?? "—"}
									</p>
								</div>
								{refund.refundReference && (
									<div className="col-span-2">
										<p className="text-muted-foreground">Reference</p>
										<p className="font-medium font-mono">
											{refund.refundReference}
										</p>
									</div>
								)}
							</div>
						</div>
					)}

					<Separator />

					{/* Audit trail */}
					<div className="space-y-3">
						<h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
							Audit Trail
						</h3>
						{auditRows.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								No audit events found.
							</p>
						) : (
							<div className="space-y-2">
								{auditRows.map((row: any) => (
									<div
										key={row.id}
										className="space-y-1 rounded-md border px-3 py-2 text-sm"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="rounded border border-orange-200 bg-orange-100 px-1.5 py-0.5 font-mono text-orange-800 text-xs">
												{row.action}
											</span>
											<span className="text-muted-foreground text-xs">
												{formatDateTime(row.createdAt)}
											</span>
										</div>
										<p className="text-muted-foreground text-xs">
											{row.summary}
										</p>
										{row.actorName && (
											<p className="text-xs">By: {row.actorName}</p>
										)}
									</div>
								))}
							</div>
						)}
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

// ─── Reject dialog ─────────────────────────────────────────────────────────────

function RejectDialog({
	open,
	onOpenChange,
	onConfirm,
	isPending,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (notes: string) => void;
	isPending: boolean;
}) {
	const [notes, setNotes] = useState("");

	function handleConfirm() {
		if (!notes.trim()) return;
		onConfirm(notes.trim());
	}

	function handleClose() {
		setNotes("");
		onOpenChange(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) handleClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Reject Refund</DialogTitle>
					<DialogDescription>
						Provide a reason for rejection. This will be visible in the audit
						trail.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3 py-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="reject-notes">
							Rejection Notes <span className="text-destructive">*</span>
						</Label>
						<Textarea
							id="reject-notes"
							rows={3}
							placeholder="Explain why this refund is being rejected…"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={handleClose} disabled={isPending}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={isPending || !notes.trim()}
					>
						{isPending ? "Rejecting…" : "Reject"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Main page ────────────────────────────────────────────────────────────────

function RefundsLedgerPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	// Permissions
	const canApprove = hasPermission("refund_management:approve");
	const canProcess = hasPermission("refund_management:process");

	// ── State ──────────────────────────────────────────────────────────────────
	const [activeTab, setActiveTab] = useState<RefundStatus | "all">("all");
	const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
	const [selectedRefund, setSelectedRefund] = useState<RefundRow | null>(null);
	const [processDialogOpen, setProcessDialogOpen] = useState(false);
	const [processRefundId, setProcessRefundId] = useState<string | null>(null);
	const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
	const [rejectRefundId, setRejectRefundId] = useState<string | null>(null);
	const [approveRefundId, setApproveRefundId] = useState<string | null>(null);

	// ── Data ───────────────────────────────────────────────────────────────────
	const { data, isLoading } = useQuery({
		queryKey: ["refunds", organizationId, activeTab],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			return (client as any).refunds.list({
				organizationId,
				status: activeTab === "all" ? undefined : activeTab,
				limit: 100,
				offset: 0,
			});
		},
		enabled: !!organizationId,
	});

	const rows: RefundRow[] = (data as any)?.rows ?? [];

	// ── Mutations ──────────────────────────────────────────────────────────────
	const approveMutation = useMutation({
		mutationFn: (vars: { id: string; reviewNotes?: string }) =>
			(client as any).refunds.approve({
				organizationId,
				id: vars.id,
				reviewNotes: vars.reviewNotes,
			}),
		onSuccess: () => {
			toast.success("Refund approved.");
			queryClient.invalidateQueries({ queryKey: ["refunds", organizationId] });
			setApproveRefundId(null);
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to approve refund."),
	});

	const rejectMutation = useMutation({
		mutationFn: (vars: { id: string; reviewNotes: string }) =>
			(client as any).refunds.reject({
				organizationId,
				id: vars.id,
				reviewNotes: vars.reviewNotes,
			}),
		onSuccess: () => {
			toast.success("Refund rejected.");
			queryClient.invalidateQueries({ queryKey: ["refunds", organizationId] });
			setRejectDialogOpen(false);
			setRejectRefundId(null);
		},
		onError: (err: Error) =>
			toast.error(err.message ?? "Failed to reject refund."),
	});

	// ── Helpers ────────────────────────────────────────────────────────────────
	function openDetail(refund: RefundRow) {
		setSelectedRefund(refund);
		setDetailDrawerOpen(true);
	}

	function openProcess(refund: RefundRow) {
		setProcessRefundId(refund.id);
		setProcessDialogOpen(true);
	}

	function openReject(refund: RefundRow) {
		setRejectRefundId(refund.id);
		setRejectDialogOpen(true);
	}

	// ── Columns ────────────────────────────────────────────────────────────────
	const columns: ColumnDef<RefundRow>[] = [
		{
			id: "requestedAt",
			header: "Date",
			cell: ({ row }) => (
				<span className="whitespace-nowrap text-sm">
					{formatDate(row.original.requestedAt)}
				</span>
			),
		},
		{
			id: "refundNumber",
			header: "Refund #",
			cell: ({ row }) => <CopyableCell value={row.original.refundNumber} />,
		},
		{
			id: "customerName",
			header: "Customer",
			cell: ({ row }) => (
				<span className="text-sm">{row.original.customerName}</span>
			),
		},
		{
			id: "target",
			header: "Target",
			cell: ({ row }) => <TargetCell refund={row.original} />,
		},
		{
			id: "amountCents",
			header: "Amount",
			cell: ({ row }) => (
				<span className="font-medium text-sm tabular-nums">
					{formatPrice(row.original.amountCents, "MYR")}
				</span>
			),
		},
		{
			id: "reason",
			header: "Reason",
			cell: ({ row }) => (
				<span
					className="block max-w-[180px] truncate text-sm"
					title={row.original.reason}
				>
					{row.original.reason}
				</span>
			),
		},
		{
			id: "requestedByName",
			header: "Requested By",
			cell: ({ row }) => (
				<span className="text-sm">
					{row.original.requestedByName ??
						`${row.original.requestedBy.slice(0, 8)}…`}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => <StatusBadge status={row.original.status} />,
		},
		{
			id: "actions",
			header: "",
			cell: ({ row }) => {
				const r = row.original;
				return (
					<div className="flex items-center gap-1.5">
						{r.status === "pending" && canApprove && (
							<>
								<Button
									size="sm"
									variant="outline"
									className="border-green-300 text-green-700 hover:bg-green-50"
									onClick={(e) => {
										e.stopPropagation();
										setApproveRefundId(r.id);
										approveMutation.mutate({ id: r.id });
									}}
									disabled={
										approveMutation.isPending && approveRefundId === r.id
									}
								>
									{approveMutation.isPending && approveRefundId === r.id
										? "Approving…"
										: "Approve"}
								</Button>
								<Button
									size="sm"
									variant="outline"
									className="border-destructive/40 text-destructive hover:bg-destructive/5"
									onClick={(e) => {
										e.stopPropagation();
										openReject(r);
									}}
								>
									Reject
								</Button>
							</>
						)}
						{r.status === "approved" && canProcess && (
							<Button
								size="sm"
								variant="outline"
								onClick={(e) => {
									e.stopPropagation();
									openProcess(r);
								}}
							>
								Mark Processed
							</Button>
						)}
						{(r.status === "processed" || r.status === "rejected") && (
							<Button
								size="sm"
								variant="ghost"
								onClick={(e) => {
									e.stopPropagation();
									openDetail(r);
								}}
							>
								View Details
							</Button>
						)}
					</div>
				);
			},
		},
	];

	// ── Guard ──────────────────────────────────────────────────────────────────
	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view refunds.
			</div>
		);
	}

	if (!hasPermission("refund_management:read")) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				You do not have permission to view refunds.
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

	// ── Render ─────────────────────────────────────────────────────────────────
	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
					<Undo2 className="h-5 w-5 text-primary" />
				</div>
				<div>
					<h1 className="font-bold font-heading text-2xl">Refunds</h1>
					<p className="text-muted-foreground text-sm">
						Review and process refund requests.
					</p>
				</div>
			</div>

			{/* Status tabs */}
			<div className="flex items-center gap-1 border-b">
				{STATUS_TABS.map((tab) => {
					const isActive = activeTab === tab.value;
					return (
						<button
							key={tab.value}
							type="button"
							onClick={() => setActiveTab(tab.value)}
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
			<DataTable<RefundRow, unknown> columns={columns} data={rows} />

			{/* Detail drawer */}
			<RefundDetailDrawer
				refund={selectedRefund}
				open={detailDrawerOpen}
				onOpenChange={setDetailDrawerOpen}
				organizationId={organizationId}
			/>

			{/* Process dialog */}
			{processRefundId && (
				<ProcessRefundDialog
					open={processDialogOpen}
					onOpenChange={(open) => {
						setProcessDialogOpen(open);
						if (!open) setProcessRefundId(null);
					}}
					organizationId={organizationId}
					refundId={processRefundId}
				/>
			)}

			{/* Reject dialog */}
			<RejectDialog
				open={rejectDialogOpen}
				onOpenChange={setRejectDialogOpen}
				onConfirm={(notes) => {
					if (!rejectRefundId) return;
					rejectMutation.mutate({ id: rejectRefundId, reviewNotes: notes });
				}}
				isPending={rejectMutation.isPending}
			/>
		</div>
	);
}
