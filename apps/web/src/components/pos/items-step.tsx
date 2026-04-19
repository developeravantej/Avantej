import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useId } from "react";

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
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { client } from "@/utils/orpc";
import type { CartItem, LineItemType } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
	return Math.random().toString(36).slice(2, 10);
}

function parsePriceCents(raw: string): number {
	const n = Number.parseFloat(raw);
	if (isNaN(n) || n < 0) return 0;
	return Math.round(n * 100);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ServiceOption {
	id: string;
	name: string;
	price: number | null; // cents
	sessionCount: number | null;
	expirable: boolean;
	expiryDays: number | null;
}

interface ItemsStepProps {
	organizationId: string;
	isWalkIn: boolean;
	items: CartItem[];
	onAddItem: (item: CartItem) => void;
	onUpdateItem: (id: string, patch: Partial<CartItem>) => void;
	onRemoveItem: (id: string) => void;
}

// ─── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
	item: CartItem;
	services: ServiceOption[];
	isWalkIn: boolean;
	onUpdate: (patch: Partial<CartItem>) => void;
	onRemove: () => void;
}

function ItemRow({ item, services, isWalkIn, onUpdate, onRemove }: RowProps) {
	const priceRm = (item.unitPriceCents / 100).toFixed(2);

	// For service/package items, the user picks from the combobox
	const isLookup = item.type === "service" || item.type === "package";

	// Filter available services for package type — must have sessionCount + expirable
	const availableServices =
		item.type === "package"
			? services.filter(
					(s) => s.sessionCount != null && s.expirable && s.expiryDays != null,
				)
			: services;

	function handleServiceSelect(serviceId: string) {
		const svc = services.find((s) => s.id === serviceId);
		if (!svc) return;
		onUpdate({
			refId: svc.id,
			description: svc.name,
			unitPriceCents: svc.price ?? 0,
		});
	}

	const packageBlocked = item.type === "package" && isWalkIn;

	return (
		<div className="grid grid-cols-12 items-start gap-2 rounded-md border bg-muted/30 p-3">
			{/* Type badge */}
			<div className="col-span-12 sm:col-span-2">
				<span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
					{item.type === "service"
						? "Service"
						: item.type === "package"
							? "Package"
							: "Custom"}
				</span>
			</div>

			{/* Description / combobox */}
			<div className="col-span-12 sm:col-span-4">
				{isLookup ? (
					<TooltipProvider>
						<Tooltip open={packageBlocked || undefined}>
							<TooltipTrigger asChild>
								<div
									className={
										packageBlocked ? "cursor-not-allowed opacity-50" : ""
									}
								>
									<Select
										value={item.refId ?? ""}
										onValueChange={handleServiceSelect}
										disabled={packageBlocked}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select service..." />
										</SelectTrigger>
										<SelectContent>
											{availableServices.length === 0 ? (
												<div className="px-2 py-3 text-center text-muted-foreground text-sm">
													No sellable packages available
												</div>
											) : (
												availableServices.map((svc) => (
													<SelectItem key={svc.id} value={svc.id}>
														{svc.name}
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</div>
							</TooltipTrigger>
							{packageBlocked && (
								<TooltipContent>
									<p>Register customer as a member first to sell packages</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
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
					className="h-8 w-8 shrink-0"
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
					className="h-8 w-8 shrink-0"
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
				</div>
			</div>

			{/* Remove */}
			<div className="col-span-3 flex justify-end sm:col-span-1">
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8 text-destructive hover:bg-destructive/10"
					onClick={onRemove}
					aria-label="Remove item"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ItemsStep({
	organizationId,
	isWalkIn,
	items,
	onAddItem,
	onUpdateItem,
	onRemoveItem,
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
		sessionCount:
			"sessionCount" in s && typeof s.sessionCount === "number"
				? s.sessionCount
				: null,
		expirable: "expirable" in s ? Boolean(s.expirable) : false,
		expiryDays:
			"expiryDays" in s && typeof s.expiryDays === "number"
				? s.expiryDays
				: null,
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
							isWalkIn={isWalkIn}
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
					>
						<Plus className="mr-1 h-3.5 w-3.5" />
						Service
					</Button>
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => addItem("package")}
										disabled={isWalkIn}
									>
										<Plus className="mr-1 h-3.5 w-3.5" />
										Package
									</Button>
								</span>
							</TooltipTrigger>
							{isWalkIn && (
								<TooltipContent>
									<p>Register customer as a member first to sell packages</p>
								</TooltipContent>
							)}
						</Tooltip>
					</TooltipProvider>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => addItem("custom")}
					>
						<Plus className="mr-1 h-3.5 w-3.5" />
						Custom
					</Button>
				</div>
			</div>

			{items.length === 0 && (
				<p className="py-4 text-center text-muted-foreground text-sm">
					No items added. Use the buttons above to add a service, package, or
					custom line item.
				</p>
			)}
		</div>
	);
}
