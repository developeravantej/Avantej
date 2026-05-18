/**
 * Platform Admin ⌘K command palette (Plan F.1, Agent S).
 *
 * Cross-tenant search overlay for any platform-admin route. Calls
 * `platformAdminTenants.search.search` with a 250ms-debounced query,
 * ranks results (id > slug > name > email), and navigates to the
 * tenant drill-in route on selection.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { client } from "@/utils/orpc";
import {
	useCommandPaletteHotkey,
	useCommandPaletteState,
	closeCommandPalette,
} from "@/hooks/use-command-palette";

type MatchType = "id" | "name" | "slug" | "email";

type SearchResult = {
	orgId: string;
	orgName: string;
	slug: string;
	matchType: MatchType;
	matchedField?: string;
};

function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}

const MATCH_LABEL: Record<MatchType, string> = {
	id: "ID",
	slug: "slug",
	name: "name",
	email: "email",
};

export function CommandPalette() {
	useCommandPaletteHotkey();
	const { open, setOpen } = useCommandPaletteState();
	const navigate = useNavigate();

	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounced(query, 250);
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const reqIdRef = useRef(0);

	// Reset on close.
	useEffect(() => {
		if (!open) {
			setQuery("");
			setResults([]);
			setError(null);
			setLoading(false);
		}
	}, [open]);

	useEffect(() => {
		const q = debouncedQuery.trim();
		if (q.length === 0) {
			setResults([]);
			setError(null);
			setLoading(false);
			return;
		}
		const myReq = ++reqIdRef.current;
		setLoading(true);
		setError(null);
		client.platformAdminTenants.search
			.search({ query: q, limit: 10 })
			.then((res) => {
				if (myReq !== reqIdRef.current) return;
				setResults((res?.results ?? []) as SearchResult[]);
				setLoading(false);
			})
			.catch((e: unknown) => {
				if (myReq !== reqIdRef.current) return;
				setError((e as Error)?.message ?? "Search failed");
				setResults([]);
				setLoading(false);
			});
	}, [debouncedQuery]);

	const handleSelect = (orgId: string) => {
		closeCommandPalette();
		navigate({
			to: "/dashboard/platform-admin/tenants/$id",
			params: { id: orgId },
		});
	};

	const showEmptyHint = query.trim().length === 0;
	const showNoResults =
		!loading && !error && query.trim().length > 0 && results.length === 0;

	const dialogTitle = useMemo(() => "Search tenants", []);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent
				className="p-0 max-w-2xl overflow-hidden"
				data-testid="command-palette"
			>
				<DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
				<DialogDescription className="sr-only">
					Cross-tenant search for platform admins. Type a tenant id, name, slug,
					or member email.
				</DialogDescription>
				<Command shouldFilter={false} loop>
					<div className="flex items-center border-b px-3">
						<Search className="h-4 w-4 mr-2 shrink-0 opacity-60" />
						<Command.Input
							autoFocus
							value={query}
							onValueChange={setQuery}
							placeholder="Search tenants by id / name / slug / member email…"
							className="flex h-12 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
							data-testid="command-palette-input"
						/>
						{loading && (
							<Loader2
								className="h-4 w-4 ml-2 animate-spin opacity-60"
								data-testid="command-palette-loading"
							/>
						)}
					</div>

					<Command.List
						className="max-h-[400px] overflow-y-auto overflow-x-hidden p-1"
						data-testid="command-palette-list"
					>
						{showEmptyHint && (
							<div
								className="py-6 text-center text-sm text-muted-foreground"
								data-testid="command-palette-empty-hint"
							>
								Type a tenant id, name, slug, or member email to search.
							</div>
						)}

						{error && (
							<div
								className="py-6 text-center text-sm text-destructive"
								data-testid="command-palette-error"
							>
								{error}
							</div>
						)}

						{showNoResults && (
							<Command.Empty
								className="py-6 text-center text-sm text-muted-foreground"
								data-testid="command-palette-no-results"
							>
								No matches
							</Command.Empty>
						)}

						{results.length > 0 && (
							<Command.Group>
								{results.map((r) => (
									<Command.Item
										key={r.orgId}
										value={`${r.orgId}-${r.matchType}`}
										onSelect={() => handleSelect(r.orgId)}
										className="relative flex cursor-pointer select-none items-start gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
										data-testid={`command-palette-row-${r.orgId}`}
										data-match-type={r.matchType}
									>
										<div className="flex flex-col flex-1 min-w-0">
											<span className="font-medium truncate">{r.orgName}</span>
											<span className="text-xs text-muted-foreground truncate">
												{r.slug}
												{r.matchType === "email" && r.matchedField
													? ` · ${r.matchedField}`
													: ""}
											</span>
										</div>
										<Badge
											variant="secondary"
											className="ml-2 text-[10px]"
											data-testid={`command-palette-badge-${r.orgId}`}
										>
											{MATCH_LABEL[r.matchType]}
										</Badge>
									</Command.Item>
								))}
							</Command.Group>
						)}
					</Command.List>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
