import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Download, Eye, Pencil, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
import { useEffect, useState } from "react";
import { CustomerDetailSheet } from "@/components/customers/customer-detail-sheet";
import { CopyableCell } from "@/components/tables/copyable-cell";
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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/useDebounce";
import { useUserContext } from "@/hooks/useUserContext";
import { formatPrice } from "@/lib/currency";
import { client } from "@/utils/orpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type CustomerDirectoryRow = {
	memberId: string;
	userId: string;
	name: string;
	email: string;
	phone: string | null;
	hierarchyScopeId: string;
	branchName: string | null;
	activePackageCount: number;
	lifetimeValueCents: number;
	outstandingBalanceCents: number;
	appointmentCount: number;
	lastVisitAt: Date | string | null;
	createdAt: Date | string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_LIMIT = 50;
const TH = "px-5 py-3.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground";
const TD = "px-5 py-4";

// ─── Page component ───────────────────────────────────────────────────────────

interface RegisteredCustomersPageProps {
	initialCustomerId?: string;
}

export function RegisteredCustomersPage({ initialCustomerId }: RegisteredCustomersPageProps) {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const canRead = hasPermission("customer_management:read");

	const [search, setSearch] = useState("");
	const debouncedSearch = useDebounce(search, 300);
	const [branchId, setBranchId] = useState<string>("");
	const [offset, setOffset] = useState(0);
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);

	useEffect(() => {
		if (initialCustomerId) {
			setSelectedMemberId(initialCustomerId);
			setSheetOpen(true);
		}
	}, [initialCustomerId]);

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
			"customerDirectory",
			organizationId,
			debouncedSearch,
			branchId,
			offset,
		],
		queryFn: async () => {
			if (!organizationId) return { rows: [], total: 0 };
			return client.customerDirectory.list({
				organizationId,
				search: debouncedSearch || undefined,
				branchId: branchId || undefined,
				limit: PAGE_LIMIT,
				offset,
			});
		},
		enabled: !!organizationId && canRead,
	});

	const rows: CustomerDirectoryRow[] = listData?.rows ?? [];
	const total = listData?.total ?? 0;
	const showingFrom = total === 0 ? 0 : offset + 1;
	const showingTo = Math.min(offset + PAGE_LIMIT, total);

	// ── Guards ─────────────────────────────────────────────────────────────

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to view the customer directory.
			</div>
		);
	}

	if (!canRead) {
		return (
			<div className="flex min-h-96 items-center justify-center">
				<div className="space-y-1 text-center">
					<p className="font-medium">Permission Denied</p>
					<p className="text-muted-foreground text-sm">
						You don't have permission to view the customer directory.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		const isForbidden =
			error instanceof Error &&
			(error.message.includes("403") ||
				error.message.toLowerCase().includes("forbidden") ||
				error.message.toLowerCase().includes("permission"));
		if (isForbidden) {
			return (
				<div className="flex min-h-96 items-center justify-center">
					<div className="space-y-1 text-center">
						<p className="font-medium">Permission Denied</p>
						<p className="text-muted-foreground text-sm">
							You don't have permission to view the customer directory.
						</p>
					</div>
				</div>
			);
		}
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					title="Failed to load customers"
					message="Please try again."
				/>
			</div>
		);
	}

	// ── Render ─────────────────────────────────────────────────────────────

	return (
		<TooltipProvider>
			<div className="p-6">
				<div className="overflow-hidden rounded-xl border bg-card shadow-sm">

					{/* Card header: title + search + filters + export */}
					<div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
						{/* Title */}
						<div className="mr-auto">
							<h1 className="font-semibold text-base tracking-tight">Registered Customers</h1>
							<p className="text-muted-foreground text-xs">
								{isLoading ? "Loading…" : `${total} customer${total !== 1 ? "s" : ""}`}
							</p>
						</div>

						{/* Search */}
						<div className="relative w-60">
							<Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Search…"
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setOffset(0);
								}}
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
								<SelectTrigger className="w-40 text-sm">
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

						{/* Export */}
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<Button variant="outline" size="sm" disabled className="gap-1.5">
										<Download className="h-3.5 w-3.5" />
										Export
									</Button>
								</span>
							</TooltipTrigger>
							<TooltipContent>Export is not available yet.</TooltipContent>
						</Tooltip>
					</div>

					{/* Table */}
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="border-b bg-muted/20 hover:bg-muted/20">
									<TableHead className={`w-[280px] ${TH}`}>Customer</TableHead>
									<TableHead className={TH}>Phone</TableHead>
									<TableHead className={TH}>Packages</TableHead>
									<TableHead className={TH}>LTV</TableHead>
									<TableHead className={TH}>Outstanding</TableHead>
									<TableHead className={`w-[96px] ${TH}`} />
								</TableRow>
							</TableHeader>

							<TableBody className="divide-y divide-border">
								{isLoading ? (
									Array.from({ length: 8 }).map((_, i) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
										<TableRow key={i} className="hover:bg-muted/20">
											<TableCell className={TD}>
												<div className="flex items-center gap-3.5">
													<Skeleton className="size-9 shrink-0 rounded-full" />
													<div className="space-y-2">
														<Skeleton className="h-3.5 w-28" />
														<Skeleton className="h-3 w-36" />
													</div>
												</div>
											</TableCell>
											<TableCell className={TD}><Skeleton className="h-3.5 w-24" /></TableCell>
											<TableCell className={TD}><Skeleton className="h-5 w-7 rounded-full" /></TableCell>
											<TableCell className={TD}><Skeleton className="h-3.5 w-16" /></TableCell>
											<TableCell className={TD}><Skeleton className="h-3.5 w-16" /></TableCell>
											<TableCell className={TD}><Skeleton className="h-7 w-16 rounded-md" /></TableCell>
										</TableRow>
									))
								) : rows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className="h-60">
											<EmptyState
												icon={Users}
												title="No customers found"
												description={
													search || branchId
														? "Try adjusting your search or branch filter."
														: "Customers will appear here once they register."
												}
												context={search || branchId ? "search" : "empty"}
											/>
										</TableCell>
									</TableRow>
								) : (
									rows.map((row) => {
										const initials = getInitials(row.name);
										return (
											<TableRow
												key={row.memberId}
												className="transition-colors hover:bg-muted/30"
											>
												{/* Customer */}
												<TableCell className={TD}>
													<div className="flex items-center gap-3.5">
														<span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-primary text-primary-foreground">
															{initials}
														</span>
														<div className="min-w-0">
															<p className="truncate font-medium text-sm leading-snug">
																{row.name}
															</p>
															<p className="truncate text-xs text-muted-foreground">
																{row.email}
															</p>
														</div>
													</div>
												</TableCell>

												{/* Phone */}
												<TableCell className={`${TD} text-sm`}>
													{row.phone
														? <CopyableCell value={row.phone} />
														: <span className="text-muted-foreground">—</span>}
												</TableCell>

												{/* Packages */}
												<TableCell className={TD}>
													{row.activePackageCount > 0 ? (
														<Badge variant="secondary" className="tabular-nums">
															{row.activePackageCount}
														</Badge>
													) : (
														<span className="text-muted-foreground text-sm">—</span>
													)}
												</TableCell>

												{/* LTV */}
												<TableCell className={TD}>
													<span className="tabular-nums text-sm">
														{formatPrice(row.lifetimeValueCents, "MYR")}
													</span>
												</TableCell>

												{/* Outstanding */}
												<TableCell className={TD}>
													<span className={`tabular-nums text-sm ${row.outstandingBalanceCents > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
														{row.outstandingBalanceCents > 0
															? formatPrice(row.outstandingBalanceCents, "MYR")
															: "—"}
													</span>
												</TableCell>

												{/* Actions */}
												<TableCell className={TD}>
													<div className="flex items-center gap-0.5">
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-8 w-8 text-muted-foreground hover:text-foreground"
																	onClick={() => {
																		setSelectedMemberId(row.memberId);
																		setSheetOpen(true);
																	}}
																>
																	<Pencil className="h-3.5 w-3.5" />
																	<span className="sr-only">Edit</span>
																</Button>
															</TooltipTrigger>
															<TooltipContent>Edit profile</TooltipContent>
														</Tooltip>

														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	className="h-8 w-8 text-muted-foreground hover:text-foreground"
																	asChild
																>
																	<Link
																		to="/dashboard/customers/$id"
																		params={{ id: row.memberId }}
																	>
																		<Eye className="h-3.5 w-3.5" />
																		<span className="sr-only">View 360°</span>
																	</Link>
																</Button>
															</TooltipTrigger>
															<TooltipContent>View 360°</TooltipContent>
														</Tooltip>
													</div>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>

					{/* Pagination */}
					{total > PAGE_LIMIT && (
						<div className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground">
							<span>Showing {showingFrom}–{showingTo} of {total}</span>
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

				</div>
			</div>

			{/* Customer Detail Drawer */}
			{selectedMemberId && (
				<CustomerDetailSheet
					memberId={selectedMemberId}
					organizationId={organizationId}
					open={sheetOpen}
					onOpenChange={(open) => {
						setSheetOpen(open);
						if (!open) setSelectedMemberId(null);
					}}
					onSaved={() => {}}
				/>
			)}
		</TooltipProvider>
	);
}
