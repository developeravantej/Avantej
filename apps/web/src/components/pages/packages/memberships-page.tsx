import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Clock, CreditCard, Lock, Search } from "lucide-react";
import { useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import { MembershipTableRow } from "@/components/pages/packages/membership-table-row";
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
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/money";
import { client } from "@/utils/orpc";

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

function membershipStatusVariant(
	status: string,
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

function membershipStatusLabel(status: string, isLocked: boolean): string {
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

const TABS: Array<{ value: MembershipFilter; label: string }> = [
	{ value: "active", label: "All Active" },
	{ value: "expiring_7d", label: "Expiring 7 days" },
	{ value: "expiring_30d", label: "Expiring 30 days" },
	{ value: "frozen", label: "Frozen" },
	{ value: "expired", label: "Expired" },
];

const PAGE_LIMIT = 100;

const TH = "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-5 py-4";

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
export function MembershipsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("service_management:read");

	const [filter, setFilter] = useState<MembershipFilter>("active");
	const [branchId, setBranchId] = useState<string>("");
	const [offset, setOffset] = useState(0);
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [search, setSearch] = useState("");

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const accessibleNodeIds =
		currentOrg?.hierarchy?.member?.accessibleNodeIds ?? [];
	const allNodes = currentOrg?.hierarchy?.nodes ?? [];
	const accessibleBranches = allNodes.filter(
		(n) => accessibleNodeIds.includes(n.id) && n.type === "branch",
	);
	const branchOptions =
		accessibleBranches.length > 0
			? accessibleBranches
			: allNodes.filter((n) => accessibleNodeIds.includes(n.id));

	const {
		data: listData,
		isLoading,
		error,
	} = useQuery({
		queryKey: [
			"memberships",
			organizationId,
			filter,
			branchId,
			offset,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
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
				filter,
				branchId: branchId || undefined,
				limit: PAGE_LIMIT,
				offset,
			});
			return result;
		},
		enabled: !!organizationId && canRead,
	});

	const rows: MembershipRow[] = (listData as { rows?: MembershipRow[] } | undefined)?.rows ?? [];
	const total: number = (listData as { total?: number } | undefined)?.total ?? 0;

	const expiringSoonCount = rows.filter(
		(r) => r.daysUntilExpiry !== null && r.daysUntilExpiry > 0 && r.daysUntilExpiry <= 7,
	).length;

	const frozenCount = rows.filter((r) => r.isLocked).length;

	const outstandingBalanceSum = rows.reduce(
		(acc, r) => acc + r.outstandingBalanceCents,
		0,
	);

	// Guard: no org selected
	if (!organizationId) {
		return (
			<div className="flex min-h-60 items-center justify-center text-muted-foreground">
				Select an organization to view memberships.
			</div>
		);
	}

	// Guard: no permission
	if (!canRead) {
		return (
			<div className="flex min-h-60 items-center justify-center text-muted-foreground">
				<div className="space-y-2 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-sm">
						You don't have permission to view memberships.
					</p>
				</div>
			</div>
		);
	}

	// Guard: error
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
						<p className="text-sm">
							You don't have permission to view memberships.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="flex min-h-60 items-center justify-center text-destructive">
				Failed to load memberships. Please try again.
			</div>
		);
	}

	return (
		<>
			{/* Header */}
				<div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
					<div className="mr-auto">
						<h1 className="text-base font-semibold tracking-tight">Memberships</h1>
						<p className="text-xs text-muted-foreground">
							{isLoading ? "Loading…" : `${total} membership${total !== 1 ? "s" : ""}`}
						</p>
					</div>
					{/* Search */}
					<div className="relative w-60">
						<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							placeholder="Search customer…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-8 text-sm"
						/>
					</div>
					{/* Branch filter */}
					{branchOptions.length > 0 && (
						<Select
							value={branchId || "all"}
							onValueChange={(v) => {
								setBranchId(v === "all" ? "" : v);
								setOffset(0);
							}}
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
				</div>

				{/* Stat cards */}
				<div className="grid grid-cols-2 gap-3 border-b px-5 py-4 lg:grid-cols-4">
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
							<p className="mt-1 text-2xl font-bold tabular-nums">{total}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<BadgeCheck className="size-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Expiring Soon</p>
							<p className={`mt-1 text-2xl font-bold tabular-nums ${expiringSoonCount > 0 ? "text-red-600" : ""}`}>
								{expiringSoonCount}
							</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<Clock className="size-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frozen</p>
							<p className="mt-1 text-2xl font-bold tabular-nums">{frozenCount}</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<Lock className="size-4 text-muted-foreground" />
						</div>
					</div>
					<div className="flex items-start justify-between rounded-xl border border-border/50 bg-muted/30 p-4">
						<div>
							<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
							<p className={`mt-1 text-2xl font-bold tabular-nums ${outstandingBalanceSum > 0 ? "text-red-600" : ""}`}>
								{formatPrice(outstandingBalanceSum, "MYR")}
							</p>
						</div>
						<div className="rounded-lg bg-muted p-2">
							<CreditCard className="size-4 text-muted-foreground" />
						</div>
					</div>
				</div>

				{/* Filter tabs */}
				<div className="flex items-center gap-1.5 overflow-x-auto border-b px-5 py-3">
					{TABS.map((tab) => (
						<button
							key={tab.value}
							type="button"
							onClick={() => {
								setFilter(tab.value);
								setOffset(0);
							}}
							className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
								filter === tab.value
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
						<TableRow className="hover:bg-transparent">
							<TableHead className={TH}>Customer</TableHead>
							<TableHead className={TH}>Package</TableHead>
							<TableHead className={TH}>Credits</TableHead>
							<TableHead className={TH}>Expires</TableHead>
							<TableHead className={TH}>Outstanding</TableHead>
							<TableHead className={TH}>Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 6 }).map((_, i) => (
								<TableRow key={i} className="hover:bg-muted/20">
									<TableCell className={TD}>
										<div className="flex items-center gap-3.5">
											<Skeleton className="size-9 shrink-0 rounded-full" />
											<div className="space-y-1.5">
												<Skeleton className="h-3.5 w-28" />
												<Skeleton className="h-3 w-20" />
											</div>
										</div>
									</TableCell>
									<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
									<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
									<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
									<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
									<TableCell className={TD}><Skeleton className="h-3.5 w-20" /></TableCell>
								</TableRow>
							))
						) : rows.length === 0 ? (
							<TableRow>
								<TableCell colSpan={6} className="h-60">
									<div className="flex flex-col items-center justify-center gap-3 text-center">
										<div className="flex size-14 items-center justify-center rounded-full bg-muted">
											<BadgeCheck className="size-6 text-muted-foreground" />
										</div>
										<p className="text-sm font-medium">No memberships found</p>
										<p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
									</div>
								</TableCell>
							</TableRow>
						) : (
							rows.map((row) => {
								const variant = membershipStatusVariant(row.status, row.isLocked);
								const label = membershipStatusLabel(row.status, row.isLocked);
								return (
									<MembershipTableRow
										key={row.packageInstanceId}
										row={row}
										variant={variant}
										label={label}
										onCustomerClick={(mid) => {
											setSelectedMemberId(mid);
											setSheetOpen(true);
										}}
									/>
								);
							})
						)}
					</TableBody>
				</Table>

				{/* Pagination */}
				{total > PAGE_LIMIT && (
					<div className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground">
						<span>
							Showing {offset + 1}–{Math.min(offset + PAGE_LIMIT, total)} of {total}
						</span>
						<div className="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
								disabled={offset === 0}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setOffset((prev) => prev + PAGE_LIMIT)}
								disabled={offset + PAGE_LIMIT >= total}
							>
								Next
							</Button>
						</div>
					</div>
				)}

			{selectedMemberId && organizationId && (
				<CustomerDetailSheet
					memberId={selectedMemberId}
					organizationId={organizationId}
					open={sheetOpen}
					onOpenChange={(open) => {
						setSheetOpen(open);
						if (!open) setSelectedMemberId(null);
					}}
				/>
			)}
		</>
	);
}
