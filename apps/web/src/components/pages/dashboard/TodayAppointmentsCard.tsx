import { Link } from "@tanstack/react-router";
import { AlertTriangle, Calendar } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

interface ApptItem {
	id: string;
	startTime: unknown;
}

interface TodayAppointmentsCardProps {
	appts: ApptItem[];
	hourBuckets: Map<number, number>;
	isError: boolean;
	onRetry: () => void;
}

export function TodayAppointmentsCard({
	appts,
	hourBuckets,
	isError,
	onRetry,
}: TodayAppointmentsCardProps) {
	return (
		<div className="col-span-12 rounded-2xl border border-[#e5e5e5] bg-white p-6 transition hover:shadow-md">
			<div className="mb-5 flex items-center justify-between">
				<div>
					<div className="text-sm font-semibold">Today's appointments</div>
					<div className="mt-0.5 text-xs text-muted-foreground">
						{isError
							? "Could not load"
							: `${appts.length} booking${appts.length === 1 ? "" : "s"}`}
					</div>
				</div>
				<div className="flex items-center gap-2">
					<Link
						to="/dashboard/appointment/view"
						className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-[#f3f3f3] hover:text-foreground"
					>
						<Calendar className="mr-1 inline size-3.5" /> Open calendar
					</Link>
				</div>
			</div>

			{isError ? (
				<div className="flex h-32 items-center justify-center gap-2 rounded-xl border border-[#e5e5e5] text-destructive text-sm">
					<AlertTriangle className="size-4 shrink-0" />
					<span>Failed to load appointments.</span>
					<button
						type="button"
						onClick={onRetry}
						className="underline underline-offset-2 hover:opacity-70"
					>
						Retry
					</button>
				</div>
			) : (
				<>
					<div className="grid grid-cols-15 gap-0.5 text-[10px] font-medium text-muted-foreground">
						{Array.from({ length: 15 }, (_, i) => i + 8).map((h) => (
							<span key={h} className="text-center">
								{h}
							</span>
						))}
					</div>

					<div
						className="mt-2 grid h-24 gap-0.5 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-2"
						style={{
							gridTemplateColumns: "repeat(15, minmax(0, 1fr))",
						}}
					>
						{Array.from({ length: 15 }, (_, i) => i + 8).map((h) => {
							const n = hourBuckets.get(h) ?? 0;
							if (n === 0) return <div key={h} />;
							return (
								<Tooltip key={h}>
									<TooltipTrigger asChild>
										<div className="flex flex-col items-center justify-center gap-1 rounded-md bg-[#0a0a0a] px-1 py-1 text-[10px] font-bold text-white cursor-default">
											<span>{h}:00</span>
											<span className="font-mono opacity-70">×{n}</span>
										</div>
									</TooltipTrigger>
									<TooltipContent>
										{n} booking{n === 1 ? "" : "s"} at {h}:00
									</TooltipContent>
								</Tooltip>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
