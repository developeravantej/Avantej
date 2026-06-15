import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";
import { Search } from "lucide-react";

interface TrainerSidebarProps {
	organizationId: string;
	selectedTrainerId: string | null;
	onSelectTrainer: (trainerId: string | null) => void;
	/** Total appointment count shown next to "All Trainers" */
	totalCount?: number;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.map((p) => p[0])
		.filter(Boolean)
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

export function TrainerSidebar({
	organizationId,
	selectedTrainerId,
	onSelectTrainer,
	totalCount = 0,
}: TrainerSidebarProps) {
	const [searchInput, setSearchInput] = useState("");
	const debouncedSearch = useDebounce(searchInput, 300);

	const { data: trainers = [], isLoading } = useQuery({
		queryKey: ["trainers-sidebar", organizationId],
		queryFn: () =>
			client.members.list({
				organizationId,
				role: "trainer",
				status: "active",
			}),
		enabled: !!organizationId,
		staleTime: 5 * 60 * 1000,
	});

	const filteredTrainers = (trainers as any[]).filter((member: any) => {
		if (!debouncedSearch) return true;
		const displayName = member.name ?? member.email ?? "";
		return displayName.toLowerCase().includes(debouncedSearch.toLowerCase());
	});

	const isAllSelected = selectedTrainerId === null;

	const trainerCount = filteredTrainers.length;

	return (
		<div className="flex h-full flex-col overflow-hidden border-r border-[#e5e5e5] bg-white">
			{/* Header — matches dashboard "Top performers" / "Recent activity" cards */}
			<div className="shrink-0 border-b border-[#e5e5e5] px-5 py-5">
				<div className="flex items-start justify-between">
					<div>
						<div className="text-sm font-semibold">Trainers</div>
						<div className="mt-0.5 text-xs text-[#737373]">
							Filter by who's working today
						</div>
					</div>
					<span className="relative flex size-1.5" title="Live">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
				</div>

				{/* Search */}
				<div className="mt-4 flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
					<Search className="h-3.5 w-3.5 shrink-0 text-[#737373]" />
					<input
						placeholder="Search trainers…"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#737373] text-[#0a0a0a]"
					/>
				</div>

				{/* Tiny meta strip */}
				<div className="mt-3 flex items-baseline justify-between text-[10px] font-bold uppercase tracking-widest text-[#737373]">
					<span>Roster</span>
					{!isLoading && (
						<span className="font-mono tabular-nums text-[#0a0a0a]">
							{trainerCount} active
						</span>
					)}
				</div>
			</div>

			{/* Trainer list — modeled on dashboard "Top performers" row pattern */}
			<ul className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e5e5e5] [&::-webkit-scrollbar-track]:bg-transparent">
				{/* All Trainers row — highlighted slot, like rank-1 in Top performers */}
				<li
					role="button"
					tabIndex={0}
					onClick={() => onSelectTrainer(null)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") onSelectTrainer(null);
					}}
					className={cn(
						"flex cursor-pointer items-center gap-3 border-b border-[#e5e5e5] px-5 py-3 transition-colors",
						isAllSelected ? "bg-[#f3f3f3]" : "hover:bg-[#f3f3f3]",
					)}
				>
					<div className="relative">
						<span className="inline-flex size-7 items-center justify-center rounded-full bg-[#0a0a0a] text-[11px] font-bold text-white">
							AT
						</span>
						<span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-[#d6cdb1] text-[9px] font-bold">
							★
						</span>
					</div>
					<div className="min-w-0 flex-1">
						<div className="truncate text-xs font-semibold">All trainers</div>
						<div className="text-[10px] text-[#737373]">
							<span className="font-mono tabular-nums">{totalCount}</span>{" "}
							booking{totalCount !== 1 ? "s" : ""}
						</div>
					</div>
					{isAllSelected && (
						<span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
					)}
				</li>

				{/* Loading skeletons */}
				{isLoading &&
					[1, 2, 3].map((i) => (
						<li
							key={i}
							className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-3"
						>
							<div className="size-7 animate-pulse rounded-full bg-[#f3f3f3]" />
							<div className="flex-1 space-y-1.5">
								<div className="h-3 w-28 animate-pulse rounded bg-[#f3f3f3]" />
								<div className="h-2 w-16 animate-pulse rounded bg-[#f3f3f3]" />
							</div>
						</li>
					))}

				{/* Individual trainers */}
				{!isLoading &&
					filteredTrainers.map((member: any) => {
						const displayName =
							member.displayName ?? member.name ?? member.email ?? "?";
						const isSelected = selectedTrainerId === member.id;

						return (
							<li
								key={member.id}
								role="button"
								tabIndex={0}
								onClick={() => onSelectTrainer(member.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ")
										onSelectTrainer(member.id);
								}}
								className={cn(
									"flex cursor-pointer items-center gap-3 border-b border-[#e5e5e5] px-5 py-3 transition-colors",
									isSelected ? "bg-[#f3f3f3]" : "hover:bg-[#f3f3f3]",
								)}
							>
								<span
									className={cn(
										"inline-flex size-7 items-center justify-center rounded-full text-[11px] font-bold",
										isSelected
											? "bg-[#0a0a0a] text-white"
											: "bg-[#f3f3f3] text-[#0a0a0a]",
									)}
								>
									{getInitials(displayName)}
								</span>
								<div className="min-w-0 flex-1">
									<div className="truncate text-xs font-semibold text-[#0a0a0a]">
										{displayName}
									</div>
									<div className="text-[10px] text-[#737373]">Trainer</div>
								</div>
								{isSelected && (
									<span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
								)}
							</li>
						);
					})}

				{!isLoading && filteredTrainers.length === 0 && (
					<li className="flex flex-col items-center justify-center px-5 py-10">
						<p className="text-xs font-medium text-[#0a0a0a]">
							{debouncedSearch ? "No matches" : "No trainers"}
						</p>
						<p className="mt-1 text-[11px] text-[#737373]">
							{debouncedSearch
								? "Try a different search term."
								: "Invite trainers to see them here."}
						</p>
					</li>
				)}
			</ul>
		</div>
	);
}
