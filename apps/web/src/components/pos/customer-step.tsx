import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, User, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDebounce } from "@/hooks/useDebounce";
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

interface WalkInCreateForm {
	name: string;
	phone: string;
	email: string;
}

const EMPTY_WALK_IN: WalkInCreateForm = { name: "", phone: "", email: "" };

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
	const queryClient = useQueryClient();

	// Search state
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query, 300);
	const [showResults, setShowResults] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	// Walk-in create dialog
	const [dialogOpen, setDialogOpen] = useState(false);
	const [walkInForm, setWalkInForm] = useState<WalkInCreateForm>(EMPTY_WALK_IN);

	// ── Search query ──────────────────────────────────────────────────────────

	const { data: results = [], isFetching } = useQuery({
		queryKey: [
			"pos-search-customers",
			organizationId,
			debouncedQuery,
			branchId,
		],
		queryFn: async () => {
			if (!debouncedQuery || debouncedQuery.length < 2) return [];
			return client.pos.searchCustomers({
				organizationId,
				query: debouncedQuery,
				branchId: branchId ?? "",
			}) as Promise<SearchResult[]>;
		},
		enabled: debouncedQuery.length >= 2,
	});

	// Show results when we have them and query is not empty
	useEffect(() => {
		setShowResults(debouncedQuery.length >= 2);
	}, [debouncedQuery, results]);

	// Click outside handler to close dropdown
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setShowResults(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	// ── Walk-in create mutation ────────────────────────────────────────────────

	const createWalkInMutation = useMutation({
		mutationFn: async (form: WalkInCreateForm) => {
			return client.walkInCustomers.create({
				organizationId,
				name: form.name,
				phone: form.phone || undefined,
				email: form.email || undefined,
				branchId: branchId || undefined,
			});
		},
		onSuccess: (data, _form) => {
			queryClient.invalidateQueries({ queryKey: ["walkInCustomers"] });
			toast.success("Walk-in customer created.");
			// Select the newly created customer
			onSelect({
				type: "walk_in",
				id: data.id,
				name: data.name,
				phone: data.phone ?? null,
				email: data.email ?? null,
				branchId: data.branchId ?? branchId ?? "",
			});
			setDialogOpen(false);
			setWalkInForm(EMPTY_WALK_IN);
			setQuery("");
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to create customer.",
			);
		},
	});

	// ── Handlers ──────────────────────────────────────────────────────────────

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
		setShowResults(false);
	}

	function handleCreateWalkIn(e: React.FormEvent) {
		e.preventDefault();
		if (!walkInForm.name.trim()) {
			toast.error("Name is required.");
			return;
		}
		createWalkInMutation.mutate(walkInForm);
	}

	// ── Render: selected state ─────────────────────────────────────────────────

	if (selected) {
		return (
			<div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
				<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
					<User className="h-4 w-4 text-primary" />
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium">{selected.name}</p>
					<div className="flex items-center gap-2 text-muted-foreground text-sm">
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
					className="h-7 w-7 shrink-0"
					onClick={onClear}
					type="button"
					aria-label="Clear customer selection"
				>
					<X className="h-4 w-4" />
				</Button>
			</div>
		);
	}

	// ── Render: search state ───────────────────────────────────────────────────

	return (
		<div className="space-y-4">
			{/* Search box */}
			<div ref={containerRef} className="relative">
				<div className="relative">
					<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search by name, phone or email..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="pl-9"
						onFocus={() => debouncedQuery.length >= 2 && setShowResults(true)}
					/>
					{isFetching && (
						<div className="absolute top-1/2 right-3 -translate-y-1/2">
							<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
						</div>
					)}
				</div>

				{/* Results dropdown */}
				{showResults && (
					<div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
						{results.length === 0 && !isFetching ? (
							<p className="px-4 py-3 text-muted-foreground text-sm">
								No customers found for "{debouncedQuery}"
							</p>
						) : (
							<ul className="max-h-60 overflow-y-auto py-1">
								{results.map((r) => (
									<li key={`${r.type}-${r.id}`}>
										<button
											type="button"
											className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-accent"
											onClick={() => handleSelect(r)}
										>
											<User className="h-4 w-4 shrink-0 text-muted-foreground" />
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">{r.name}</p>
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
				)}
			</div>

			{/* Separator */}
			<div className="flex items-center gap-3">
				<Separator className="flex-1" />
				<span className="text-muted-foreground text-xs">or</span>
				<Separator className="flex-1" />
			</div>

			{/* Create new walk-in button */}
			<Button
				type="button"
				variant="outline"
				className="w-full"
				onClick={() => setDialogOpen(true)}
			>
				<UserPlus className="mr-2 h-4 w-4" />
				Create New Walk-in Customer
			</Button>

			{/* Create walk-in dialog */}
			<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>New Walk-in Customer</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleCreateWalkIn} className="space-y-4 py-2">
						<div className="space-y-1.5">
							<Label htmlFor="wic-new-name">
								Name <span className="text-destructive">*</span>
							</Label>
							<Input
								id="wic-new-name"
								placeholder="Full name"
								value={walkInForm.name}
								onChange={(e) =>
									setWalkInForm((f) => ({ ...f, name: e.target.value }))
								}
								required
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="wic-new-phone">Phone</Label>
							<Input
								id="wic-new-phone"
								type="tel"
								placeholder="+60 12-345 6789"
								value={walkInForm.phone}
								onChange={(e) =>
									setWalkInForm((f) => ({ ...f, phone: e.target.value }))
								}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="wic-new-email">Email</Label>
							<Input
								id="wic-new-email"
								type="email"
								placeholder="customer@example.com"
								value={walkInForm.email}
								onChange={(e) =>
									setWalkInForm((f) => ({ ...f, email: e.target.value }))
								}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setDialogOpen(false);
									setWalkInForm(EMPTY_WALK_IN);
								}}
								disabled={createWalkInMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createWalkInMutation.isPending}>
								{createWalkInMutation.isPending
									? "Creating..."
									: "Create & Select"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
