import { Link } from "@tanstack/react-router";
import { Plus, RefreshCw } from "lucide-react";
import { PERIODS, type Period } from "./types";

interface DashboardHeaderProps {
	period: Period;
	onSelectPeriod: (p: Period) => void;
	onRefresh: () => void;
}

export function DashboardHeader({
	period,
	onSelectPeriod,
	onRefresh,
}: DashboardHeaderProps) {
	return (
		<header className="sticky top-0 z-20 flex h-14 items-center border-b border-[#e5e5e5] bg-white px-7">
			<div className="flex items-center gap-3 text-sm">
				<span className="text-muted-foreground">Dashboard</span>
				<span className="text-[#a3a3a3]">/</span>
				<span className="font-semibold">Overview</span>
			</div>

			{/* Period selector pills */}
			<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
				{PERIODS.map((p) => (
					<button
						key={p.value}
						type="button"
						onClick={() => onSelectPeriod(p.value)}
						className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
							period === p.value
								? "bg-[#0a0a0a] text-white"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{p.label}
					</button>
				))}
			</div>

			<div className="ml-auto flex items-center gap-2">
				<button
					type="button"
					onClick={onRefresh}
					className="rounded-lg p-2 text-muted-foreground transition hover:bg-[#f3f3f3] hover:text-foreground"
					title="Refresh"
				>
					<RefreshCw className="size-4" />
				</button>
				<div className="mx-1 h-6 w-px bg-[#e5e5e5]" />
				<Link
					to="/dashboard/sales/create"
					className="flex items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-semibold transition hover:bg-[#f3f3f3]"
				>
					<Plus className="size-3.5" />
					New Sale
				</Link>
			</div>
		</header>
	);
}
