/**
 * Platform Admin — Audit Log (Plan E E.6).
 *
 * Read-only view over admin_session_actions. Filters: action type,
 * admin user (free-text id), target org, date range.
 */

import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusCallout } from "@/components/ui/status-callout";
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

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/platform-admin/audit",
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
	component: PlatformAdminAuditPage,
});

function PlatformAdminAuditPage() {
	const [actionType, setActionType] = useState<string>("any");
	const [adminUserId, setAdminUserId] = useState("");
	const [targetOrg, setTargetOrg] = useState("");
	const [since, setSince] = useState("");
	const [until, setUntil] = useState("");
	const [page, setPage] = useState(1);
	const limit = 50;

	const dAdmin = useDebounce(adminUserId, 300);
	const dTarget = useDebounce(targetOrg, 300);

	const { data: typesData } = useQuery({
		queryKey: ["platformAdminAudit", "listActionTypes"],
		queryFn: () => client.platformAdminAudit.listActionTypes({}),
	});

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: [
			"platformAdminAudit",
			"listAdminActions",
			{ actionType, dAdmin, dTarget, since, until, page },
		],
		queryFn: () =>
			client.platformAdminAudit.listAdminActions({
				actionType: actionType === "any" ? undefined : actionType,
				adminUserId: dAdmin || undefined,
				targetOrganizationId: isUuid(dTarget) ? dTarget : undefined,
				since: since ? new Date(since).toISOString() : undefined,
				until: until ? new Date(until).toISOString() : undefined,
				page,
				limit,
			}),
	});

	const actions = data?.actions ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / limit));
	const hasFilters =
		actionType !== "any" ||
		Boolean(dAdmin) ||
		Boolean(dTarget) ||
		Boolean(since) ||
		Boolean(until);

	return (
		<div className="p-6 space-y-4">
			<div>
				<div className="text-sm text-muted-foreground">Platform admin</div>
				<h1 className="text-2xl font-semibold">Audit log</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Every platform-admin action is recorded here. Impersonation actions
					(session-scoped) and direct actions (lifecycle, comms) share this
					table.
				</p>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-5 gap-3">
				<Select
					value={actionType}
					onValueChange={(v) => {
						setActionType(v);
						setPage(1);
					}}
				>
					<SelectTrigger>
						<SelectValue placeholder="Action type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="any">Any action</SelectItem>
						{(typesData?.actionTypes ?? []).map((t) => (
							<SelectItem key={t} value={t}>
								{t}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					placeholder="Admin user id"
					value={adminUserId}
					onChange={(e) => {
						setAdminUserId(e.target.value);
						setPage(1);
					}}
				/>
				<Input
					placeholder="Target org UUID"
					value={targetOrg}
					onChange={(e) => {
						setTargetOrg(e.target.value);
						setPage(1);
					}}
				/>
				<Input
					type="datetime-local"
					value={since}
					onChange={(e) => {
						setSince(e.target.value);
						setPage(1);
					}}
				/>
				<Input
					type="datetime-local"
					value={until}
					onChange={(e) => {
						setUntil(e.target.value);
						setPage(1);
					}}
				/>
			</div>

			<div className="text-sm text-muted-foreground">
				{isLoading ? "Loading…" : `${total} action${total === 1 ? "" : "s"}`}
			</div>

			{error ? (
				<StatusCallout
					variant="error"
					title="Couldn't load audit log"
					message={error instanceof Error ? error.message : "An error occurred"}
					onRetry={() => refetch()}
				/>
			) : (
				<div className="flex h-full flex-col rounded-2xl border border-brand-secondary-3 bg-card overflow-hidden">
					<div className="flex-1 overflow-y-auto">
						<Table>
							<TableHeader>
								<TableRow className="sticky top-0 z-10 bg-white">
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										When
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Action
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Actor
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Target
									</TableHead>
									<TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-6 py-3">
										Metadata
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{actions.length === 0 && !isLoading && (
									<TableRow>
										<TableCell colSpan={5} className="p-0">
											<EmptyState
												icon={ScrollText}
												title={
													hasFilters
														? "No actions match your filters"
														: "No actions recorded yet"
												}
												description={
													hasFilters
														? "Try adjusting or clearing your filters."
														: undefined
												}
												context={hasFilters ? "search" : "empty"}
											/>
										</TableCell>
									</TableRow>
								)}
								{actions.map((a) => (
									<TableRow key={a.id} className="hover:bg-muted/30">
										<TableCell className="text-sm px-6 py-4 whitespace-nowrap font-mono">
											{new Date(a.createdAt).toLocaleString()}
										</TableCell>
										<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
											<Badge variant="outline" className="font-mono text-xs">
												{a.actionType}
											</Badge>
											{a.adminSessionId && (
												<Badge
													variant="outline"
													className="ml-1 text-xs border-blue-200 bg-blue-50 text-blue-700"
												>
													impersonation
												</Badge>
											)}
										</TableCell>
										<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
											<div>{a.actorEmail ?? "—"}</div>
											{a.actorName && (
												<div className="text-xs text-muted-foreground">
													{a.actorName}
												</div>
											)}
										</TableCell>
										<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
											{a.targetOrganizationId ? (
												<Link
													to="/dashboard/platform-admin/tenants/$id"
													params={{ id: a.targetOrganizationId }}
													className="hover:underline"
												>
													{a.targetOrgName ?? a.targetOrganizationId}
												</Link>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
											{a.targetUserId && (
												<div className="text-xs text-muted-foreground font-mono">
													user {a.targetUserId}
												</div>
											)}
										</TableCell>
										<TableCell className="text-sm px-6 py-4 whitespace-nowrap">
											<MetadataCell metadata={a.metadata} />
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</div>
			)}

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

function MetadataCell({ metadata }: { metadata: unknown }) {
	if (metadata === null || metadata === undefined) {
		return <span className="text-muted-foreground text-xs">—</span>;
	}
	const s = JSON.stringify(metadata);
	const truncated = s.length > 100 ? `${s.slice(0, 100)}…` : s;
	return (
		<code className="font-mono text-xs text-muted-foreground" title={s}>
			{truncated}
		</code>
	);
}

function isUuid(s: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		s,
	);
}
