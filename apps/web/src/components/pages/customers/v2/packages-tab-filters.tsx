"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────────

export type StatusFilter =
	| "all"
	| "active"
	| "expiring_7d"
	| "expiring_30d"
	| "frozen"
	| "expired"
	| "exhausted"
	| "cancelled";

export type InstallmentStatusFilter =
	| "all"
	| "active"
	| "overdue"
	| "locked"
	| "due_soon";

export interface HierarchyNode {
	id: string;
	name: string;
	type: string;
}

export interface InstallmentPlanOption {
	code: string;
	name: string;
}

// ── Chip group component ──────────────────────────────────────────────────────

interface ChipGroupProps<T extends string> {
	options: Array<{ value: T; label: string }>;
	value: T;
	onChange: (v: T) => void;
}

function ChipGroup<T extends string>({
	options,
	value,
	onChange,
}: ChipGroupProps<T>) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					onClick={() => onChange(opt.value)}
					className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all ${
						value === opt.value
							? "bg-foreground text-background shadow-sm"
							: "text-muted-foreground hover:bg-muted hover:text-foreground"
					}`}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

// ── Filter options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "expiring_7d", label: "Expiring 7d" },
	{ value: "expiring_30d", label: "Expiring 30d" },
	{ value: "frozen", label: "Frozen" },
	{ value: "expired", label: "Expired" },
	{ value: "exhausted", label: "Exhausted" },
	{ value: "cancelled", label: "Cancelled" },
];

const INSTALLMENT_STATUS_OPTIONS: Array<{
	value: InstallmentStatusFilter;
	label: string;
}> = [
	{ value: "all", label: "All" },
	{ value: "active", label: "Active" },
	{ value: "overdue", label: "Overdue" },
	{ value: "locked", label: "Locked" },
	{ value: "due_soon", label: "Due Soon" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PackagesTabFiltersProps {
	// Status filter (used when installment toggle is off)
	statusFilter: StatusFilter;
	onStatusFilterChange: (v: StatusFilter) => void;

	// Installment toggle
	hasInstallmentToggle: boolean;
	onInstallmentToggleChange: (v: boolean) => void;

	// Installment-specific filters (used when toggle is on)
	installmentStatusFilter: InstallmentStatusFilter;
	onInstallmentStatusFilterChange: (v: InstallmentStatusFilter) => void;
	planCode: string | undefined;
	onPlanCodeChange: (v: string | undefined) => void;
	planOptions: InstallmentPlanOption[];

	// Branch (hidden when clientUserId is set)
	branchId: string | undefined;
	onBranchIdChange: (v: string | undefined) => void;
	branchOptions: HierarchyNode[];

	// Search (hidden when clientUserId is set)
	search: string;
	onSearchChange: (v: string) => void;

	// Whether to hide per-customer controls
	hideCustomerControls: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PackagesTabFilters({
	statusFilter,
	onStatusFilterChange,
	hasInstallmentToggle,
	onInstallmentToggleChange,
	installmentStatusFilter,
	onInstallmentStatusFilterChange,
	planCode,
	onPlanCodeChange,
	planOptions,
	branchId,
	onBranchIdChange,
	branchOptions,
	search,
	onSearchChange,
	hideCustomerControls,
}: PackagesTabFiltersProps) {
	return (
		<div className="flex flex-col gap-3 border-b px-5 py-4">
			{/* Row 1: chip group + toggle */}
			<div className="flex flex-wrap items-center gap-4">
				{/* Status or installment status chips */}
				{hasInstallmentToggle ? (
					<ChipGroup
						options={INSTALLMENT_STATUS_OPTIONS}
						value={installmentStatusFilter}
						onChange={onInstallmentStatusFilterChange}
					/>
				) : (
					<ChipGroup
						options={STATUS_OPTIONS}
						value={statusFilter}
						onChange={onStatusFilterChange}
					/>
				)}

				{/* Installment toggle — always visible */}
				<div className="ml-auto flex items-center gap-2">
					<Switch
						id="installment-toggle"
						checked={hasInstallmentToggle}
						onCheckedChange={onInstallmentToggleChange}
					/>
					<Label
						htmlFor="installment-toggle"
						className="cursor-pointer text-sm whitespace-nowrap"
					>
						Has installment plan
					</Label>
				</div>
			</div>

			{/* Row 2: plan code select (when toggle on) + branch + search */}
			{(hasInstallmentToggle ||
				(!hideCustomerControls && branchOptions.length > 0) ||
				!hideCustomerControls) && (
				<div className="flex flex-wrap items-center gap-3">
					{/* Plan code select — only when toggle is on */}
					{hasInstallmentToggle && (
						<Select
							value={planCode ?? "all"}
							onValueChange={(v) =>
								onPlanCodeChange(v === "all" ? undefined : v)
							}
						>
							<SelectTrigger className="w-52">
								<SelectValue placeholder="All plans" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All plans</SelectItem>
								{planOptions.map((plan) => (
									<SelectItem key={plan.code} value={plan.code}>
										{plan.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					{/* Branch select — hidden when per-customer */}
					{!hideCustomerControls && branchOptions.length > 0 && (
						<Select
							value={branchId ?? "all"}
							onValueChange={(v) =>
								onBranchIdChange(v === "all" ? undefined : v)
							}
						>
							<SelectTrigger className="w-48">
								<SelectValue placeholder="All branches" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All branches</SelectItem>
								{branchOptions.map((node) => (
									<SelectItem key={node.id} value={node.id}>
										{node.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}

					{/* Search — hidden when per-customer */}
					{!hideCustomerControls && (
						<div className="relative">
							<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search customer…"
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								className="w-60 pl-8 text-sm"
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
