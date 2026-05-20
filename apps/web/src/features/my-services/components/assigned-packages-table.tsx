import { useState } from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Package } from "lucide-react";
import { AssignedPackageDrawer } from "./assigned-package-drawer";
import { useAssignedPackages, type AssignedPackage } from "../api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateStr(value: string | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleDateString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	} catch {
		return value;
	}
}

function StatusBadge({ status }: { status: AssignedPackage["status"] }) {
	if (status === "frozen") {
		return (
			<Badge className="bg-blue-100 text-blue-700 border-blue-200">
				Frozen
			</Badge>
		);
	}
	return (
		<Badge className="bg-green-100 text-green-700 border-green-200">
			Active
		</Badge>
	);
}

// ---------------------------------------------------------------------------
// KPI strip
// ---------------------------------------------------------------------------

interface KpiStripProps {
	items: AssignedPackage[];
}

function KpiStrip({ items }: KpiStripProps) {
	const total = items.length;
	const active = items.filter((i) => i.status === "active").length;
	const frozen = items.filter((i) => i.status === "frozen").length;

	return (
		<div className="grid grid-cols-3 gap-3">
			<div className="rounded-xl border bg-white p-4 shadow-sm">
				<p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
					Total Assigned
				</p>
				<p className="text-2xl font-bold tabular-nums mt-1">{total}</p>
			</div>
			<div className="rounded-xl border bg-white p-4 shadow-sm">
				<p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
					Active
				</p>
				<p className="text-2xl font-bold tabular-nums mt-1 text-green-600">
					{active}
				</p>
			</div>
			<div className="rounded-xl border bg-white p-4 shadow-sm">
				<p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
					Frozen
				</p>
				<p className="text-2xl font-bold tabular-nums mt-1 text-blue-600">
					{frozen}
				</p>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface AssignedPackagesTableProps {
	organizationId: string;
}

export function AssignedPackagesTable({
	organizationId,
}: AssignedPackagesTableProps) {
	const [statusFilter, setStatusFilter] = useState<
		"all" | "active" | "frozen"
	>("all");
	const [selectedPkg, setSelectedPkg] = useState<AssignedPackage | null>(null);

	const query = useAssignedPackages(
		organizationId,
		statusFilter === "all" ? undefined : statusFilter,
	);

	// Flatten pages into a single items array
	const allItems: AssignedPackage[] =
		query.data?.pages.flatMap((p) => p.items) ?? [];

	const hasNextPage = query.hasNextPage;

	// ── Render ─────────────────────────────────────────────────────────────

	if (query.isLoading) {
		return (
			<div className="space-y-4">
				<div className="h-24 rounded-xl border bg-muted/30 animate-pulse" />
				<div className="h-48 rounded-xl border bg-muted/30 animate-pulse" />
			</div>
		);
	}

	if (query.isError) {
		return (
			<div className="flex flex-col items-center justify-center py-12 gap-3">
				<p className="font-medium text-destructive">
					Failed to load assigned packages.
				</p>
				<Button variant="outline" onClick={() => query.refetch()}>
					Try Again
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* KPI strip — always show totals across all statuses */}
			<KpiStrip items={allItems} />

			{/* Filter bar */}
			<div className="flex items-center gap-3">
				<Select
					value={statusFilter}
					onValueChange={(v) =>
						setStatusFilter(v as "all" | "active" | "frozen")
					}
				>
					<SelectTrigger className="w-40">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All Statuses</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="frozen">Frozen</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Table */}
			{allItems.length === 0 ? (
				<EmptyState
					icon={Package}
					title="No packages assigned"
					description="No packages assigned. When an admin assigns a package to you, it'll show up here."
					data-testid="assigned-packages-empty"
				/>
			) : (
				<div className="rounded-xl border bg-white shadow-sm overflow-hidden">
					<Table data-testid="assigned-packages-table">
						<TableHeader>
							<TableRow>
								<TableHead>Client</TableHead>
								<TableHead>Service</TableHead>
								<TableHead className="text-right">Credits Remaining</TableHead>
								<TableHead>Next Due</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="w-20" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{allItems.map((pkg) => (
								<TableRow key={pkg.id}>
									<TableCell className="font-medium">
										{pkg.clientDisplayName}
									</TableCell>
									<TableCell className="text-muted-foreground">
										{pkg.serviceName}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{pkg.creditsRemaining}
									</TableCell>
									<TableCell>{formatDateStr(pkg.nextDueDate)}</TableCell>
									<TableCell>
										<StatusBadge status={pkg.status} />
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => setSelectedPkg(pkg)}
										>
											View
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>

					{/* Load more */}
					{hasNextPage && (
						<div className="flex justify-center py-4 border-t">
							<Button
								variant="outline"
								size="sm"
								onClick={() => query.fetchNextPage()}
								disabled={query.isFetchingNextPage}
							>
								{query.isFetchingNextPage ? "Loading..." : "Load More"}
							</Button>
						</div>
					)}
				</div>
			)}

			{/* Detail drawer */}
			<AssignedPackageDrawer
				pkg={selectedPkg}
				open={!!selectedPkg}
				onClose={() => setSelectedPkg(null)}
			/>
		</div>
	);
}
