import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { formatPrice, rmToCents } from "@/lib/money";
import { BranchSelector } from "@/components/branch/branch-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { LineItem } from "../types";

function todayISO(): string {
	return new Date().toISOString().slice(0, 10);
}

export type CreatePOSheetProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	onCreated: () => void;
};

export function CreatePOSheet({ open, onOpenChange, organizationId, onCreated }: CreatePOSheetProps) {
	const [supplierId, setSupplierId] = useState("");
	const [branchId, setBranchId] = useState("");
	const [orderDate, setOrderDate] = useState(() => todayISO());
	const [expectedDelivery, setExpectedDelivery] = useState("");
	const [notes, setNotes] = useState("");
	const [lineItems, setLineItems] = useState<LineItem[]>([
		{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" },
	]);

	const { data: suppliers = [] } = useQuery({
		queryKey: ["suppliers", organizationId],
		queryFn: () => client.suppliers.list({ organizationId }),
		enabled: !!organizationId && open,
	});

	const { data: products = [] } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId }),
		enabled: !!organizationId && open,
	});

	const createMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.create>[0]) =>
			client.purchaseOrders.create(input),
		successMessage: "Purchase order created successfully.",
		errorMessage: (err) => `Failed to create purchase order: ${err.message}`,
		onSuccess: () => {
			onCreated();
			handleClose();
		},
	});

	function handleClose() {
		onOpenChange(false);
		setSupplierId("");
		setBranchId("");
		setOrderDate(todayISO());
		setExpectedDelivery("");
		setNotes("");
		setLineItems([{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" }]);
	}

	function addLine() {
		setLineItems((prev) => [
			...prev,
			{ key: crypto.randomUUID(), productId: "", orderedQty: "1", unitCostRM: "" },
		]);
	}

	function removeLine(key: string) {
		setLineItems((prev) => prev.filter((l) => l.key !== key));
	}

	function updateLine(key: string, field: keyof Omit<LineItem, "key">, value: string) {
		setLineItems((prev) =>
			prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
		);
	}

	const runningTotal = lineItems.reduce((sum, l) => {
		const qty = parseInt(l.orderedQty, 10) || 0;
		const cost = parseFloat(l.unitCostRM) || 0;
		return sum + qty * cost;
	}, 0);

	function handleSubmit() {
		if (!supplierId) { toast.error("Please select a supplier."); return; }
		if (!branchId.trim()) { toast.error("Please enter a branch ID."); return; }
		if (!orderDate) { toast.error("Please set an order date."); return; }

		const validItems = lineItems.filter(
			(l) => l.productId && parseInt(l.orderedQty, 10) > 0 && parseFloat(l.unitCostRM) > 0
		);
		if (validItems.length === 0) {
			toast.error("Add at least one valid line item.");
			return;
		}

		createMutation.mutate({
			organizationId,
			supplierId,
			branchId: branchId.trim(),
			// API expects z.string().datetime() — convert date-only string to ISO
			orderDate: new Date(orderDate).toISOString(),
			expectedDeliveryDate: expectedDelivery
				? new Date(expectedDelivery).toISOString()
				: undefined,
			notes: notes.trim() || undefined,
			items: validItems.map((l) => ({
				productId: l.productId,
				orderedQty: parseInt(l.orderedQty, 10),
				// API stores in cents; user enters in RM
				unitCost: rmToCents(parseFloat(l.unitCostRM)),
			})),
		});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle>New Purchase Order</DialogTitle>
					<DialogDescription>
						Create a draft purchase order to send to a supplier.
					</DialogDescription>
				</DialogHeader>

				<div className="mt-6 space-y-5">
					{/* Supplier */}
					<div className="space-y-1.5">
						<Label htmlFor="po-supplier">Supplier</Label>
						<Select value={supplierId} onValueChange={setSupplierId}>
							<SelectTrigger id="po-supplier">
								<SelectValue placeholder="Select supplier…" />
							</SelectTrigger>
							<SelectContent>
								{suppliers.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Branch */}
					<div className="space-y-1.5">
						<Label htmlFor="po-branch">Branch</Label>
						<BranchSelector
							value={branchId}
							onChange={setBranchId}
							organizationId={organizationId}
							placeholder="Select destination branch…"
						/>
					</div>

					{/* Dates */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1.5">
							<Label htmlFor="po-order-date">Order Date</Label>
							<Input
								id="po-order-date"
								type="date"
								value={orderDate}
								onChange={(e) => setOrderDate(e.target.value)}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="po-delivery-date">Expected Delivery</Label>
							<Input
								id="po-delivery-date"
								type="date"
								value={expectedDelivery}
								onChange={(e) => setExpectedDelivery(e.target.value)}
							/>
						</div>
					</div>

					{/* Notes */}
					<div className="space-y-1.5">
						<Label htmlFor="po-notes">Notes</Label>
						<Textarea
							id="po-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Optional notes for this order…"
							rows={2}
						/>
					</div>

					<Separator />

					{/* Line items */}
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Line Items</span>
							<Button type="button" size="sm" variant="outline" onClick={addLine}>
								<Plus className="size-3.5 mr-1" />
								Add Item
							</Button>
						</div>

						{lineItems.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-4">
								No items yet. Click "Add Item" to begin.
							</p>
						)}

						{lineItems.map((line, idx) => (
							<div key={line.key} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Product</Label>}
									<Select
										value={line.productId}
										onValueChange={(v) => updateLine(line.key, "productId", v)}
									>
										<SelectTrigger className="h-8 text-sm">
											<SelectValue placeholder="Select…" />
										</SelectTrigger>
										<SelectContent>
											{products.map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.name} ({p.sku})
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>

								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Qty</Label>}
									<Input
										className="h-8 text-sm"
										type="number"
										min="1"
										step="1"
										value={line.orderedQty}
										onChange={(e) => updateLine(line.key, "orderedQty", e.target.value)}
									/>
								</div>

								<div className="space-y-1">
									{idx === 0 && <Label className="text-xs text-muted-foreground">Unit Cost (RM)</Label>}
									<Input
										className="h-8 text-sm"
										type="number"
										min="0"
										step="0.01"
										value={line.unitCostRM}
										onChange={(e) => updateLine(line.key, "unitCostRM", e.target.value)}
										placeholder="0.00"
									/>
								</div>

								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-destructive"
									onClick={() => removeLine(line.key)}
									disabled={lineItems.length === 1}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						))}

						{lineItems.length > 0 && (
							<div className="flex justify-end pt-1">
								<span className="text-sm font-medium text-muted-foreground">
									Running total:{" "}
									<span className="text-foreground font-semibold">
										{formatPrice(rmToCents(runningTotal), "MYR")}
									</span>
								</span>
							</div>
						)}
					</div>

					<Separator />

					<div className="flex gap-2 justify-end pt-1">
						<Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating…" : "Create Draft PO"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
