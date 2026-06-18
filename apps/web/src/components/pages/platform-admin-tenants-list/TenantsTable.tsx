import { Link, useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import type { client } from "@/utils/orpc";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { TagChip } from "@/components/platform-admin/tag-chip";
import { PaymentStatusBadge } from "./PaymentStatusBadge";

type ListTenantsResult = Awaited<
	ReturnType<typeof client.platformAdminTenants.listTenants>
>;
export type Tenant = ListTenantsResult["tenants"][number];

type TagsByOrg = Record<string, Array<{ label: string; color: string | null }>>;

interface TenantsTableProps {
	filteredTenants: Tenant[];
	isLoading: boolean;
	search: string;
	activeTagLabels: string[];
	tagsByOrgData: TagsByOrg | undefined;
	selectedIds: string[];
	allVisibleSelected: boolean;
	onToggleAllVisible: () => void;
	onToggleRow: (id: string) => void;
}

export function TenantsTable({
	filteredTenants,
	isLoading,
	search,
	activeTagLabels,
	tagsByOrgData,
	selectedIds,
	allVisibleSelected,
	onToggleAllVisible,
	onToggleRow,
}: TenantsTableProps) {
	const navigate = useNavigate();

	return (
		<Table>
			<TableHeader className="sticky top-0 z-10 bg-white">
				<TableRow className="border-b border-border/40 hover:bg-transparent">
					<TableHead className="w-10 px-6 py-3">
						<Checkbox
							checked={allVisibleSelected}
							onCheckedChange={onToggleAllVisible}
							aria-label="Select all visible tenants"
							data-testid="tenants-select-all"
						/>
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Name / Slug
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Tags
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Country
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Owner
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Payment
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Sub
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Connect
					</TableHead>
					<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Created
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{filteredTenants.length === 0 && !isLoading && (
					<TableRow className="hover:bg-transparent">
						<TableCell colSpan={9} className="p-0">
							<EmptyState
								icon={Building2}
								context={
									search || activeTagLabels.length > 0 ? "search" : "empty"
								}
								title={
									search || activeTagLabels.length > 0
										? "No tenants match"
										: "No tenants yet"
								}
								description={
									search || activeTagLabels.length > 0
										? "Try a different search term or clear your filters."
										: "Provision the first tenant to get started."
								}
								action={{
									label: "New Tenant",
									onClick: () =>
										navigate({
											to: "/dashboard/platform-admin/tenants/new",
										}),
								}}
								data-testid="tenants-empty-state"
							/>
						</TableCell>
					</TableRow>
				)}
				{filteredTenants.map((t) => {
					const orgTags = tagsByOrgData?.[t.id] ?? [];
					return (
						<TableRow
							key={t.id}
							data-testid={`tenant-row-${t.id}`}
							className="border-b border-border/30 transition-colors hover:bg-muted/30"
						>
							<TableCell className="px-6 py-4">
								<Checkbox
									checked={selectedIds.includes(t.id)}
									onCheckedChange={() => onToggleRow(t.id)}
									aria-label={`Select ${t.name}`}
									data-testid={`tenant-row-checkbox-${t.id}`}
								/>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<Link
									to="/dashboard/platform-admin/tenants/$id"
									params={{ id: t.id }}
									className="font-medium hover:underline"
								>
									{t.name}
								</Link>
								<div className="text-xs text-muted-foreground">{t.slug}</div>
							</TableCell>
							<TableCell className="px-6 py-4 whitespace-nowrap">
								<div
									className="flex flex-wrap gap-1"
									data-testid={`tenant-row-tags-${t.id}`}
								>
									{orgTags.length === 0 && (
										<span className="text-xs text-muted-foreground">—</span>
									)}
									{orgTags.map((tag) => (
										<TagChip
											key={tag.label}
											label={tag.label}
											color={tag.color}
										/>
									))}
								</div>
							</TableCell>
							<TableCell className="px-6 py-4 whitespace-nowrap">
								{t.countryCode ? (
									<Badge variant="outline" className="font-mono text-xs">
										{t.countryCode}
									</Badge>
								) : (
									<span className="text-muted-foreground text-xs">—</span>
								)}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<div className="text-sm">{t.ownerEmail ?? "—"}</div>
								{t.ownerName && (
									<div className="text-xs text-muted-foreground">
										{t.ownerName}
									</div>
								)}
							</TableCell>
							<TableCell className="px-6 py-4 whitespace-nowrap">
								<PaymentStatusBadge status={t.paymentStatus} />
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								{t.subTier ? (
									<div className="text-sm">
										{t.subTier}
										<div className="text-xs text-muted-foreground">
											{t.subStatus}
										</div>
									</div>
								) : (
									<span className="text-muted-foreground text-sm">none</span>
								)}
							</TableCell>
							<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
								<div className="text-sm">
									{t.connectAccounts.chargesEnabled}/{t.connectAccounts.total}{" "}
									live
								</div>
							</TableCell>
							<TableCell className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
								{new Date(t.createdAt).toLocaleDateString()}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
