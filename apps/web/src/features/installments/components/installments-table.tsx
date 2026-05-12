import { ChevronDown, ChevronUp, CreditCard, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { formatPrice } from "@/lib/money";
import type { InstallmentOverviewItem, InstallmentPlan } from "../types";
import { formatDate } from "../utils";
import { StatusBadge } from "./status-badges";

const STATUS_TABS = [
	{ value: undefined, label: "All" },
	{ value: "active" as const, label: "Active" },
	{ value: "due_soon" as const, label: "Due Soon" },
	{ value: "overdue" as const, label: "Overdue" },
	{ value: "locked" as const, label: "Locked" },
];

interface InstallmentsTableProps {
	instances: InstallmentOverviewItem[];
	isLoading: boolean;
	plansMap: Map<string, { code: string; name: string; numInstallments: number }>;
	plans: InstallmentPlan[] | undefined;
	statusFilter: "active" | "overdue" | "locked" | "due_soon" | undefined;
	setStatusFilter: (v: "active" | "overdue" | "locked" | "due_soon" | undefined) => void;
	showFilters: boolean;
	setShowFilters: (v: (prev: boolean) => boolean) => void;
	searchQuery: string;
	setSearchQuery: (v: string) => void;
	dueBefore: string | undefined;
	setDueBefore: (v: string | undefined) => void;
	dueAfter: string | undefined;
	setDueAfter: (v: string | undefined) => void;
	planCode: string | undefined;
	setPlanCode: (v: string | undefined) => void;
	activeFilterCount: number;
	onRowClick: (instance: InstallmentOverviewItem) => void;
}

export function InstallmentsTable({
	instances,
	isLoading,
	plansMap,
	plans,
	statusFilter,
	setStatusFilter,
	showFilters,
	setShowFilters,
	searchQuery,
	setSearchQuery,
	dueBefore,
	setDueBefore,
	dueAfter,
	setDueAfter,
	planCode,
	setPlanCode,
	activeFilterCount,
	onRowClick,
}: InstallmentsTableProps) {
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
							const rowPlanCode = row.paymentPlanType;
							const planLabel = rowPlanCode
								? (plansMap.get(rowPlanCode)?.name ??
									String(rowPlanCode)
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
									onClick={() => onRowClick(row)}
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
										<div className="flex flex-wrap items-center gap-1.5">
											<StatusBadge instance={row} />
											{(row as { allowCreditOverdraft?: boolean }).allowCreditOverdraft && (
												<span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
													Overdraft
												</span>
											)}
										</div>
									</TableCell>
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>
		</>
	);
}
