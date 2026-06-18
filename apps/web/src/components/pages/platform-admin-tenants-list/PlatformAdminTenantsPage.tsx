import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { StatusCallout } from "@/components/ui/status-callout";
import { TagFilterStrip } from "@/components/platform-admin/tag-filter-strip";
import { BulkActionsBar } from "@/components/platform-admin/bulk-actions-bar";
import { BulkCommsComposer } from "@/components/platform-admin/bulk-comms-composer";
import { PAGE_LIMIT, V4_UUID_RE } from "./constants";
import { TenantsFilters } from "./TenantsFilters";
import { TenantsTable } from "./TenantsTable";

export function PlatformAdminTenantsPage() {
	const [search, setSearch] = useState("");
	const [paymentStatus, setPaymentStatus] = useState<string>("any");
	const [countryCode, setCountryCode] = useState<string>("any");
	const [page, setPage] = useState(1);
	const [activeTagLabels, setActiveTagLabels] = useState<string[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [composerKind, setComposerKind] = useState<
		"direct_message" | "announcement" | null
	>(null);
	const debouncedSearch = useDebounce(search, 300);
	const limit = PAGE_LIMIT;

	const { data: meData } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
	});
	const role =
		(meData?.role as
			| "super_admin"
			| "support"
			| "billing"
			| null
			| undefined) ?? null;

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [
			"platformAdminTenants",
			"listTenants",
			{ search: debouncedSearch, paymentStatus, countryCode, page },
		],
		queryFn: () =>
			client.platformAdminTenants.listTenants({
				search: debouncedSearch || undefined,
				paymentStatus: paymentStatus === "any" ? undefined : paymentStatus,
				countryCode: countryCode === "any" ? undefined : countryCode,
				page,
				limit,
			}),
	});

	const tenants = data?.tenants ?? [];

	// Fetch tags per visible org (one query, batched in client by orgId map).
	const tenantIds = tenants.map((t) => t.id);
	const queryableTenantIds = tenantIds.filter((id) => V4_UUID_RE.test(id));
	const { data: tagsByOrgData } = useQuery({
		queryKey: ["platformAdminTenants", "tagsByOrg", queryableTenantIds],
		enabled: queryableTenantIds.length > 0,
		queryFn: async () => {
			const out: Record<
				string,
				Array<{ label: string; color: string | null }>
			> = {};
			await Promise.all(
				queryableTenantIds.map(async (id) => {
					const res = await client.platformAdminTenants.tags.listForOrg({
						organizationId: id,
					});
					out[id] = res.tags.map((t) => ({ label: t.label, color: t.color }));
				}),
			);
			return out;
		},
	});

	// Client-side narrowing by selected tag labels (server filter would
	// require a deeper query refactor — out of scope for F.1 cap).
	const filteredTenants = useMemo(() => {
		if (activeTagLabels.length === 0) return tenants;
		const wanted = new Set(activeTagLabels);
		return tenants.filter((t) => {
			const labels = (tagsByOrgData?.[t.id] ?? []).map((x) => x.label);
			return labels.some((l) => wanted.has(l));
		});
	}, [tenants, activeTagLabels, tagsByOrgData]);

	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / limit));

	const allVisibleSelected =
		filteredTenants.length > 0 &&
		filteredTenants.every((t) => selectedIds.includes(t.id));

	const toggleTag = (label: string) => {
		setActiveTagLabels((prev) =>
			prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
		);
		setPage(1);
	};

	const toggleRow = (id: string) => {
		setSelectedIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	};

	const toggleAllVisible = () => {
		if (allVisibleSelected) {
			setSelectedIds((prev) =>
				prev.filter((id) => !filteredTenants.some((t) => t.id === id)),
			);
		} else {
			const add = filteredTenants.map((t) => t.id);
			setSelectedIds((prev) => Array.from(new Set([...prev, ...add])));
		}
	};

	return (
		<div className="flex h-full flex-col gap-4 p-6">
			<div className="flex items-center justify-between">
				<div>
					<p className="text-sm text-muted-foreground">Platform Admin</p>
					<h1 className="text-2xl font-semibold">Tenants</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						Cross-tenant management. Search by name, slug, or owner email.
					</p>
				</div>
				<Button asChild>
					<Link to="/dashboard/platform-admin/tenants/new">New Tenant</Link>
				</Button>
			</div>

			<TenantsFilters
				search={search}
				onSearchChange={(value) => {
					setSearch(value);
					setPage(1);
				}}
				paymentStatus={paymentStatus}
				onPaymentStatusChange={(value) => {
					setPaymentStatus(value);
					setPage(1);
				}}
				countryCode={countryCode}
				onCountryCodeChange={(value) => {
					setCountryCode(value);
					setPage(1);
				}}
				isLoading={isLoading}
				total={total}
			/>

			<TagFilterStrip
				activeLabels={activeTagLabels}
				onToggle={toggleTag}
				onClear={() => setActiveTagLabels([])}
			/>

			{selectedIds.length > 0 && (
				<BulkActionsBar
					selectedIds={selectedIds}
					onClear={() => setSelectedIds([])}
					role={role}
					onSendDm={() => setComposerKind("direct_message")}
					onSendAnnouncement={() => setComposerKind("announcement")}
				/>
			)}

			<BulkCommsComposer
				open={composerKind !== null}
				kind={composerKind ?? "direct_message"}
				organizationIds={selectedIds}
				organizationNamesPreview={tenants
					.filter((t) => selectedIds.includes(t.id))
					.map((t) => t.name)}
				onClose={() => setComposerKind(null)}
				onSent={() => {
					setSelectedIds([]);
					setComposerKind(null);
				}}
			/>

			<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-brand-secondary-3 bg-card">
				{error ? (
					<div className="flex flex-1 items-center justify-center p-6">
						<StatusCallout
							variant="error"
							title="Couldn't load tenants"
							message={
								error instanceof Error ? error.message : "An error occurred"
							}
							onRetry={() => refetch()}
						/>
					</div>
				) : (
					<div className="flex-1 overflow-y-auto">
						<TenantsTable
							filteredTenants={filteredTenants}
							isLoading={isLoading}
							search={search}
							activeTagLabels={activeTagLabels}
							tagsByOrgData={tagsByOrgData}
							selectedIds={selectedIds}
							allVisibleSelected={allVisibleSelected}
							onToggleAllVisible={toggleAllVisible}
							onToggleRow={toggleRow}
						/>
					</div>
				)}

				<div className="flex shrink-0 items-center justify-between border-t border-border/40 px-6 py-3 text-sm">
					<div className="text-muted-foreground">
						Page {page} of {totalPages}
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={page <= 1}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
						>
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={page >= totalPages}
							onClick={() => setPage((p) => p + 1)}
						>
							Next
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
