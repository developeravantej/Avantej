import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ProductPriceOverrideDialog } from "./product-price-override-dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

function formatDateOrOpen(date: Date | null | undefined): string {
	if (!date) return "Open-ended";
	return new Date(date).toLocaleDateString("en-MY", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function ProductPricingPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const queryClient = useQueryClient();

	const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
	const [addDialogOpen, setAddDialogOpen] = useState(false);
	const [expireConfirmId, setExpireConfirmId] = useState<string | null>(null);
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
	const [isExpiring, setIsExpiring] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const { data: products = [] } = useQuery({
		...orpc.products.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const { data: hierarchyData } = useQuery({
		queryKey: ["hierarchy-nodes", organizationId],
		queryFn: () => client.hierarchy.listNodes({ organizationId: organizationId! }),
		enabled: !!organizationId,
	});

	const branchMap = new Map(
		(hierarchyData?.nodes ?? []).map((n: { id: string; name: string }) => [n.id, n.name]),
	);

	const { data: overrides = [], isLoading: overridesLoading } = useQuery({
		queryKey: ["product-price-overrides", organizationId, selectedProductId],
		queryFn: () =>
			client.products.listPriceOverrides({
				organizationId: organizationId!,
				productId: selectedProductId!,
			}),
		enabled: !!organizationId && !!selectedProductId,
	});

	function invalidateOverrides() {
		void queryClient.invalidateQueries({
			queryKey: ["product-price-overrides", organizationId, selectedProductId],
		});
	}

	async function handleExpire() {
		if (!expireConfirmId || !organizationId) return;
		setIsExpiring(true);
		try {
			await client.products.expireBranchPrice({
				organizationId,
				priceId: expireConfirmId,
			});
			toast.success("Price override expired.");
			invalidateOverrides();
			setExpireConfirmId(null);
		} catch {
			toast.error("Failed to expire price override.");
		} finally {
			setIsExpiring(false);
		}
	}

	async function handleDelete() {
		if (!deleteConfirmId || !organizationId) return;
		setIsDeleting(true);
		try {
			await client.products.deleteBranchPrice({
				organizationId,
				priceId: deleteConfirmId,
			});
			toast.success("Price override deleted.");
			invalidateOverrides();
			setDeleteConfirmId(null);
		} catch {
			toast.error("Failed to delete price override.");
		} finally {
			setIsDeleting(false);
		}
	}

	if (!organizationId) {
		return (
			<div className="flex min-h-96 items-center justify-center text-muted-foreground">
				Select an organization to manage pricing.
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-auto p-6">
			{/* Filter bar */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="w-72">
					<Select
						value={selectedProductId ?? ""}
						onValueChange={(v) => setSelectedProductId(v || null)}
					>
						<SelectTrigger>
							<SelectValue placeholder="Select a product to view overrides..." />
						</SelectTrigger>
						<SelectContent>
							{products.map((p) => (
								<SelectItem key={p.id} value={p.id}>
									{p.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button
					size="sm"
					onClick={() => setAddDialogOpen(true)}
					disabled={!selectedProductId}
				>
					<Plus className="mr-1 size-4" />
					Add Override
				</Button>
			</div>

			{/* Table */}
			{!selectedProductId ? (
				<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
					Select a product above to view its price overrides.
				</div>
			) : overridesLoading ? (
				<div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
					Loading…
				</div>
			) : overrides.length === 0 ? (
				<div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
					No price overrides configured for this product.
				</div>
			) : (
				<div className="rounded-lg border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Branch</TableHead>
								<TableHead>Customer Type</TableHead>
								<TableHead>Price</TableHead>
								<TableHead>Effective From</TableHead>
								<TableHead>Effective Until</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{overrides.map((row) => (
								<TableRow key={row.id}>
									<TableCell>
										{row.branchId
											? String(branchMap.get(row.branchId) ?? row.branchId)
											: "Org-wide / All branches"}
									</TableCell>
									<TableCell>
										{row.customerType === "member"
											? "Member"
											: row.customerType === "walk_in"
												? "Walk-in"
												: "All"}
									</TableCell>
									<TableCell>{formatPrice(row.priceCents)}</TableCell>
									<TableCell>{formatDateOrOpen(row.effectiveFrom)}</TableCell>
									<TableCell>{formatDateOrOpen(row.effectiveUntil)}</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											<Button
												size="sm"
												variant="outline"
												onClick={() => setExpireConfirmId(row.id)}
											>
												Expire
											</Button>
											<Button
												size="sm"
												variant="destructive"
												onClick={() => setDeleteConfirmId(row.id)}
											>
												Delete
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}

			{/* Add override dialog */}
			{selectedProductId && (
				<ProductPriceOverrideDialog
					open={addDialogOpen}
					onOpenChange={setAddDialogOpen}
					organizationId={organizationId}
					defaultProductId={selectedProductId}
					onSuccess={() => {
						invalidateOverrides();
						setAddDialogOpen(false);
					}}
				/>
			)}

			{/* Expire confirmation */}
			<Dialog open={!!expireConfirmId} onOpenChange={() => setExpireConfirmId(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Expire price override?</DialogTitle>
						<DialogDescription>
							This will set the effective-until date to now, ending the override immediately.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setExpireConfirmId(null)}>
							Cancel
						</Button>
						<Button onClick={handleExpire} disabled={isExpiring}>
							{isExpiring ? "Expiring..." : "Expire Override"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Delete confirmation */}
			<Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete price override?</DialogTitle>
						<DialogDescription>
							This will permanently remove the override. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
							{isDeleting ? "Deleting..." : "Delete Override"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
