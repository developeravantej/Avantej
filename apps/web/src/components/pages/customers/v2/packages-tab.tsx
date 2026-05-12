"use client";

import { useQuery } from "@tanstack/react-query";
import { Layers, Package } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";
import {
	PackagesTabFilters,
	type StatusFilter,
	type InstallmentStatusFilter,
	type HierarchyNode,
	type InstallmentPlanOption,
} from "./packages-tab-filters";
import { PackagesTabRowDrawer } from "./packages-tab-row-drawer";
import { PackageInstanceRow } from "./package-instance-row";

// ── Inferred API types ────────────────────────────────────────────────────────

type PackageInstanceListAllRow = Awaited<
	ReturnType<typeof client.packageInstances.listAll>
>[number];

type InstallmentOverviewItem = Awaited<
	ReturnType<typeof client.installments.adminOverview>
>["items"][number];

type InstallmentPlan = Awaited<
	ReturnType<typeof client.installmentPlans.list>
>[number];

// listMemberships uses an `as unknown as` cast in the predecessor page; mirror it.
type MembershipFilter =
	| "active"
	| "expiring_7d"
	| "expiring_30d"
	| "frozen"
	| "expired";

type MembershipRow = {
	packageInstanceId: string;
	memberId: string;
	clientId: string;
	clientName: string;
	serviceId: string;
	serviceName: string;
	startsAt: Date | string;
	expiresAt: Date | string | null;
	status: string;
	isLocked: boolean;
	lockedReason: string | null;
	creditsTotal: number;
	creditsRemaining: number;
	daysUntilExpiry: number | null;
	outstandingBalanceCents: number;
};

// ── View-model ────────────────────────────────────────────────────────────────

export type PackageRowVM = {
	id: string;
	clientId: string;
	clientName: string | null;
	serviceId: string;
	serviceName: string | null;
	source: "assigned" | "purchased";
	creditsTotal: number;
	creditsRemaining: number;
	startsAt: string | Date | null;
	expiresAt: string | Date | null;
	status: "active" | "expired" | "exhausted" | "cancelled";
	isLocked: boolean;
	lockedReason: string | null;
	daysUntilExpiry: number | null;
	outstandingBalanceCents: number;
	installment: {
		paymentPlanType: string;
		paymentPlanName: string | null;
		installmentsPaid: number;
		installmentsTotal: number;
		nextDueDate: string | Date | null;
		gracePeriodEndsAt: string | Date | null;
	} | null;
};

// ── Plan info ─────────────────────────────────────────────────────────────────

type PlanInfo = { code: string; name: string; numInstallments: number };

// ── Adapter functions ─────────────────────────────────────────────────────────

function fromMembershipRow(row: MembershipRow): PackageRowVM {
	return {
		id: row.packageInstanceId,
		clientId: row.clientId,
		clientName: row.clientName ?? null,
		serviceId: row.serviceId,
		serviceName: row.serviceName ?? null,
		source: "assigned",
		creditsTotal: row.creditsTotal,
		creditsRemaining: row.creditsRemaining,
		startsAt: row.startsAt,
		expiresAt: row.expiresAt,
		// Narrow status to the VM's union; fall back to "active" for unexpected values
		status: (["active", "expired", "exhausted", "cancelled"] as const).includes(
			row.status as "active" | "expired" | "exhausted" | "cancelled",
		)
			? (row.status as PackageRowVM["status"])
			: "active",
		isLocked: row.isLocked,
		lockedReason: row.lockedReason,
		daysUntilExpiry: row.daysUntilExpiry,
		outstandingBalanceCents: row.outstandingBalanceCents,
		installment: null,
	};
}

function fromInstanceRow(
	row: PackageInstanceListAllRow,
	plansMap: Map<string, PlanInfo>,
): PackageRowVM {
	const daysUntilExpiry =
		row.expiresAt != null
			? Math.ceil((new Date(row.expiresAt).getTime() - Date.now()) / 86400000)
			: null;

	const hasInstallment =
		row.paymentPlanType != null && row.paymentPlanType !== "";

	const installment: PackageRowVM["installment"] = hasInstallment
		? {
				paymentPlanType: row.paymentPlanType as string,
				paymentPlanName: plansMap.get(row.paymentPlanType as string)?.name ?? null,
				installmentsPaid: row.installmentsPaid ?? 0,
				installmentsTotal: row.installmentsTotal ?? 0,
				nextDueDate: row.nextDueDate ?? null,
				gracePeriodEndsAt: row.gracePeriodEndsAt ?? null,
			}
		: null;

	return {
		id: row.id,
		clientId: row.clientId ?? "",
		clientName: row.clientName ?? null,
		serviceId: row.serviceId,
		serviceName: (row as { serviceName?: string | null }).serviceName ?? null,
		// Per audit-swarm MEDIUM: source narrowed from string; hard-default if unexpected
		source:
			row.source === "assigned" || row.source === "purchased"
				? (row.source as "assigned" | "purchased")
				: "assigned",
		creditsTotal: row.creditsTotal,
		creditsRemaining: row.creditsRemaining,
		startsAt: row.startsAt ?? null,
		expiresAt: row.expiresAt ?? null,
		// Per audit-swarm MEDIUM: isLocked/lockedReason/outstandingBalanceCents not on listAll row;
		// silently defaults so Frozen indicator drops on this code path (accepted consequence).
		isLocked: false,
		lockedReason: null,
		daysUntilExpiry,
		outstandingBalanceCents: 0,
		status: row.status as PackageRowVM["status"],
		installment,
	};
}

function fromInstallmentOverview(
	item: InstallmentOverviewItem,
	plansMap: Map<string, PlanInfo>,
): PackageRowVM {
	const daysUntilExpiry =
		item.expiresAt != null
			? Math.ceil((new Date(item.expiresAt).getTime() - Date.now()) / 86400000)
			: null;

	return {
		id: item.id,
		clientId: item.clientId ?? "",
		clientName: (item as { clientName?: string | null }).clientName ?? null,
		serviceId: item.serviceId,
		serviceName: (item as { serviceName?: string | null }).serviceName ?? null,
		source: "assigned",
		creditsTotal: item.creditsTotal,
		creditsRemaining: item.creditsRemaining,
		startsAt: item.startsAt ?? null,
		expiresAt: item.expiresAt ?? null,
		status: item.status as PackageRowVM["status"],
		isLocked: item.isLocked ?? false,
		lockedReason: item.lockedReason ?? null,
		daysUntilExpiry,
		outstandingBalanceCents: 0,
		// adminOverview only returns installment-bearing rows; always set.
		installment: {
			paymentPlanType: item.paymentPlanType as string,
			paymentPlanName:
				plansMap.get(item.paymentPlanType as string)?.name ?? null,
			installmentsPaid: item.installmentsPaid ?? 0,
			installmentsTotal: item.installmentsTotal ?? 0,
			nextDueDate: item.nextDueDate ?? null,
			gracePeriodEndsAt: item.gracePeriodEndsAt ?? null,
		},
	};
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	try {
		const d = value instanceof Date ? value : new Date(value as string);
		if (Number.isNaN(d.getTime())) return "—";
		return d.toISOString().slice(0, 10);
	} catch {
		return "—";
	}
}

function expiryLabel(days: number | null): { text: string; className: string } {
	if (days === null) return { text: "No expiry", className: "text-muted-foreground" };
	if (days <= 0) return { text: "Expired", className: "text-red-600 font-medium" };
	if (days <= 7)
		return { text: `in ${days} day${days !== 1 ? "s" : ""}`, className: "text-red-600 font-medium" };
	if (days <= 30)
		return { text: `in ${days} days`, className: "text-amber-600 font-medium" };
	return { text: `in ${days} days`, className: "text-muted-foreground" };
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

function statusVariant(
	status: PackageRowVM["status"],
	isLocked: boolean,
): "default" | "secondary" | "outline" | "destructive" {
	if (isLocked) return "secondary";
	switch (status) {
		case "active":
			return "default";
		case "expired":
		case "cancelled":
		case "exhausted":
			return "outline";
		default:
			return "outline";
	}
}

function statusLabel(status: PackageRowVM["status"], isLocked: boolean): string {
	if (isLocked) return "Frozen";
	switch (status) {
		case "active":
			return "Active";
		case "expired":
			return "Expired";
		case "exhausted":
			return "Exhausted";
		case "cancelled":
			return "Cancelled";
		default:
			return status;
	}
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TH = "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-5 py-4";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PackagesTabProps {
	organizationId: string;
	/** When set, filter rows to this client and hide search/branch controls. */
	clientUserId?: string;
	/** Hierarchy node ids the viewing member can access. */
	accessibleNodeIds: string[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PackagesTab({
	organizationId,
	clientUserId,
	accessibleNodeIds,
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
}: PackagesTabProps) {
	const { data: userContext } = useUserContext();

	// ── Filter state ─────────────────────────────────────────────────────────────
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [hasInstallmentToggle, setHasInstallmentToggle] = useState(false);
	const [installmentStatusFilter, setInstallmentStatusFilter] =
		useState<InstallmentStatusFilter>("all");
	const [planCode, setPlanCode] = useState<string | undefined>(undefined);
	const [branchId, setBranchId] = useState<string | undefined>(undefined);
	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);

	// Drawer state — wired to PackagesTabRowDrawer
	const [selectedRow, setSelectedRow] = useState<PackageRowVM | null>(null);

	// ── Branch options ────────────────────────────────────────────────────────────
	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const branchOptions: HierarchyNode[] = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);

	// ── Plans query (for plan-name resolution + plan code select) ─────────────────
	const { data: plans = [] } = useQuery({
		queryKey: ["installment-plans", organizationId],
		queryFn: async (): Promise<InstallmentPlan[]> => {
			return client.installmentPlans.list({
				organizationId,
				activeOnly: true,
			});
		},
		enabled: !!organizationId,
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
	});

	const plansMap = useMemo(
		() =>
			new Map<string, PlanInfo>(
				plans.map((p) => [p.code, { code: p.code, name: p.name, numInstallments: p.numInstallments }]),
			),
		[plans],
	);

	const planOptions: InstallmentPlanOption[] = plans.map((p) => ({
		code: p.code,
		name: p.name,
	}));

	// ── Decision rule: which endpoint to call ─────────────────────────────────────
	//
	// | hasInstallmentToggle = true  | installments.adminOverview             |
	// | toggle off + membership filter  | packageInstances.listMemberships    |
	// | toggle off + all/exhausted/cancelled | packageInstances.listAll       |
	//   CRITICAL: pass clientId into listAll when clientUserId is provided
	//   to avoid LIMIT-100 silent clip bug.

	const isMembershipFilter =
		!hasInstallmentToggle &&
		(statusFilter === "active" ||
			statusFilter === "expiring_7d" ||
			statusFilter === "expiring_30d" ||
			statusFilter === "frozen" ||
			statusFilter === "expired");

	// Derive a queryKey mode tag for discrimination
	const queryMode = hasInstallmentToggle
		? "installments"
		: isMembershipFilter
			? "memberships"
			: "listAll";

	const {
		data: rawRows,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"packages-tab",
			organizationId,
			queryMode,
			statusFilter,
			installmentStatusFilter,
			planCode,
			branchId,
			debouncedSearch,
			clientUserId,
		],
		queryFn: async (): Promise<PackageRowVM[]> => {
			if (!organizationId) return [];

			if (hasInstallmentToggle) {
				// Branch 1: installments.adminOverview
				const result = await client.installments.adminOverview({
					organizationId,
					status:
						installmentStatusFilter !== "all"
							? (installmentStatusFilter as "active" | "overdue" | "locked" | "due_soon")
							: undefined,
					paymentPlanCode: planCode,
					search: debouncedSearch || undefined,
					limit: 50,
					offset: 0,
				});
				return result.items.map((item: any) => fromInstallmentOverview(item, plansMap));
			}

			if (isMembershipFilter) {
				// Branch 2: packageInstances.listMemberships (hierarchy-scoped)
				const result = await (
					client.packageInstances as unknown as {
						listMemberships: (input: {
							organizationId: string;
							filter: MembershipFilter;
							branchId?: string;
							limit: number;
							offset: number;
						}) => Promise<{ rows: MembershipRow[]; total: number }>;
					}
				).listMemberships({
					organizationId,
					filter: statusFilter as MembershipFilter,
					branchId: branchId || undefined,
					limit: 100,
					offset: 0,
				});
				return (result.rows ?? []).map((row) => fromMembershipRow(row));
			}

			// Branch 3: packageInstances.listAll
			// CRITICAL: pass clientId when clientUserId is set to avoid LIMIT-100 clip.
			const listAllRows = await client.packageInstances.listAll({
				organizationId,
				status:
					statusFilter !== "all"
						? (statusFilter as "active" | "expired" | "exhausted" | "cancelled")
						: undefined,
				clientId: clientUserId,
				limit: 100,
			});
			return listAllRows.map((r: PackageInstanceListAllRow) => fromInstanceRow(r, plansMap));
		},
		enabled: !!organizationId,
		staleTime: 5 * 60_000,
		refetchOnWindowFocus: false,
	});

	// ── Client-side clientId safety filter ───────────────────────────────────────
	// listMemberships and adminOverview do not accept a clientId param, so we
	// apply an additional client-side filter here as a safety net.
	const rows: PackageRowVM[] = useMemo(() => {
		const all = rawRows ?? [];
		if (!clientUserId) return all;
		return all.filter((r) => r.clientId === clientUserId);
	}, [rawRows, clientUserId]);

	// ── Permission guard ──────────────────────────────────────────────────────────

	if (error) {
		const isForbidden =
			error instanceof Error &&
			(error.message.includes("403") ||
				error.message.toLowerCase().includes("forbidden") ||
				error.message.toLowerCase().includes("permission"));
		if (isForbidden) {
			return (
				<div className="flex min-h-60 items-center justify-center text-muted-foreground">
					<div className="space-y-2 text-center">
						<p className="font-medium">Permission Denied</p>
						<p className="text-sm">You don't have permission to view packages.</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-60 items-center justify-center text-destructive">
				Failed to load packages. Please try again.
			</div>
		);
	}

	// ── Render ────────────────────────────────────────────────────────────────────

	return (
		<>
			{/* Filter bar */}
			<PackagesTabFilters
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
				hasInstallmentToggle={hasInstallmentToggle}
				onInstallmentToggleChange={setHasInstallmentToggle}
				installmentStatusFilter={installmentStatusFilter}
				onInstallmentStatusFilterChange={setInstallmentStatusFilter}
				planCode={planCode}
				onPlanCodeChange={setPlanCode}
				planOptions={planOptions}
				branchId={branchId}
				onBranchIdChange={setBranchId}
				branchOptions={branchOptions}
				search={search}
				onSearchChange={setSearch}
				hideCustomerControls={!!clientUserId}
			/>

			{/* Table */}
			<Table>
				<TableHeader>
					<TableRow className="hover:bg-transparent">
						{/* Customer column — hidden when per-customer (context is implicit) */}
						{!clientUserId && <TableHead className={TH}>Customer</TableHead>}
						<TableHead className={TH}>Package</TableHead>
						<TableHead className={TH}>Credits</TableHead>
						<TableHead className={TH}>Expires</TableHead>
						<TableHead className={TH}>Status</TableHead>
						<TableHead className={TH}>Outstanding</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						Array.from({ length: 5 }).map((_, i) => (
							<TableRow key={i} className="hover:bg-muted/20">
								{!clientUserId && (
									<TableCell className={TD}>
										<div className="flex items-center gap-3.5">
											<Skeleton className="size-9 shrink-0 rounded-full" />
											<Skeleton className="h-3.5 w-28" />
										</div>
									</TableCell>
								)}
								<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
								<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
								<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
								<TableCell className={TD}><Skeleton className="h-3.5 w-16" /></TableCell>
								<TableCell className={TD}><Skeleton className="h-3.5 w-16" /></TableCell>
							</TableRow>
						))
					) : rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={clientUserId ? 5 : 6} className="h-60">
								<div className="flex flex-col items-center justify-center gap-3 text-center">
									<div className="flex size-14 items-center justify-center rounded-full bg-muted">
										<Package className="size-6 text-muted-foreground" />
									</div>
									<p className="text-sm font-medium">No packages found</p>
									<p className="text-xs text-muted-foreground">
										Try adjusting your filters.
									</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => {
							const variant = statusVariant(row.status, row.isLocked);
							const label = statusLabel(row.status, row.isLocked);
							return (
								<PackageInstanceRow
									key={row.id}
									row={row}
									showCustomer={!clientUserId}
									variant={variant}
									label={label}
									onClick={() => setSelectedRow(row)}
								/>
							);
						})
					)}
				</TableBody>
			</Table>

			<PackagesTabRowDrawer
				open={selectedRow !== null}
				onOpenChange={(v) => {
					if (!v) setSelectedRow(null);
				}}
				row={selectedRow}
				organizationId={organizationId}
				canWrite={true}
			/>
		</>
	);
}
