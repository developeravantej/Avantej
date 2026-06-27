import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useScope } from "@/components/scope/ScopeProvider";

/**
 * Tenant scope switcher. Options are the caller's accessible hierarchy nodes
 * (RBAC ceiling) depth-ordered into a country→state→branch tree, with a pinned
 * "All" entry that maps to the top accessible node. A single accessible node
 * renders a static label (nothing to switch).
 */
export function ScopeSwitcher({ className }: { className?: string }) {
	const {
		scopeNodes,
		activeScopeId,
		activeScopeNode,
		setActiveScope,
		resetScope,
		topAccessibleNodeId,
		isAllScope,
		isScopeReady,
	} = useScope();

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const topNode = useMemo(
		() =>
			scopeNodes.find((n) => n.id === topAccessibleNodeId) ??
			scopeNodes[0] ??
			null,
		[scopeNodes, topAccessibleNodeId],
	);
	const baseDepth = topNode?.depth ?? 0;

	// The top node is represented by the "All" entry, so it is not listed twice.
	const descendants = useMemo(
		() => scopeNodes.filter((n) => n.id !== topAccessibleNodeId),
		[scopeNodes, topAccessibleNodeId],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return descendants;
		return descendants.filter((n) => n.name.toLowerCase().includes(q));
	}, [descendants, search]);

	// Don't flash a wrong/empty scope before the provider has resolved.
	if (!isScopeReady) return null;

	// Single accessible node → nothing to switch; static label.
	if (scopeNodes.length <= 1) {
		return (
			<div
				data-testid="scope-switcher-static"
				className={cn(
					"flex items-center gap-2 px-3 py-2 text-sm font-medium",
					className,
				)}
			>
				<Globe className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">
					{activeScopeNode?.name ?? scopeNodes[0]?.name ?? "—"}
				</span>
			</div>
		);
	}

	const triggerLabel = isAllScope
		? `All · ${topNode?.name ?? ""}`.trim()
		: (activeScopeNode?.name ?? "Select scope");

	function handleSelect(nodeId: string) {
		setActiveScope(nodeId);
		setOpen(false);
		setSearch("");
	}

	function handleAll() {
		resetScope();
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
					aria-controls="scope-switcher-list"
					className={cn("w-full justify-between font-normal", className)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Globe className="size-4 shrink-0 opacity-60" />
						<span className="truncate">{triggerLabel}</span>
					</span>
					<ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				id="scope-switcher-list"
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
			>
				<div className="border-b p-2">
					<Input
						placeholder="Search branches..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="h-8 text-sm"
					/>
				</div>
				<div className="max-h-72 overflow-y-auto py-1">
					{/* "All" entry — pinned to top, hidden while searching. */}
					{search.trim() === "" && (
						<button
							type="button"
							role="option"
							aria-selected={isAllScope}
							className={cn(
								"flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
								isAllScope && "bg-accent text-accent-foreground",
							)}
							onClick={handleAll}
						>
							<Check
								className={cn(
									"size-4 shrink-0",
									isAllScope ? "opacity-100" : "opacity-0",
								)}
							/>
							<span className="font-medium">All</span>
							<span className="truncate text-xs text-muted-foreground">
								{topNode?.name}
							</span>
						</button>
					)}
					{filtered.length === 0 ? (
						<p className="px-3 py-4 text-center text-sm text-muted-foreground">
							No branches found.
						</p>
					) : (
						filtered.map((n) => {
							const selected = !isAllScope && n.id === activeScopeId;
							return (
								<button
									key={n.id}
									type="button"
									role="option"
									aria-selected={selected}
									className={cn(
										"flex w-full items-center gap-2 py-2 pr-3 text-sm hover:bg-accent hover:text-accent-foreground",
										selected && "bg-accent text-accent-foreground",
									)}
									style={{
										paddingLeft: `${0.75 + Math.max(0, n.depth - baseDepth) * 1}rem`,
									}}
									onClick={() => handleSelect(n.id)}
								>
									<Check
										className={cn(
											"size-4 shrink-0",
											selected ? "opacity-100" : "opacity-0",
										)}
									/>
									<span className="truncate">{n.name}</span>
									<span className="ml-auto text-[10px] uppercase text-muted-foreground">
										{n.type}
									</span>
								</button>
							);
						})
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
