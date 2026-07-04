import {
	MapPin,
	Clock,
	Pencil,
	BarChart2,
	Trash2,
	Loader2,
	Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/money";

import { KpiTile } from "./KpiTile";
import { OpeningHoursTable } from "./OpeningHoursTable";
import type { NodeWithStats } from "./types";

// ─── Detail Panel ──────────────────────────────────────────────────────────────

export function NodeDetailPanel({
	node,
	breadcrumb,
	onEdit,
	onDelete,
	canDelete,
	isDeleting,
	taxRateName,
}: {
	node: NodeWithStats;
	breadcrumb: string[];
	onEdit: () => void;
	onDelete: () => void;
	canDelete: boolean;
	isDeleting: boolean;
	/** Resolved name of the branch's tax-rate override (WS3), if any. */
	taxRateName?: string | null;
}) {
	// The organization root can never be deleted; only countries/states/branches.
	const isOrgRoot = node.type === "organization";

	// WS3 company/tax profile — only shown for branches that have any set.
	const hasCompanyTax =
		node.type === "branch" &&
		!!(
			node.companyLegalName ||
			node.registrationNumber ||
			node.taxId ||
			node.invoicePrefix ||
			node.receiptPrefix ||
			node.branchTaxRateId
		);
	const membersValue =
		node.membersCount != null ? String(node.membersCount) : "—";
	const staffValue = node.staffCount != null ? String(node.staffCount) : "—";
	const revenueValue =
		node.monthRevenueCents != null
			? formatPrice(node.monthRevenueCents, node.currency ?? "MYR")
			: "—";

	// Breadcrumb path: all ancestors except the node itself
	const ancestorPath = breadcrumb.slice(0, -1).join(" · ");

	return (
		<div className="flex flex-col h-full overflow-hidden bg-white border border-[#e5e5e5] rounded-2xl">
			{/* Header */}
			<div className="p-6 pb-4 border-b border-[#e5e5e5]">
				<div className="flex items-start justify-between gap-4">
					<div className="min-w-0">
						{ancestorPath && (
							<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373] mb-1">
								{ancestorPath}
							</p>
						)}
						<h2 className="text-xl font-bold text-[#0a0a0a] leading-tight">
							{node.name}
						</h2>
						{node.address && (
							<p className="text-sm text-[#737373] mt-1 flex items-start gap-1.5">
								<MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
								{node.address}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Scrollable body */}
			<div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
				{/* 3 KPI tiles */}
				<div className="grid grid-cols-3 gap-3">
					<KpiTile
						label="Members"
						value={membersValue}
						sub="total"
						stale={node.stale && node.membersCount == null}
					/>
					<KpiTile
						label="Revenue / mo"
						value={revenueValue}
						sub="this month"
						stale={node.stale && node.monthRevenueCents == null}
					/>
					<KpiTile
						label="Staff"
						value={staffValue}
						sub="total"
						stale={node.stale && node.staffCount == null}
					/>
				</div>

				{/* Opening hours card */}
				<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
					<div className="flex items-center gap-2 mb-3">
						<Clock className="h-3.5 w-3.5 text-[#737373]" />
						<p className="text-sm font-semibold text-[#0a0a0a]">
							Opening Hours
						</p>
					</div>
					<OpeningHoursTable hours={node.openingHours} />
				</div>

				{/* Company & Tax card (WS3) — branches with a profile only */}
				{hasCompanyTax && (
					<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
						<div className="flex items-center gap-2 mb-3">
							<Building2 className="h-3.5 w-3.5 text-[#737373]" />
							<p className="text-sm font-semibold text-[#0a0a0a]">
								Company &amp; Tax
							</p>
						</div>
						<dl className="space-y-2 text-sm">
							{node.companyLegalName && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Legal name</dt>
									<dd className="text-[#0a0a0a] text-right">
										{node.companyLegalName}
									</dd>
								</div>
							)}
							{node.registrationNumber && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Registration no.</dt>
									<dd className="text-[#0a0a0a] text-right">
										{node.registrationNumber}
									</dd>
								</div>
							)}
							{node.taxId && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Tax ID</dt>
									<dd className="text-[#0a0a0a] text-right">{node.taxId}</dd>
								</div>
							)}
							{node.invoicePrefix && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Invoice prefix</dt>
									<dd className="text-[#0a0a0a] text-right font-mono text-xs">
										{node.invoicePrefix}
									</dd>
								</div>
							)}
							{node.receiptPrefix && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Receipt prefix</dt>
									<dd className="text-[#0a0a0a] text-right font-mono text-xs">
										{node.receiptPrefix}
									</dd>
								</div>
							)}
							{node.branchTaxRateId && (
								<div className="flex justify-between gap-4">
									<dt className="text-[#737373] shrink-0">Tax rate</dt>
									<dd className="text-[#0a0a0a] text-right">
										{taxRateName ?? "Custom override"}
									</dd>
								</div>
							)}
						</dl>
					</div>
				)}

				{/* Stale warning */}
				{node.stale && (
					<p className="text-xs text-[#737373] italic">
						Stats are warming up (cache miss). Refresh in a few seconds.
					</p>
				)}
			</div>

			{/* Action toolbar — pinned at bottom */}
			<div className="shrink-0 border-t border-[#e5e5e5] p-4 flex items-center gap-2 bg-white">
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5"
					onClick={onEdit}
				>
					<Pencil className="h-3.5 w-3.5" />
					Edit Branch
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5"
					disabled
				>
					<BarChart2 className="h-3.5 w-3.5" />
					View Performance
				</Button>
				<Button
					variant="outline"
					size="sm"
					className="flex-1 text-xs gap-1.5 text-rose-600 border-rose-200 hover:bg-rose-50"
					onClick={onDelete}
					disabled={!canDelete || isOrgRoot || isDeleting}
					title={
						isOrgRoot
							? "The organization root cannot be deleted"
							: !canDelete
								? "Requires hierarchy_management:delete permission"
								: undefined
					}
				>
					{isDeleting ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : (
						<Trash2 className="h-3.5 w-3.5" />
					)}
					Delete
				</Button>
			</div>
		</div>
	);
}
