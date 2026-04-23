import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, Check } from "lucide-react";

import { orpc } from "@/utils/orpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

interface HierarchyNode {
	id: string;
	name: string;
	type: string;
	depth: number;
	parentId: string | null;
}

export interface BranchComboboxProps {
	organizationId: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

/**
 * @deprecated Use `BranchSelector` from `@/components/branch/branch-selector` instead.
 * This path will be removed after one PR cycle.
 */
export function BranchCombobox({
	organizationId,
	value,
	onChange,
	placeholder = "Select branch...",
	disabled = false,
}: BranchComboboxProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { data } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId },
		}),
		enabled: !!organizationId,
	});

	const branches = useMemo(
		() =>
			((data?.nodes ?? []) as HierarchyNode[]).filter(
				(n) => n.type === "branch",
			),
		[data],
	);

	const filtered = useMemo(() => {
		if (!search.trim()) return branches;
		const q = search.trim().toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(q));
	}, [branches, search]);

	const selectedName = useMemo(
		() => branches.find((b) => b.id === value)?.name ?? null,
		[branches, value],
	);

	function handleSelect(id: string) {
		onChange(id === value ? "" : id);
		setOpen(false);
		setSearch("");
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className="w-full justify-between font-normal"
				>
					<span className={cn(!selectedName && "text-muted-foreground")}>
						{selectedName ?? placeholder}
					</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<div className="p-2 border-b">
					<Input
						placeholder="Search branches..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 text-sm"
					/>
				</div>
				<div className="max-h-60 overflow-y-auto py-1">
					{filtered.length === 0 ? (
						<p className="px-3 py-4 text-center text-sm text-muted-foreground">
							No branches found.
						</p>
					) : (
						filtered.map((branch) => (
							<button
								key={branch.id}
								type="button"
								className={cn(
									"flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-default select-none",
									value === branch.id && "bg-accent text-accent-foreground",
								)}
								onClick={() => handleSelect(branch.id)}
							>
								<Check
									className={cn(
										"h-4 w-4 shrink-0",
										value === branch.id ? "opacity-100" : "opacity-0",
									)}
								/>
								{branch.name}
							</button>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
