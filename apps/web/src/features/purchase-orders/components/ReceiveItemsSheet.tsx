import { useQuery } from "@tanstack/react-query";
import { useApiMutation } from "@/hooks/useApiMutation";
import { client } from "@/utils/orpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useState, useMemo } from "react";

export type ReceiveItemsSheetProps = {
	poId: string | null;
	organizationId: string;
	onClose: () => void;
	onDone: () => void;
};

export function ReceiveItemsSheet({ poId, organizationId, onClose, onDone }: ReceiveItemsSheetProps) {
	const [quantities, setQuantities] = useState<Record<string, string>>({});

	const { data: detail, isLoading } = useQuery({
		queryKey: ["purchaseOrders", organizationId, poId],
		queryFn: async () => {
			if (!poId || !organizationId) return null;
			return client.purchaseOrders.getById({ organizationId, id: poId });
		},
		enabled: !!poId && !!organizationId,
	});

	const { data: products = [] } = useQuery({
		queryKey: ["products", organizationId],
		queryFn: () => client.products.list({ organizationId }),
		enabled: !!poId && !!organizationId,
	});

	const productNameMap = useMemo(
		() => new Map(products.map((p) => [p.id, p.name])),
		[products],
	);

	const receiveMutation = useApiMutation({
		mutationFn: (input: Parameters<typeof client.purchaseOrders.receiveItems>[0]) =>
			client.purchaseOrders.receiveItems(input),
		successMessage: "Items received successfully.",
		errorMessage: (err) => `Failed to receive items: ${err.message}`,
		onSuccess: () => {
			onDone();
			onClose();
		},
	});

	function handleSubmit() {
		if (!poId || !detail) return;

		const itemsToSubmit = (detail.items ?? []).flatMap((item) => {
			const receivedQty = parseInt(quantities[item.id] ?? "0", 10) || 0;
			return receivedQty > 0 ? [{ itemId: item.id, receivedQty }] : [];
		});

		if (itemsToSubmit.length === 0) {
			toast.error("Enter a received quantity for at least one item.");
			return;
		}

		receiveMutation.mutate({
			organizationId,
			purchaseOrderId: poId,
			items: itemsToSubmit,
		});
	}

	const order = detail?.order;
	const items = detail?.items ?? [];

	return (
		<Dialog open={!!poId} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="sm:max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Receive Items</DialogTitle>
					<DialogDescription>
						{order
							? `Record received quantities for PO ${order.purchaseOrderNumber}.`
							: "Loading purchase order…"}
					</DialogDescription>
				</DialogHeader>

				<div className="mt-6 space-y-4">
					{isLoading && (
						<div className="flex items-center justify-center py-8">
							<LoadingSpinner size="md" />
						</div>
					)}

					{!isLoading && items.length === 0 && (
						<p className="text-sm text-muted-foreground text-center py-4">
							No line items found for this purchase order.
						</p>
					)}

					{!isLoading && items.map((item) => {
						const remaining = item.orderedQty - (item.receivedQty ?? 0);
						return (
							<div key={item.id} className="space-y-1.5">
								<div className="flex items-center justify-between">
									<Label className="text-sm font-medium truncate max-w-[60%]">
										{productNameMap.get(item.productId) ?? item.productId}
									</Label>
									<span className="text-xs text-muted-foreground">
										Ordered: {item.orderedQty} | Received: {item.receivedQty ?? 0} | Remaining: {remaining}
									</span>
								</div>
								<Input
									type="number"
									min="0"
									max={remaining}
									step="1"
									placeholder={`Max ${remaining}`}
									value={quantities[item.id] ?? ""}
									onChange={(e) =>
										setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))
									}
								/>
							</div>
						);
					})}

					{!isLoading && items.length > 0 && (
						<>
							<Separator />
							<div className="flex gap-2 justify-end">
								<Button variant="outline" onClick={onClose} disabled={receiveMutation.isPending}>
									Cancel
								</Button>
								<Button onClick={handleSubmit} disabled={receiveMutation.isPending}>
									{receiveMutation.isPending ? "Saving…" : "Confirm Receipt"}
								</Button>
							</div>
						</>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
