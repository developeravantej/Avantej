/**
 * Tenant Members tab (Plan F.4, Agent Mb).
 *
 * Read-only roster for the platform-admin tenant drill-in. Header KPI
 * strip shows total + role breakdown chips; filter row exposes search
 * (debounced 250ms) + role select; below sits the paginated
 * <MembersRosterTable />.
 *
 * No mutations in v1 — add/remove/role-change is deferred.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { client } from "@/utils/orpc";
import { MembersRosterTable } from "@/components/platform-admin/members-roster-table";
import type { MemberRosterRow } from "@/components/platform-admin/members-roster-table";

const ALL_ROLES = "__all__";

function useDebounced<T>(value: T, delayMs: number): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return v;
}

export function TenantMembersTab({
	organizationId,
}: {
	organizationId: string;
}) {
	const [search, setSearch] = useState("");
	const [role, setRole] = useState<string>(ALL_ROLES);
	const [page, setPage] = useState(1);
	const limit = 50;
	const debouncedSearch = useDebounced(search, 250);

	// Reset to page 1 whenever filters change.
	useEffect(() => {
		setPage(1);
	}, [debouncedSearch, role]);

	const countsQuery = useQuery({
		queryKey: ["platformAdminTenants", "members", "getCounts", organizationId],
		queryFn: () =>
			client.platformAdminTenants.members.getCounts({ organizationId }),
	});

	const listQuery = useQuery({
		queryKey: [
			"platformAdminTenants",
			"members",
			"list",
			organizationId,
			debouncedSearch,
			role,
			page,
			limit,
		],
		queryFn: () =>
			client.platformAdminTenants.members.list({
				organizationId,
				search: debouncedSearch ? debouncedSearch : undefined,
				role: role === ALL_ROLES ? undefined : role,
				page,
				limit,
			}),
	});

	const rows: MemberRosterRow[] = (listQuery.data?.rows ??
		[]) as MemberRosterRow[];
	const total = listQuery.data?.total ?? 0;
	const counts = countsQuery.data;

	const roleOptions = useMemo(() => {
		const set = new Set<string>();
		(counts?.byRole ?? []).forEach((r) => set.add(r.role));
		rows.forEach((r) => set.add(r.role));
		return Array.from(set).sort();
	}, [counts?.byRole, rows]);

	return (
		<div className="space-y-4" data-testid="tenant-members-tab">
			<Card data-testid="members-kpi-strip">
				<CardHeader className="pb-2">
					<CardTitle className="text-base">Members overview</CardTitle>
				</CardHeader>
				<CardContent className="space-y-2">
					<div
						className="text-2xl font-semibold"
						data-testid="members-kpi-total"
					>
						{countsQuery.isLoading ? "…" : (counts?.totalMembers ?? 0)}
						<span className="text-sm font-normal text-muted-foreground ml-2">
							total
						</span>
					</div>
					<div
						className="flex flex-wrap gap-2"
						data-testid="members-role-chips"
					>
						{(counts?.byRole ?? []).map((r) => (
							<Badge
								key={r.role}
								variant="secondary"
								data-testid={`member-role-chip-${r.role}`}
							>
								{r.role} · {r.count}
							</Badge>
						))}
						{!countsQuery.isLoading && (counts?.byRole ?? []).length === 0 && (
							<span className="text-xs text-muted-foreground">
								No members yet.
							</span>
						)}
					</div>
				</CardContent>
			</Card>

			<div
				className="flex flex-col sm:flex-row gap-2 sm:items-center"
				data-testid="members-filter-row"
			>
				<Input
					placeholder="Search name or email…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="sm:max-w-xs"
					data-testid="members-search-input"
				/>
				<Select value={role} onValueChange={setRole}>
					<SelectTrigger
						className="sm:w-[200px]"
						data-testid="members-role-filter"
					>
						<SelectValue placeholder="All roles" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL_ROLES}>All roles</SelectItem>
						{roleOptions.map((r) => (
							<SelectItem key={r} value={r}>
								{r}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{listQuery.isLoading ? (
				<div className="text-sm text-muted-foreground">Loading members…</div>
			) : listQuery.error ? (
				<div
					className="text-sm text-destructive"
					data-testid="members-load-error"
				>
					{(listQuery.error as Error)?.message ?? "Failed to load members."}
				</div>
			) : (
				<MembersRosterTable
					rows={rows}
					total={total}
					page={page}
					limit={limit}
					onPageChange={setPage}
				/>
			)}
		</div>
	);
}
