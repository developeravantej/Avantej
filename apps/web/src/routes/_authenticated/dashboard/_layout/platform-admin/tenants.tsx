import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TagFilterStrip } from "@/components/platform-admin/tag-filter-strip";
import { BulkActionsBar } from "@/components/platform-admin/bulk-actions-bar";
import { BulkCommsComposer } from "@/components/platform-admin/bulk-comms-composer";
import { TagChip } from "@/components/platform-admin/tag-chip";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/tenants",
)({
	beforeLoad: async () => {
		try {
			const result = await client.admin.me({});
			if (!result.isPlatformAdmin) {
				throw redirect({ to: "/dashboard" });
			}
		} catch (err: unknown) {
			if (
				err !== null &&
				typeof err === "object" &&
				"TANSTACK_ROUTER_REDIRECT" in err
			) {
				throw err;
			}
			throw redirect({ to: "/dashboard" });
		}
	},
	component: PlatformAdminTenantsPage,
});

function PlatformAdminTenantsPage() {
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
	const limit = 50;

	const { data: meData } = useQuery({
		queryKey: ["admin", "me"],
		queryFn: () => client.admin.me({}),
	});
	const role =
		(meData?.role as "super_admin" | "support" | "billing" | null | undefined) ??
		null;

	const { data, isLoading } = useQuery({
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
	//
	// Plan F.6.1 (Agent D) — Guard against non-v4 UUIDs leaking into
	// `tags/listForOrg`. The platform-admin Zod uuid schema accepts only
	// strict v4 / nil / max UUIDs; dev DB rows seeded via raw SQL with
	// synthetic ids like `00000000-0000-0000-0000-00000000ff01` fail Zod
	// → 400 spam in every drill-in render (the list page mounts as a
	// parent of `tenants.$id` per TanStack file-routing). Skip those
	// rows here so the rest of the page renders cleanly.
	const V4_UUID_RE =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$|^00000000-0000-0000-0000-000000000000$|^ffffffff-ffff-ffff-ffff-ffffffffffff$/i;
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
		<div className="p-6 space-y-4">
			<div>
				<h1 className="text-2xl font-semibold">Platform Admin: Tenants</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Cross-tenant management. Search by name, slug, or owner email.
				</p>
			</div>

			<div className="flex gap-3 items-center">
				<div className="relative flex-1 max-w-md">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
					<Input
						className="pl-9"
						placeholder="Search name, slug, or owner email"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(1);
						}}
					/>
				</div>
				<Select
					value={paymentStatus}
					onValueChange={(v) => {
						setPaymentStatus(v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-48">
						<SelectValue placeholder="Payment status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any status</SelectItem>
						<SelectItem value="active">active</SelectItem>
						<SelectItem value="suspended">suspended</SelectItem>
						<SelectItem value="cancelled">cancelled</SelectItem>
						<SelectItem value="failed">failed</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={countryCode}
					onValueChange={(v) => {
						setCountryCode(v);
						setPage(1);
					}}
				>
					<SelectTrigger className="w-32">
						<SelectValue placeholder="Country" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any country</SelectItem>
						<SelectItem value="MY">MY</SelectItem>
						<SelectItem value="SG">SG</SelectItem>
						<SelectItem value="TH">TH</SelectItem>
					</SelectContent>
				</Select>
				<div className="text-sm text-muted-foreground ml-auto">
					{isLoading ? "Loading…" : `${total} tenant${total === 1 ? "" : "s"}`}
				</div>
			</div>

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

			<div className="border rounded-md">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-10">
								<Checkbox
									checked={allVisibleSelected}
									onCheckedChange={toggleAllVisible}
									aria-label="Select all visible tenants"
									data-testid="tenants-select-all"
								/>
							</TableHead>
							<TableHead>Name / Slug</TableHead>
							<TableHead>Tags</TableHead>
							<TableHead>Country</TableHead>
							<TableHead>Owner</TableHead>
							<TableHead>Payment</TableHead>
							<TableHead>Sub</TableHead>
							<TableHead>Connect</TableHead>
							<TableHead>Created</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filteredTenants.length === 0 && !isLoading && (
							<TableRow>
								<TableCell colSpan={9} className="text-center text-muted-foreground py-8">
									No tenants match.
								</TableCell>
							</TableRow>
						)}
						{filteredTenants.map((t) => {
							const orgTags = tagsByOrgData?.[t.id] ?? [];
							return (
								<TableRow key={t.id} data-testid={`tenant-row-${t.id}`}>
									<TableCell>
										<Checkbox
											checked={selectedIds.includes(t.id)}
											onCheckedChange={() => toggleRow(t.id)}
											aria-label={`Select ${t.name}`}
											data-testid={`tenant-row-checkbox-${t.id}`}
										/>
									</TableCell>
									<TableCell>
										<Link
											to="/dashboard/platform-admin/tenants/$id"
											params={{ id: t.id }}
											className="font-medium hover:underline"
										>
											{t.name}
										</Link>
										<div className="text-xs text-muted-foreground">{t.slug}</div>
									</TableCell>
									<TableCell>
										<div
											className="flex flex-wrap gap-1"
											data-testid={`tenant-row-tags-${t.id}`}
										>
											{orgTags.length === 0 && (
												<span className="text-xs text-muted-foreground">—</span>
											)}
											{orgTags.map((tag) => (
												<TagChip key={tag.label} label={tag.label} color={tag.color} />
											))}
										</div>
									</TableCell>
									<TableCell>
										{t.countryCode ? (
											<Badge variant="outline" className="font-mono text-xs">
												{t.countryCode}
											</Badge>
										) : (
											<span className="text-muted-foreground text-xs">—</span>
										)}
									</TableCell>
									<TableCell>
										<div className="text-sm">{t.ownerEmail ?? "—"}</div>
										{t.ownerName && (
											<div className="text-xs text-muted-foreground">{t.ownerName}</div>
										)}
									</TableCell>
									<TableCell>
										<Badge
											variant={
												t.paymentStatus === "active"
													? "default"
													: t.paymentStatus === "failed"
														? "destructive"
														: "secondary"
											}
										>
											{t.paymentStatus}
										</Badge>
									</TableCell>
									<TableCell>
										{t.subTier ? (
											<div className="text-sm">
												{t.subTier}
												<div className="text-xs text-muted-foreground">{t.subStatus}</div>
											</div>
										) : (
											<span className="text-muted-foreground text-sm">none</span>
										)}
									</TableCell>
									<TableCell>
										<div className="text-sm">
											{t.connectAccounts.chargesEnabled}/{t.connectAccounts.total} live
										</div>
									</TableCell>
									<TableCell className="text-sm text-muted-foreground">
										{new Date(t.createdAt).toLocaleDateString()}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between text-sm">
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
	);
}
