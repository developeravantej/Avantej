/**
 * Platform Admin — Comms Outbox list (Plan F.2.5, Agent C).
 *
 * Read-only table of DMs + announcements sent by platform admins.
 * Parent owns filter + pagination state and passes data + handlers.
 */

import { Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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

export type OutboxRow = {
	id: string;
	kind: "direct_message" | "announcement";
	actionType: string;
	actor: { id: string; name: string | null; email: string | null } | null;
	targetOrg: { id: string; name: string } | null;
	subject: string;
	metadata: unknown;
	sentAt: Date | string;
};

export type CommsOutboxListProps = {
	rows: OutboxRow[];
	total: number;
	page: number;
	limit: number;
	isLoading?: boolean;
	kindFilter: "all" | "direct_message" | "announcement";
	daysFilter: number;
	actorFilter: string;
	targetOrgFilter: string;
	onKindChange: (k: "all" | "direct_message" | "announcement") => void;
	onDaysChange: (d: number) => void;
	onActorChange: (v: string) => void;
	onTargetOrgChange: (v: string) => void;
	onPageChange: (p: number) => void;
};

export function CommsOutboxList(props: CommsOutboxListProps) {
	const totalPages = Math.max(1, Math.ceil(props.total / props.limit));
	return (
		<div className="space-y-4" data-testid="comms-outbox-panel">
			<div className="grid grid-cols-1 md:grid-cols-4 gap-3">
				<Select
					value={props.kindFilter}
					onValueChange={(v) => props.onKindChange(v as typeof props.kindFilter)}
				>
					<SelectTrigger data-testid="outbox-kind-filter">
						<SelectValue placeholder="Kind" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All kinds</SelectItem>
						<SelectItem value="direct_message">Direct messages</SelectItem>
						<SelectItem value="announcement">Announcements</SelectItem>
					</SelectContent>
				</Select>
				<Select
					value={String(props.daysFilter)}
					onValueChange={(v) => props.onDaysChange(Number(v))}
				>
					<SelectTrigger data-testid="outbox-days-filter">
						<SelectValue placeholder="Date range" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="7">Last 7 days</SelectItem>
						<SelectItem value="30">Last 30 days</SelectItem>
						<SelectItem value="90">Last 90 days</SelectItem>
					</SelectContent>
				</Select>
				<Input
					placeholder="Actor user id"
					value={props.actorFilter}
					onChange={(e) => props.onActorChange(e.target.value)}
					data-testid="outbox-actor-filter"
				/>
				<Input
					placeholder="Target org UUID"
					value={props.targetOrgFilter}
					onChange={(e) => props.onTargetOrgChange(e.target.value)}
					data-testid="outbox-target-filter"
				/>
			</div>

			<div className="text-sm text-muted-foreground">
				{props.isLoading
					? "Loading…"
					: `${props.total} message${props.total === 1 ? "" : "s"}`}
			</div>

			<div className="overflow-hidden rounded-xl border border-border bg-card">
				<Table>
					<TableHeader className="sticky top-0 z-10 bg-white">
						<TableRow className="hover:bg-transparent">
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Sent
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Kind
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Actor
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Target
							</TableHead>
							<TableHead className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
								Subject
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{props.rows.length === 0 && !props.isLoading && (
							<TableRow className="hover:bg-transparent">
								<TableCell colSpan={5} className="p-0">
									<EmptyState
										icon={Inbox}
										title="No comms in this window"
										description="Try a different kind or date range."
										context="search"
									/>
								</TableCell>
							</TableRow>
						)}
						{props.rows.map((r) => {
							const ts = new Date(r.sentAt);
							return (
								<TableRow
									key={r.id}
									data-testid={`outbox-row-${r.id}`}
									className="hover:bg-muted/30"
								>
									<TableCell
										className="px-6 py-4 text-sm whitespace-nowrap font-mono text-xs"
										title={ts.toISOString()}
									>
										{ts.toLocaleString()}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<Badge
											variant={
												r.kind === "announcement" ? "secondary" : "outline"
											}
										>
											{r.kind === "direct_message" ? "DM" : "Announce"}
										</Badge>
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										<div>{r.actor?.email ?? "—"}</div>
										{r.actor?.name && (
											<div className="text-xs text-muted-foreground">
												{r.actor.name}
											</div>
										)}
									</TableCell>
									<TableCell className="px-6 py-4 text-sm whitespace-nowrap">
										{r.targetOrg ? (
											<Link
												to="/dashboard/platform-admin/tenants/$id"
												params={{ id: r.targetOrg.id }}
												className="hover:underline"
											>
												{r.targetOrg.name}
											</Link>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell
										className="px-6 py-4 text-sm whitespace-nowrap max-w-md truncate"
										title={r.subject}
									>
										{r.subject}
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			<div className="flex items-center justify-between text-sm">
				<div className="text-muted-foreground">
					Page {props.page} of {totalPages}
				</div>
				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						disabled={props.page <= 1}
						onClick={() => props.onPageChange(Math.max(1, props.page - 1))}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={props.page >= totalPages}
						onClick={() => props.onPageChange(props.page + 1)}
					>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
