"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";

interface TrainerSidebarProps {
	organizationId: string;
	selectedTrainerId: string | null;
	onSelectTrainer: (trainerId: string | null) => void;
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

	const filteredTrainers = trainers.filter((member: any) => {
		if (!debouncedSearch) return true;
		const displayName = member.name ?? member.email ?? "";
		return displayName.toLowerCase().includes(debouncedSearch.toLowerCase());
	});

	const isAllSelected = selectedTrainerId === null;

	return (
		<div className="h-full flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
			<div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
				<div className="flex items-center justify-between mb-3">
					<div className="flex items-center gap-2">
						<Users className="size-4 text-gray-500" />
						<span className="text-sm font-semibold text-gray-900">Trainers</span>
					</div>
					<span className="inline-flex items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 min-w-[1.5rem]">
						{trainers.length}
					</span>
				</div>
				<div className="relative">
					<Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
					<Input
						placeholder="Search trainers..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="pl-9 h-9 text-sm rounded-xl border-gray-200 bg-gray-50 focus:bg-white placeholder:text-gray-400"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
				<button
					type="button"
					onClick={() => onSelectTrainer(null)}
					className={cn(
						"w-full p-2 rounded-xl flex items-center gap-3 transition-colors text-left",
						isAllSelected
							? "bg-blue-50 border-l-2 border-blue-500 pl-[calc(0.5rem-2px)]"
							: "hover:bg-gray-50",
					)}
				>
					<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
						<Users className="size-4 text-gray-500" />
					</div>
					<div className="min-w-0 flex-1">
						<p className={cn("text-sm font-semibold truncate", isAllSelected ? "text-blue-700" : "text-gray-900")}>
							All Trainers
						</p>
						<p className="text-xs text-gray-400 truncate">View all</p>
					</div>
				</button>

				{isLoading && (
					<div className="space-y-1.5 mt-1.5">
						{[1, 2, 3].map((n) => (
							<div key={`skel-${n}`} className="h-12 rounded-xl animate-pulse bg-gray-100" />
						))}
					</div>
				)}

				{!isLoading &&
					filteredTrainers.map((member: any) => {
						const displayName =
							member.displayName ?? member.name ?? member.email ?? "?";
						const isSelected = selectedTrainerId === member.id;

						return (
							<button
								key={member.id}
								type="button"
								onClick={() => onSelectTrainer(member.id)}
								className={cn(
									"w-full p-2 rounded-xl flex items-center gap-3 transition-colors text-left mt-1",
									isSelected
										? "bg-blue-50 border-l-2 border-blue-500 pl-[calc(0.5rem-2px)]"
										: "hover:bg-gray-50",
								)}
							>
								<div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-xs font-bold">
									{getInitials(displayName)}
								</div>
								<div className="min-w-0 flex-1">
									<p className={cn("text-sm font-medium truncate", isSelected ? "text-blue-700" : "text-gray-900")}>
										{displayName}
									</p>
									<p className="text-xs text-gray-400 truncate">Trainer</p>
								</div>
							</button>
						);
					})}

				{!isLoading && filteredTrainers.length === 0 && (
					<div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
						<Users className="size-5 text-gray-300" />
						<p className="text-xs text-muted-foreground">
							{debouncedSearch ? "No trainers match your search." : "No trainers found."}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
