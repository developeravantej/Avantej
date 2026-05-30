import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { client } from "@/utils/orpc";
import {
	Loader2,
	ShieldAlert,
	TriangleAlert,
	Info,
	Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

type LogEntry = {
	id: string;
	source: "audit" | "activity";
	createdAt: Date | string;
	summary: string;
	action: string | null;
	severity: "info" | "warning" | "danger" | null;
	entityType: string | null;
	actorName: string | null;
	actorInitials: string | null;
	description: string | null;
	creditsChange: number | null;
};

function formatDateTime(val: Date | string | null | undefined): string {
	if (!val) return "—";
	const d = new Date(val);
	return d.toLocaleString("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function SeverityIcon({
	severity,
	source,
}: {
	severity: LogEntry["severity"];
	source: LogEntry["source"];
}) {
	if (source === "activity") {
		return <Activity className="h-3.5 w-3.5 text-blue-500" />;
	}
	if (severity === "danger")
		return <ShieldAlert className="h-3.5 w-3.5 text-red-500" />;
	if (severity === "warning")
		return <TriangleAlert className="h-3.5 w-3.5 text-amber-500" />;
	return <Info className="h-3.5 w-3.5 text-[#737373]" />;
}

function severityDotClass(
	severity: LogEntry["severity"],
	source: LogEntry["source"],
) {
	if (source === "activity") return "bg-blue-400";
	if (severity === "danger") return "bg-red-400";
	if (severity === "warning") return "bg-amber-400";
	return "bg-[#d4d4d4]";
}

function ActionBadge({
	action,
	source,
}: {
	action: string | null;
	source: LogEntry["source"];
}) {
	if (!action) return null;
	const isActivity = source === "activity";
	return (
		<span
			className={cn(
				"inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
				isActivity ? "bg-blue-50 text-blue-700" : "bg-[#f3f3f3] text-[#737373]",
			)}
		>
			{action}
		</span>
	);
}

interface LogsTabProps {
	organizationId: string;
	memberId: string;
	memberUserId: string;
}

export function LogsTab({
	organizationId,
	memberId,
	memberUserId,
}: LogsTabProps) {
	const { data, isLoading, isError } = useQuery({
		queryKey: ["customerLogs", organizationId, memberId],
		queryFn: () =>
			client.auditLogs.listForCustomer({
				organizationId,
				memberId,
				memberUserId,
				limit: 100,
				offset: 0,
			}),
		enabled: !!organizationId && !!memberId && !!memberUserId,
		staleTime: 30_000,
	});

	const rows = (data?.rows ?? []) as LogEntry[];

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Activity Log</CardTitle>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-sm">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading logs…
					</div>
				) : isError ? (
					<p className="py-8 text-center text-muted-foreground text-sm">
						Failed to load logs.
					</p>
				) : rows.length === 0 ? (
					<p className="py-8 text-center text-muted-foreground text-sm">
						No activity recorded for this customer yet.
					</p>
				) : (
					<ol className="relative border-l border-[#e5e5e5] ml-2 space-y-0">
						{rows.map((entry, i) => (
							<li
								key={entry.id}
								className={cn("ml-5 pb-5", i === rows.length - 1 && "pb-0")}
							>
								{/* Timeline dot */}
								<span
									className={cn(
										"absolute -left-[5px] flex h-2.5 w-2.5 items-center justify-center rounded-full border-2 border-white",
										severityDotClass(entry.severity, entry.source),
									)}
								/>

								<div className="flex flex-col gap-1 pt-0.5">
									{/* Header row */}
									<div className="flex flex-wrap items-center gap-2">
										<SeverityIcon
											severity={entry.severity}
											source={entry.source}
										/>
										<span className="text-sm font-medium text-[#0a0a0a] leading-snug">
											{entry.summary}
										</span>
										<ActionBadge action={entry.action} source={entry.source} />
									</div>

									{/* Description (activity entries) */}
									{entry.description && (
										<p className="text-xs text-[#737373] leading-relaxed">
											{entry.description}
										</p>
									)}

									{/* Credits change */}
									{entry.creditsChange !== null &&
										entry.creditsChange !== 0 && (
											<span
												className={cn(
													"inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold",
													entry.creditsChange > 0
														? "bg-emerald-50 text-emerald-700"
														: "bg-red-50 text-red-700",
												)}
											>
												{entry.creditsChange > 0 ? "+" : ""}
												{entry.creditsChange} pts
											</span>
										)}

									{/* Footer row — timestamp + actor */}
									<div className="flex items-center gap-2 text-[10px] text-[#a3a3a3]">
										<span className="font-mono tabular-nums">
											{formatDateTime(entry.createdAt)}
										</span>
										{entry.actorName && (
											<>
												<span>·</span>
												<span>by {entry.actorName}</span>
											</>
										)}
										{entry.entityType && (
											<>
												<span>·</span>
												<span className="capitalize">
													{entry.entityType.replace(/_/g, " ")}
												</span>
											</>
										)}
									</div>
								</div>
							</li>
						))}
					</ol>
				)}
			</CardContent>
		</Card>
	);
}
