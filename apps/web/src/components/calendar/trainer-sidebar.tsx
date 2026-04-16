"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import { useDebounce } from "@/hooks/useDebounce";

interface TrainerSidebarProps {
	organizationId: string;
	selectedTrainerId: string | null; // null = "All Trainers"
	onSelectTrainer: (trainerId: string | null) => void;
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

	const filteredTrainers = trainers.filter((member) => {
		if (!debouncedSearch) return true;
		const displayName = member.displayName ?? member.userId ?? "";
		return displayName.toLowerCase().includes(debouncedSearch.toLowerCase());
	});

	return (
		<Card className="h-full">
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-base font-semibold">
					<Users className="h-4 w-4" />
					Trainers
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{/* Search input */}
				<div className="relative">
					<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search trainers..."
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						className="pl-8 h-8 text-sm"
					/>
				</div>

				{/* Trainer list */}
				<div className="space-y-1">
					{/* "All Trainers" option */}
					<button
						type="button"
						onClick={() => onSelectTrainer(null)}
						className={cn(
							"w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
							"hover:bg-accent hover:text-accent-foreground",
							selectedTrainerId === null
								? "bg-accent text-accent-foreground font-medium"
								: "text-foreground",
						)}
					>
						All Trainers
					</button>

					{/* Loading state */}
					{isLoading && (
						<div className="space-y-1 pt-1">
							{[1, 2, 3].map((i) => (
								<div
									key={i}
									className="h-9 w-full animate-pulse rounded-md bg-muted"
								/>
							))}
						</div>
					)}

					{/* Trainer items */}
					{!isLoading &&
						filteredTrainers.map((member) => {
							const displayName =
								member.displayName ?? member.userId ?? "Unknown";
							const isSelected = selectedTrainerId === member.id;

							return (
								<button
									key={member.id}
									type="button"
									onClick={() => onSelectTrainer(member.id)}
									className={cn(
										"w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
										"hover:bg-accent hover:text-accent-foreground",
										isSelected
											? "bg-accent text-accent-foreground font-medium"
											: "text-foreground",
									)}
								>
									<span className="block truncate">{displayName}</span>
									<span className="block text-xs text-muted-foreground">
										Trainer
									</span>
								</button>
							);
						})}

					{/* Empty state */}
					{!isLoading && filteredTrainers.length === 0 && (
						<p className="px-3 py-2 text-xs text-muted-foreground">
							{debouncedSearch ? "No trainers match your search." : "No trainers found."}
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
