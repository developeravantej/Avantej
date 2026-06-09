import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { centsToRm, rmToCents } from "@/lib/money";
import { client } from "@/utils/orpc";
import type { CartItem, LineItemType, SelectedCustomer } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
	return Math.random().toString(36).slice(2, 10);
}

function parsePriceCents(raw: string): number {
	const n = Number.parseFloat(raw);
	if (isNaN(n) || n < 0) return 0;
	return rmToCents(n);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOption {
	id: string;
	name: string;
	price: number | null; // cents — used only as a last-resort fallback
}

interface ItemsStepProps {
	organizationId: string;
	selectedCustomer?: SelectedCustomer | null;
	items: CartItem[];
	onAddItem: (item: CartItem) => void;
	onUpdateItem: (id: string, patch: Partial<CartItem>) => void;
	onRemoveItem: (id: string) => void;
	/** Walk-ins can't buy packages, and picking a service becomes a package — hide it. */
	isWalkIn?: boolean;
}

// ─── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
	item: CartItem;
	services: ServiceOption[];
	organizationId: string;
	selectedCustomer?: SelectedCustomer | null;
	onUpdate: (patch: Partial<CartItem>) => void;
	onRemove: () => void;
}

function ItemRow({
	item,
	services,
	organizationId,
	selectedCustomer,
	onUpdate,
	onRemove,
}: RowProps) {
	const priceRm = centsToRm(item.unitPriceCents);
	const isLookup = item.type === "service" || item.type === "package";

	const [isPriceLoading, setIsPriceLoading] = useState(false);
	const [noPriceWarning, setNoPriceWarning] = useState(false);
	const pendingServiceIdRef = useRef<string | null>(null);

	async function handleServiceSelect(serviceId: string) {
		const svc = services.find((s) => s.id === serviceId);
		if (!svc) return;

		pendingServiceIdRef.current = serviceId;
		setIsPriceLoading(true);
		setNoPriceWarning(false);

		onUpdate({
			type: "package",
			refId: svc.id,
			description: svc.name,
			unitPriceCents: 0,
		});

		try {
			const { priceCents } = await client.services.resolvePrice({
				organizationId,
				serviceId: svc.id,
				branchId: selectedCustomer?.branchId ?? null,
				customerType: selectedCustomer?.type ?? null,
			});

			if (pendingServiceIdRef.current !== serviceId) return;

			const resolved = priceCents ?? 0;
			onUpdate({ unitPriceCents: resolved });
			if (resolved === 0) setNoPriceWarning(true);
		} catch {
			if (pendingServiceIdRef.current !== serviceId) return;
			onUpdate({ unitPriceCents: svc.price ?? 0 });
		} finally {
			if (pendingServiceIdRef.current === serviceId) setIsPriceLoading(false);
		}
	}

	return (
		<div
			className="grid grid-cols-12 items-start gap-2 rounded-md border bg-muted/30 p-3"
			data-testid="pos-catalog-item"
		>
			{/* Type badge */}
			<div className="col-span-12 sm:col-span-2">
				<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
					{item.type === "package"
						? "Package"
						: item.type === "service"
							? "Service"
							: "Custom"}
				</span>
			</div>

			{/* Description / combobox */}
			<div className="col-span-12 sm:col-span-4">
				{isLookup ? (
					<Select
						value={item.refId ?? ""}
						onValueChange={(id) => {
							void handleServiceSelect(id);
						}}
					>
						<SelectTrigger className="w-full">
							<SelectValue placeholder="Select service..." />
						</SelectTrigger>
						<SelectContent>
							{services.length === 0 ? (
								<div className="px-2 py-3 text-center text-muted-foreground text-sm">
									No services available
								</div>
							) : (
								services.map((svc) => (
									<SelectItem key={svc.id} value={svc.id}>
										{svc.name}
									</SelectItem>
								))
							)}
						</SelectContent>
					</Select>
				) : (
					<Input
						placeholder="Description"
						value={item.description}
						onChange={(e) => onUpdate({ description: e.target.value })}
					/>
				)}
			</div>

			{/* Quantity stepper */}
			<div className="col-span-4 flex items-center gap-1 sm:col-span-2">
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					onClick={() => onUpdate({ quantity: Math.max(1, item.quantity - 1) })}
					disabled={item.quantity <= 1}
				>
					−
				</Button>
				<span className="w-6 text-center text-sm tabular-nums">
					{item.quantity}
				</span>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="size-8 shrink-0"
					onClick={() => onUpdate({ quantity: item.quantity + 1 })}
				>
					+
				</Button>
			</div>

			{/* Unit price */}
			<div className="col-span-5 sm:col-span-3">
				<div className="relative">
					<span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground text-sm">
						RM
					</span>
					{isPriceLoading ? (
						<div className="flex h-9 items-center pl-9">
							<Loader2 className="size-4 animate-spin text-muted-foreground" />
						</div>
					) : (
						<Input
							type="number"
							min="0"
							step="0.01"
							className="pl-9"
							value={priceRm}
							onChange={(e) =>
								onUpdate({ unitPriceCents: parsePriceCents(e.target.value) })
							}
							disabled={isLookup && !!item.refId && item.type !== "custom"}
						/>
					)}
				</div>
				{noPriceWarning && !isPriceLoading && (
					<p className="mt-1 text-amber-600 text-xs">
						No price configured for this service at this branch.
					</p>
				)}
			</div>

			{/* Remove */}
			<div className="col-span-3 flex justify-end sm:col-span-1">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-8 text-destructive hover:bg-destructive/10"
					onClick={onRemove}
					aria-label="Remove item"
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
		</div>
	);
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ItemsStep({
	organizationId,
	selectedCustomer,
	items,
	onAddItem,
	onUpdateItem,
	onRemoveItem,
	isWalkIn = false,
}: ItemsStepProps) {
	const addSelectId = useId();

	const { data: rawServices = [] } = useQuery({
		queryKey: ["services-list", organizationId],
		queryFn: async () => {
			return client.services.list({ organizationId, isActive: true });
		},
		enabled: !!organizationId,
	});

	const services: ServiceOption[] = rawServices.map((s) => ({
		id: s.id,
		name: s.name,
		price: typeof s.price === "number" ? s.price : null,
	}));

	function addItem(type: LineItemType) {
		const newItem: CartItem = {
			id: nanoid(),
			type,
			description: type === "custom" ? "" : "",
			quantity: 1,
			unitPriceCents: 0,
		};
		onAddItem(newItem);
	}

	return (
		<div className="space-y-4">
			{/* Existing rows */}
			{items.length > 0 && (
				<div className="space-y-2">
					{/* Column headers — sm and above */}
					<div className="hidden grid-cols-12 gap-2 px-3 font-medium text-muted-foreground text-xs uppercase tracking-wide sm:grid">
						<div className="col-span-2">Type</div>
						<div className="col-span-4">Description</div>
						<div className="col-span-2">Qty</div>
						<div className="col-span-3">Unit Price</div>
						<div className="col-span-1" />
					</div>

					{items.map((item) => (
						<ItemRow
							key={item.id}
							item={item}
							services={services}
							organizationId={organizationId}
							selectedCustomer={selectedCustomer}
							onUpdate={(patch) => onUpdateItem(item.id, patch)}
							onRemove={() => onRemoveItem(item.id)}
						/>
					))}
				</div>
			)}

			{/* Add item */}
			<div className="flex items-center gap-3 pt-1">
				<Label htmlFor={addSelectId} className="shrink-0 text-sm">
					Add item:
				</Label>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addItem("service")}
						data-testid="pos-add-service-button"
						disabled={isWalkIn}
						title={
							isWalkIn
								? "Walk-in customers can't purchase packages — use a Custom line or register the customer."
								: undefined
						}
					>
						<Plus className="mr-1 size-3.5" />
						Service
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addItem("custom")}
						data-testid="pos-add-product-button"
					>
						<Plus className="mr-1 size-3.5" />
						Custom
					</Button>
				</div>
			</div>

			{items.length === 0 && (
				<p className="py-4 text-center text-muted-foreground text-sm">
					No items added. Use the buttons above to add a service or custom line
					item.
				</p>
			)}
		</div>
	);
}
