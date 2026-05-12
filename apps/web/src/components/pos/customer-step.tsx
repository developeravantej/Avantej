import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import type { SelectedCustomer } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
	type: "member" | "walk_in";
	id: string;
	name: string;
	phone: string | null;
	email?: string | null;
	branchId: string;
	lastVisitAt?: Date | string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
	return name
		.split(" ")
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

// ─── Component ────────────────────────────────────────────────────────────────

interface CustomerStepProps {
	organizationId: string;
	branchId: string | null;
	selected: SelectedCustomer | null;
	onSelect: (customer: SelectedCustomer) => void;
	onClear: () => void;
}

export function CustomerStep({
	organizationId,
	branchId,
	selected,
	onSelect,
	onClear,
}: CustomerStepProps) {
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query, 250);

	const { data: results = [], isFetching } = useQuery({
		queryKey: [
			"pos-search-customers",
			organizationId,
			debouncedQuery,
			branchId,
		],
		queryFn: async () => {
			return client.pos.searchCustomers({
				organizationId,
				query: debouncedQuery,
				branchId: branchId ?? undefined,
			}) as Promise<SearchResult[]>;
		},
		enabled: !!organizationId,
		staleTime: 30_000,
	});

	function handleSelect(result: SearchResult) {
		onSelect({
			type: result.type,
			id: result.id,
			name: result.name,
			phone: result.phone,
			email: result.email,
			branchId: result.branchId,
		});
		setQuery("");
	}

	// ── Render: selected ──────────────────────────────────────────────────────

	if (selected) {
		const initials = getInitials(selected.name);
		return (
			<div className="flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 p-3.5">
				<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
					{initials}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-sm">{selected.name}</p>
					<div className="flex items-center gap-2 text-muted-foreground text-xs">
						<Badge
							variant={selected.type === "member" ? "default" : "secondary"}
							className="text-xs"
						>
							{selected.type === "member" ? "Member" : "Walk-in"}
						</Badge>
						{selected.phone && <span>{selected.phone}</span>}
					</div>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
					onClick={onClear}
					type="button"
					aria-label="Clear customer selection"
				>
					<X className="size-4" />
				</Button>
			</div>
		);
	}

	// ── Render: list + search ─────────────────────────────────────────────────

	const filtered = query.trim()
		? results.filter(
				(r) =>
					r.name.toLowerCase().includes(query.toLowerCase()) ||
					r.email?.toLowerCase().includes(query.toLowerCase()) ||
					r.phone?.includes(query),
			)
		: results;

	return (
		<div className="space-y-3">
			{/* Search input */}
			<div className="relative">
				<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search by name, email or phone..."
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="pl-9 pr-9"
					autoComplete="off"
				/>
				{isFetching && (
					<div className="absolute top-1/2 right-3 -translate-y-1/2">
						<div className="size-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
					</div>
				)}
			</div>

			{/* Customer list */}
			<div className="overflow-hidden rounded-xl border bg-background">
				{isFetching && filtered.length === 0 ? (
					<div className="space-y-1 p-2">
						{[...Array(3)].map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
								<div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
								<div className="flex-1 space-y-1.5">
									<div className="h-3 w-32 animate-pulse rounded bg-muted" />
									<div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
								</div>
							</div>
						))}
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-1 py-8 text-muted-foreground">
						<p className="text-sm font-medium">No customers found</p>
						{query && (
							<p className="text-xs">Try a different name, email or phone</p>
						)}
					</div>
				) : (
					<ul className="max-h-60 divide-y overflow-y-auto">
						{filtered.map((r) => (
							<li key={`${r.type}-${r.id}`}>
								<button
									type="button"
									className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
									onClick={() => handleSelect(r)}
								>
									<div className={cn(
										"flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-xs",
										r.type === "walk_in"
											? "bg-brand-secondary-2 text-brand-primary-1"
											: "bg-primary text-primary-foreground"
									)}>
										{getInitials(r.name)}
									</div>
									<div className="min-w-0 flex-1">
										<p className="truncate font-medium text-sm">{r.name}</p>
										<p className="truncate text-muted-foreground text-xs">
											{r.phone ?? r.email ?? "No contact info"}
										</p>
									</div>
									<Badge
										variant={r.type === "member" ? "default" : "secondary"}
										className="shrink-0 text-xs"
									>
										{r.type === "member" ? "Member" : "Walk-in"}
									</Badge>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
