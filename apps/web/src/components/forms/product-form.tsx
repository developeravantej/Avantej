import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { CreateProductInput, UpdateProductInput } from "@/hooks/useProductForm";

type ProductStatus = "active" | "inactive" | "discontinued";
type ProductType = "product" | "service_item";

interface Brand { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; name: string }
interface Uom { id: string; name: string; symbol?: string }

interface ProductFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (data: CreateProductInput | ({ id: string } & UpdateProductInput)) => void;
	isLoading?: boolean;
	initialData?: {
		id: string;
		sku: string;
		name: string;
		barcode?: string | null;
		type?: string | null;
		brandId?: string | null;
		categoryId?: string | null;
		supplierId?: string | null;
		uomId?: string | null;
		conversionFactor?: string | null;
		price: number; // integer cents
		status?: string | null;
	};
	mode?: "create" | "edit";
	brands: Brand[];
	categories: Category[];
	suppliers: Supplier[];
	uoms: Uom[];
}

const EMPTY_FORM = {
	name: "",
	sku: "",
	type: "" as ProductType | "",
	barcode: "",
	conversionFactor: "",
	priceRm: "", // user-entered RM value (string for input)
	status: "active" as ProductStatus,
	brandId: "",
	categoryId: "",
	supplierId: "",
	uomId: "",
};

export function ProductFormDialog({
	isOpen,
	onClose,
	onSubmit,
	isLoading = false,
	initialData,
	mode = "create",
	brands,
	categories,
	suppliers,
	uoms,
}: ProductFormDialogProps) {
	const [form, setForm] = useState(EMPTY_FORM);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialData) {
			setForm({
				name: initialData.name ?? "",
				sku: initialData.sku ?? "",
				type: (initialData.type as ProductType | "") ?? "",
				barcode: initialData.barcode ?? "",
				conversionFactor: initialData.conversionFactor ?? "",
				// Convert cents back to RM for display
				priceRm: initialData.price != null ? (initialData.price / 100).toFixed(2) : "",
				status: (initialData.status as ProductStatus) ?? "active",
				brandId: initialData.brandId ?? "",
				categoryId: initialData.categoryId ?? "",
				supplierId: initialData.supplierId ?? "",
				uomId: initialData.uomId ?? "",
			});
		} else {
			setForm(EMPTY_FORM);
		}
	}, [initialData, isOpen]);

	function set(field: keyof typeof EMPTY_FORM, value: string) {
		setForm((prev) => ({ ...prev, [field]: value }));
	}

	function generateSKU() {
		const prefix = form.type ? form.type.substring(0, 3).toUpperCase() : "PRD";
		const random = Math.random().toString(36).substring(2, 8).toUpperCase();
		set("sku", `${prefix}-${random}`);
	}

	function generateBarcode() {
		const barcode = Math.random().toString().substring(2, 15);
		set("barcode", barcode);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (!form.name.trim()) {
			setError("Product name is required");
			return;
		}
		if (!form.sku.trim()) {
			setError("SKU is required");
			return;
		}
		if (!form.uomId && mode === "create") {
			setError("Unit of measure is required");
			return;
		}

		const rmValue = parseFloat(form.priceRm);
		if (Number.isNaN(rmValue) || rmValue < 0) {
			setError("Please enter a valid price (0 or greater)");
			return;
		}
		const priceInCents = Math.round(rmValue * 100);

		if (mode === "create") {
			const data: CreateProductInput = {
				name: form.name.trim(),
				sku: form.sku.trim(),
				uomId: form.uomId,
				price: priceInCents,
				barcode: form.barcode.trim() || undefined,
				type: (form.type as ProductType) || undefined,
				brandId: form.brandId || undefined,
				categoryId: form.categoryId || undefined,
				supplierId: form.supplierId || undefined,
				conversionFactor: form.conversionFactor.trim() || undefined,
				status: form.status,
			};
			onSubmit(data);
		} else if (initialData?.id) {
			const data: { id: string } & UpdateProductInput = {
				id: initialData.id,
				name: form.name.trim(),
				sku: form.sku.trim(),
				uomId: form.uomId || undefined,
				price: priceInCents,
				barcode: form.barcode.trim() || undefined,
				type: (form.type as ProductType) || undefined,
				brandId: form.brandId || undefined,
				categoryId: form.categoryId || undefined,
				supplierId: form.supplierId || undefined,
				conversionFactor: form.conversionFactor.trim() || undefined,
				status: form.status,
			};
			onSubmit(data);
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
			<DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{mode === "create" ? "Add New Product" : "Edit Product"}</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Fill in the details to add a new product."
							: "Update the product details below."}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-6">
					{error && (
						<div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
							{error}
						</div>
					)}

					{/* Basic Information */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Basic Information
						</h3>

						<div className="grid grid-cols-1 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">
									Product Name <span className="text-destructive">*</span>
								</label>
								<Input
									placeholder="Product name"
									value={form.name}
									onChange={(e) => set("name", e.target.value)}
									required
								/>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">
									SKU <span className="text-destructive">*</span>
								</label>
								<div className="flex gap-2">
									<Input
										placeholder="Product SKU"
										value={form.sku}
										onChange={(e) => set("sku", e.target.value)}
										required
										className="flex-1"
									/>
									<Button type="button" variant="outline" size="sm" onClick={generateSKU}>
										Generate
									</Button>
								</div>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Barcode</label>
								<div className="flex gap-2">
									<Input
										placeholder="Barcode"
										value={form.barcode}
										onChange={(e) => set("barcode", e.target.value)}
										className="flex-1"
									/>
									<Button type="button" variant="outline" size="sm" onClick={generateBarcode}>
										Generate
									</Button>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Type</label>
								<Select value={form.type} onValueChange={(v) => set("type", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select type" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="product">Product</SelectItem>
										<SelectItem value="service_item">Service Item</SelectItem>
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Status</label>
								<Select value={form.status} onValueChange={(v) => set("status", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="active">Active</SelectItem>
										<SelectItem value="inactive">Inactive</SelectItem>
										<SelectItem value="discontinued">Discontinued</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					{/* Pricing */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Pricing
						</h3>
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">
									Price (RM) <span className="text-destructive">*</span>
								</label>
								<Input
									type="number"
									step="0.01"
									min="0"
									placeholder="0.00"
									value={form.priceRm}
									onChange={(e) => set("priceRm", e.target.value)}
									required
								/>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Conversion Factor</label>
								<Input
									type="number"
									step="0.01"
									min="0"
									placeholder="1.0"
									value={form.conversionFactor}
									onChange={(e) => set("conversionFactor", e.target.value)}
								/>
								<p className="text-xs text-muted-foreground">Factor for unit conversion</p>
							</div>
						</div>
					</div>

					{/* Categories & Relationships */}
					<div className="space-y-4">
						<h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Categories & Relationships
						</h3>
						<div className="grid grid-cols-2 gap-4">
							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Brand</label>
								<Select value={form.brandId} onValueChange={(v) => set("brandId", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select brand" />
									</SelectTrigger>
									<SelectContent>
										{brands.map((b) => (
											<SelectItem key={b.id} value={b.id}>
												{b.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Category</label>
								<Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select category" />
									</SelectTrigger>
									<SelectContent>
										{categories.map((c) => (
											<SelectItem key={c.id} value={c.id}>
												{c.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">Supplier</label>
								<Select value={form.supplierId} onValueChange={(v) => set("supplierId", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select supplier" />
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

							<div className="flex flex-col gap-1.5">
								<label className="text-sm font-medium">
									Unit of Measure{mode === "create" ? " *" : ""}
								</label>
								<Select value={form.uomId} onValueChange={(v) => set("uomId", v)}>
									<SelectTrigger>
										<SelectValue placeholder="Select unit" />
									</SelectTrigger>
									<SelectContent>
										{uoms.map((u) => (
											<SelectItem key={u.id} value={u.id}>
												{u.name}{u.symbol ? ` (${u.symbol})` : ""}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading
								? mode === "create"
									? "Adding…"
									: "Saving…"
								: mode === "create"
									? "Add Product"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
