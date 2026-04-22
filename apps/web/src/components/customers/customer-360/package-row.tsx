/**
 * PackageRow
 *
 * Expandable row for a single package instance in the Customer 360 Packages tab.
 * When expanded it fetches installments and preferred times for that instance.
 */

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { client } from "@/utils/orpc";

// ─── Types ─────────────────────────────────────────────────────────────────────

// PackageInstanceRow fields we rely on (matches what getById returns)
export interface PackageInstanceRow {
	id: string;
	clientId: string;
	status: string | null;
	creditsUsed: number | null;
	creditsTotal: number | null;
	expiresAt: Date | string | null;
	serviceName?: string | null;
	paymentPlanCode?: string | null;
}

interface PackageRowProps {
	pkg: PackageInstanceRow;
	organizationId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

function packageStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "active":
			return "default";
		case "frozen":
			return "secondary";
		case "expired":
		case "cancelled":
			return "outline";
		default:
			return "outline";
	}
}

function installmentStatusVariant(
	status: string,
): "default" | "secondary" | "outline" | "destructive" {
	switch (status) {
		case "paid":
			return "default";
		case "pending":
			return "secondary";
		case "overdue":
			return "destructive";
		case "locked":
			return "outline";
		default:
			return "outline";
	}
}

const DAY_LABELS: Record<string, string> = {
	monday: "Mon",
	tuesday: "Tue",
	wednesday: "Wed",
	thursday: "Thu",
	friday: "Fri",
	saturday: "Sat",
	sunday: "Sun",
};

// ─── Sub-components ─────────────────────────────────────────────────────────────

function InstallmentsSection({
	packageInstanceId,
	organizationId,
}: {
	packageInstanceId: string;
	organizationId: string;
}) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["installments", organizationId, packageInstanceId],
		queryFn: () =>
			client.installments.listByPackageInstance({
				organizationId,
				packageInstanceId,
			}),
		staleTime: 60_000,
	});

	if (isLoading) {
		return (
			<p className="py-2 text-muted-foreground text-xs">
				Loading installments...
			</p>
		);
	}

	if (error || !data || data.length === 0) {
		return (
			<p className="py-2 text-muted-foreground text-xs">
				{error ? "Failed to load installments." : "No installments found."}
			</p>
		);
	}

	return (
		<div className="overflow-hidden rounded-md border">
			<table className="w-full text-xs">
				<thead className="bg-muted/50">
					<tr>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							#
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Due Date
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Amount
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Status
						</th>
						<th className="px-3 py-2 text-left font-medium text-muted-foreground">
							Paid At
						</th>
					</tr>
				</thead>
				<tbody className="divide-y">
					{data.map((inst, idx) => (
						<tr key={inst.id} className="bg-background">
							<td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
							<td className="px-3 py-2 tabular-nums">
								{formatDate(inst.dueDate)}
							</td>
							<td className="px-3 py-2 tabular-nums">
								{inst.amount != null
									? `MYR ${(inst.amount / 100).toFixed(2)}`
									: "—"}
							</td>
							<td className="px-3 py-2">
								<Badge
									variant={installmentStatusVariant(inst.status ?? "")}
									className="text-xs"
								>
									{inst.status ?? "unknown"}
								</Badge>
							</td>
							<td className="px-3 py-2 text-muted-foreground tabular-nums">
								{inst.paidAt ? formatDate(inst.paidAt) : "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function PreferredTimesSection({
	packageInstanceId,
	organizationId,
}: {
	packageInstanceId: string;
	organizationId: string;
}) {
	const { data, isLoading } = useQuery({
		queryKey: ["preferredTimes", organizationId, packageInstanceId],
		queryFn: () =>
			client.preferredTimes.list({ organizationId, packageInstanceId }),
		staleTime: 60_000,
	});

	if (isLoading) {
		return (
			<p className="py-2 text-muted-foreground text-xs">
				Loading preferred times...
			</p>
		);
	}

	if (!data || data.length === 0) {
		return (
			<p className="py-2 text-muted-foreground text-xs">
				No preferred times set.
			</p>
		);
	}

	// Sort by priority ascending
	const sorted = [...data].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

	return (
		<div className="flex flex-wrap gap-2">
			{sorted.map((pt) => (
				<div
					key={`${pt.dayOfWeek}-${pt.time}`}
					className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs"
				>
					<span className="font-medium">
						{DAY_LABELS[pt.dayOfWeek] ?? pt.dayOfWeek}
					</span>
					<span className="text-muted-foreground">{pt.time}</span>
					<span className="text-muted-foreground/60">#{pt.priority}</span>
				</div>
			))}
		</div>
	);
}

// ─── Main component ─────────────────────────────────────────────────────────────

export function PackageRow({ pkg, organizationId }: PackageRowProps) {
	const [expanded, setExpanded] = useState(false);

	const label = pkg.serviceName ?? pkg.id.slice(0, 8) + "…";
	const credits =
		pkg.creditsUsed != null && pkg.creditsTotal != null
			? `${pkg.creditsUsed} / ${pkg.creditsTotal} credits`
			: null;

	return (
		<div className="rounded-lg border">
			{/* Header row — click to expand */}
			<button
				type="button"
				className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
				onClick={() => setExpanded((v) => !v)}
			>
				<div className="flex min-w-0 flex-col gap-0.5">
					<span className="truncate font-medium text-sm">{label}</span>
					<div className="flex items-center gap-3 text-muted-foreground text-xs">
						{credits && <span>{credits}</span>}
						{pkg.expiresAt && (
							<span>expires {formatDate(pkg.expiresAt)}</span>
						)}
						{pkg.paymentPlanCode && (
							<span className="rounded-sm bg-muted px-1 py-0.5 font-mono">
								{pkg.paymentPlanCode}
							</span>
						)}
					</div>
				</div>
				<div className="ml-3 flex shrink-0 items-center gap-2">
					<Badge variant={packageStatusVariant(pkg.status ?? "")}>
						{pkg.status ?? "unknown"}
					</Badge>
					{expanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
			</button>

			{/* Expanded content */}
			{expanded && (
				<div className="space-y-4 border-t bg-muted/10 px-4 py-4">
					{/* Installments */}
					<div>
						<p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Installments
						</p>
						<InstallmentsSection
							packageInstanceId={pkg.id}
							organizationId={organizationId}
						/>
					</div>

					{/* Preferred Times */}
					<div>
						<p className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
							Preferred Times
						</p>
						<PreferredTimesSection
							packageInstanceId={pkg.id}
							organizationId={organizationId}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
