import { useQuery } from "@tanstack/react-query";
import {
	BadgeCheck,
	Clock,
	CreditCard,
	Lock,
	MoreHorizontal,
	Search,
} from "lucide-react";
import { useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { useScope } from "@/components/scope/ScopeProvider";
import { CancelInstanceDialog } from "@/features/packages/components/cancel-instance-dialog";
import { ExtendInstanceDialog } from "@/features/packages/components/extend-instance-dialog";
import { FreezeInstanceDialog } from "@/features/packages/components/freeze-instance-dialog";
import { useUnfreezePackageInstance } from "@/features/packages/api";
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

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value as string);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

function expiryLabel(days: number | null): { text: string; className: string } {
	if (days === null) return { text: "No expiry", className: "text-[#737373]" };
	if (days <= 0)
		return { text: "Expired", className: "text-red-600 font-medium" };
	if (days <= 7)
		return {
			text: `in ${days} day${days !== 1 ? "s" : ""}`,
			className: "text-red-600 font-medium",
		};
	if (days <= 30)
		return {
			text: `in ${days} days`,
			className: "text-amber-600 font-medium",
		};
	return {
		text: `in ${days} days`,
		className: "text-[#737373]",
	};
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

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

const TH =
	"px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]";
const TD = "px-4 py-3 text-sm text-[#0a0a0a]";

export function MembershipsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	// Scope switcher drives the branch filter (any hierarchy level; undefined = All).
	const { scopeNodeId } = useScope();

	const canRead = hasPermission("service_management:read");

	const [filter, setFilter] = useState<MembershipFilter>("active");
	const [offset, setOffset] = useState(0);
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [search, setSearch] = useState("");

	// Action dialog state
	const [actionRow, setActionRow] = useState<MembershipRow | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [freezeOpen, setFreezeOpen] = useState(false);
	const [extendOpen, setExtendOpen] = useState(false);
	const [unfreezeOpen, setUnfreezeOpen] = useState(false);

	const canManage =
		hasPermission("package_management:manage") ||
		hasPermission("package_management:update");

	const unfreezeMutation = useUnfreezePackageInstance(organizationId ?? "");

	const {
		data: listData,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["memberships", organizationId, filter, scopeNodeId, offset],
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
				branchId: scopeNodeId,
				limit: PAGE_LIMIT,
				offset,
			});
			return result;
		},
		enabled: !!organizationId && canRead,
	});

	const rows: MembershipRow[] =
		(listData as { rows?: MembershipRow[] } | undefined)?.rows ?? [];
	const total: number =
		(listData as { total?: number } | undefined)?.total ?? 0;

	const expiringSoonCount = rows.filter(
		(r) =>
			r.daysUntilExpiry !== null &&
			r.daysUntilExpiry > 0 &&
			r.daysUntilExpiry <= 7,
	).length;

	const frozenCount = rows.filter((r) => r.isLocked).length;

	const outstandingBalanceSum = rows.reduce(
		(acc, r) => acc + r.outstandingBalanceCents,
		0,
	);

	// Guard: no org selected
	if (!organizationId) {
		return (
			<div className="flex min-h-60 items-center justify-center text-[#737373]">
				Select an organization to view memberships.
			</div>
		);
	}

	// Guard: no permission
	if (!canRead) {
		return (
			<div className="flex min-h-60 items-center justify-center text-[#737373]">
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
				<div className="flex min-h-60 items-center justify-center text-[#737373]">
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
			<div className="flex min-h-60 items-center justify-center text-rose-600">
				Failed to load memberships. Please try again.
			</div>
		);
	}

	return (
		<>
			{/* Header */}
			<div className="flex flex-wrap items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
				<div className="mr-auto">
					<h2 className="text-base font-bold text-[#0a0a0a] tracking-tight">
						Memberships
					</h2>
					<p className="text-xs text-[#737373]">
						{isLoading ? "—" : `${total} membership${total !== 1 ? "s" : ""}`}
					</p>
				</div>
				{/* Search */}
				<div className="relative w-60">
					<Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#737373]" />
					<Input
						placeholder="Search customer…"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="pl-8 text-sm"
					/>
				</div>
				{/* Scope switcher (country → state → branch) */}
				<ScopeSwitcher className="w-48" />
			</div>

			{/* Stat cards */}
			<div className="grid grid-cols-2 gap-3 border-b border-[#e5e5e5] px-5 py-4 lg:grid-cols-4">
				<div className="flex items-start justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-[#737373]">
							Total
						</p>
						<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">
							{total}
						</p>
					</div>
					<div className="rounded-lg bg-[#e5e5e5] p-2">
						<BadgeCheck className="h-4 w-4 text-[#737373]" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-[#737373]">
							Expiring Soon
						</p>
						<p
							className={`mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a] ${expiringSoonCount > 0 ? "text-red-600" : ""}`}
						>
							{expiringSoonCount}
						</p>
					</div>
					<div className="rounded-lg bg-[#e5e5e5] p-2">
						<Clock className="h-4 w-4 text-[#737373]" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-[#737373]">
							Frozen
						</p>
						<p className="mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a]">
							{frozenCount}
						</p>
					</div>
					<div className="rounded-lg bg-[#e5e5e5] p-2">
						<Lock className="h-4 w-4 text-[#737373]" />
					</div>
				</div>
				<div className="flex items-start justify-between rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
					<div>
						<p className="text-xs font-medium uppercase tracking-wide text-[#737373]">
							Outstanding
						</p>
						<p
							className={`mt-1 text-2xl font-bold font-mono tabular-nums text-[#0a0a0a] ${outstandingBalanceSum > 0 ? "text-red-600" : ""}`}
						>
							{formatPrice(outstandingBalanceSum, "MYR")}
						</p>
					</div>
					<div className="rounded-lg bg-[#e5e5e5] p-2">
						<CreditCard className="h-4 w-4 text-[#737373]" />
					</div>
				</div>
			</div>

			{/* Filter tabs */}
			<div className="flex items-center gap-1.5 overflow-x-auto border-b border-[#e5e5e5] px-5 py-3">
				{TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						onClick={() => {
							setFilter(tab.value);
							setOffset(0);
						}}
						className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all ${
							filter === tab.value
								? "bg-[#0a0a0a] text-white font-semibold"
								: "border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]"
						}`}
					>
						{tab.label}
					</button>
				))}
			</div>

			{/* Table */}
			<Table>
				<TableHeader className="bg-[#f3f3f3]">
					<TableRow className="border-b border-[#e5e5e5] hover:bg-transparent">
						<TableHead className={TH}>Customer</TableHead>
						<TableHead className={TH}>Package</TableHead>
						<TableHead className={TH}>Credits</TableHead>
						<TableHead className={TH}>Expires</TableHead>
						<TableHead className={TH}>Outstanding</TableHead>
						<TableHead className={TH}>Status</TableHead>
						{canManage && <TableHead className={TH} />}
					</TableRow>
				</TableHeader>
				<TableBody>
					{isLoading ? (
						Array.from({ length: 6 }).map((_, i) => (
							<TableRow key={i} className="hover:bg-[#fafafa]">
								<TableCell className={TD}>
									<div className="flex items-center gap-3.5">
										<Skeleton className="size-9 shrink-0 rounded-full" />
										<div className="space-y-1.5">
											<Skeleton className="h-3.5 w-28" />
											<Skeleton className="h-3 w-20" />
										</div>
									</div>
								</TableCell>
								<TableCell className={TD}>
									<Skeleton className="h-3.5 w-20" />
								</TableCell>
								<TableCell className={TD}>
									<Skeleton className="h-3.5 w-20" />
								</TableCell>
								<TableCell className={TD}>
									<Skeleton className="h-3.5 w-20" />
								</TableCell>
								<TableCell className={TD}>
									<Skeleton className="h-3.5 w-20" />
								</TableCell>
								<TableCell className={TD}>
									<Skeleton className="h-3.5 w-20" />
								</TableCell>
								{canManage && <TableCell className={TD} />}
							</TableRow>
						))
					) : rows.length === 0 ? (
						<TableRow>
							<TableCell colSpan={canManage ? 7 : 6} className="h-60">
								<div className="flex flex-col items-center justify-center gap-3 text-center">
									<div className="flex size-14 items-center justify-center rounded-full bg-[#f3f3f3]">
										<BadgeCheck className="h-6 w-6 text-[#737373]" />
									</div>
									<p className="text-sm font-medium">No memberships found</p>
									<p className="text-xs text-[#737373]">
										Try adjusting your filters.
									</p>
								</div>
							</TableCell>
						</TableRow>
					) : (
						rows.map((row) => {
							const name = row.clientName || "Unknown member";
							const initials = getInitials(name);
							const dateStr = formatDate(row.expiresAt);
							const expiry = expiryLabel(row.daysUntilExpiry);
							const variant = membershipStatusVariant(row.status, row.isLocked);
							const label = membershipStatusLabel(row.status, row.isLocked);

							return (
								<TableRow
									key={row.packageInstanceId}
									className="hover:bg-[#fafafa]"
								>
									{/* Customer */}
									<TableCell className={TD}>
										<button
											type="button"
											className="flex items-center gap-3.5 text-left hover:underline focus:outline-none"
											onClick={() => {
												setSelectedMemberId(row.memberId || null);
												setSheetOpen(true);
											}}
										>
											<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#d6cdb1]/30 font-bold text-[#0a0a0a] text-xs">
												{initials}
											</span>
											<span className="font-medium">{name}</span>
										</button>
									</TableCell>

									{/* Package */}
									<TableCell className={TD}>
										<span className="font-medium">{row.serviceName}</span>
									</TableCell>

									{/* Credits */}
									<TableCell className={TD}>
										<div className="flex flex-col gap-1">
											<span className="tabular-nums text-sm">
												{row.creditsRemaining} / {row.creditsTotal}
											</span>
											<div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#e5e5e5]">
												<div
													className="h-full rounded-full bg-[#0a0a0a] transition-all"
													style={{
														width: `${Math.round((row.creditsRemaining / Math.max(row.creditsTotal, 1)) * 100)}%`,
													}}
												/>
											</div>
										</div>
									</TableCell>

									{/* Expires */}
									<TableCell className={TD}>
										<div className="flex flex-col gap-0.5">
											<span className="text-sm">{dateStr}</span>
											<span className={`text-xs ${expiry.className}`}>
												{expiry.text}
											</span>
										</div>
									</TableCell>

									{/* Outstanding */}
									<TableCell className={TD}>
										<span
											className={`tabular-nums ${row.outstandingBalanceCents > 0 ? "font-medium text-red-600" : "text-[#737373]"}`}
										>
											{formatPrice(row.outstandingBalanceCents, "MYR")}
										</span>
									</TableCell>

									{/* Status */}
									<TableCell className={TD}>
										{row.isLocked && row.lockedReason ? (
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger asChild>
														<span>
															<Badge variant={variant}>{label}</Badge>
														</span>
													</TooltipTrigger>
													<TooltipContent>
														<p>{row.lockedReason}</p>
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										) : (
											<Badge variant={variant}>{label}</Badge>
										)}
									</TableCell>

									{/* Actions */}
									{canManage &&
										(() => {
											const isActionable =
												row.status === "active" ||
												row.status === "frozen" ||
												row.isLocked;
											if (!isActionable) {
												return <TableCell className={TD} />;
											}
											const isEffectivelyFrozen =
												row.isLocked || row.status === "frozen";
											return (
												<TableCell
													className={TD}
													onClick={(e) => e.stopPropagation()}
												>
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																className="h-7 w-7"
																aria-label="Actions"
															>
																<MoreHorizontal className="h-4 w-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															{!isEffectivelyFrozen && (
																<DropdownMenuItem
																	onClick={() => {
																		setActionRow(row);
																		setFreezeOpen(true);
																	}}
																>
																	Freeze
																</DropdownMenuItem>
															)}
															{isEffectivelyFrozen && (
																<DropdownMenuItem
																	onClick={() => {
																		setActionRow(row);
																		setUnfreezeOpen(true);
																	}}
																>
																	Unfreeze
																</DropdownMenuItem>
															)}
															<DropdownMenuItem
																onClick={() => {
																	setActionRow(row);
																	setExtendOpen(true);
																}}
															>
																Extend
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="text-rose-600 focus:text-rose-600"
																onClick={() => {
																	setActionRow(row);
																	setCancelOpen(true);
																}}
															>
																Cancel Package
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												</TableCell>
											);
										})()}
								</TableRow>
							);
						})
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{total > PAGE_LIMIT && (
				<div className="flex items-center justify-between border-t border-[#e5e5e5] bg-[#f3f3f3]/50 px-4 py-2.5 text-[13px]">
					<span>
						Showing {offset + 1}–{Math.min(offset + PAGE_LIMIT, total)} of{" "}
						{total}
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
							onClick={() => setOffset(offset + PAGE_LIMIT)}
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

			{/* ── Package lifecycle dialogs ── */}
			{organizationId && actionRow && (
				<>
					<CancelInstanceDialog
						open={cancelOpen}
						onOpenChange={(v) => {
							setCancelOpen(v);
							if (!v) setActionRow(null);
						}}
						instanceId={actionRow.packageInstanceId}
						organizationId={organizationId}
						instanceLabel={actionRow.serviceName}
					/>
					<FreezeInstanceDialog
						open={freezeOpen}
						onOpenChange={(v) => {
							setFreezeOpen(v);
							if (!v) setActionRow(null);
						}}
						instanceId={actionRow.packageInstanceId}
						organizationId={organizationId}
						instanceLabel={actionRow.serviceName}
					/>
					<ExtendInstanceDialog
						open={extendOpen}
						onOpenChange={(v) => {
							setExtendOpen(v);
							if (!v) setActionRow(null);
						}}
						instanceId={actionRow.packageInstanceId}
						organizationId={organizationId}
						instanceLabel={actionRow.serviceName}
						currentExpiresAt={
							actionRow.expiresAt ? String(actionRow.expiresAt) : null
						}
					/>
					<Dialog
						open={unfreezeOpen}
						onOpenChange={(v) => {
							setUnfreezeOpen(v);
							if (!v) setActionRow(null);
						}}
					>
						<DialogContent
							className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
							hideCloseButton
						>
							<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
								<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
									PACKAGE LIFECYCLE
								</p>
								<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
									Unfreeze Package?
								</DialogTitle>
								<DialogDescription className="text-sm text-[#737373]">
									"{actionRow.serviceName}" will be reactivated and the customer
									can book sessions again.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
								<Button
									variant="outline"
									onClick={() => {
										setUnfreezeOpen(false);
										setActionRow(null);
									}}
									disabled={unfreezeMutation.isPending}
								>
									Cancel
								</Button>
								<Button
									className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
									onClick={() => {
										unfreezeMutation.mutate(
											{ organizationId, id: actionRow.packageInstanceId },
											{
												onSuccess: () => {
													setUnfreezeOpen(false);
													setActionRow(null);
												},
											},
										);
									}}
									disabled={unfreezeMutation.isPending}
								>
									{unfreezeMutation.isPending ? "Unfreezing…" : "Unfreeze"}
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				</>
			)}
		</>
	);
}
