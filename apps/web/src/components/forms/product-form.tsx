/**
 * Canonical form shape (TanStack Form):
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import {
	ProductBasicSection,
	type ProductFormApi,
} from "./product-basic-section";
import { ProductCategoriesSection } from "./product-categories-section";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToRm, rmToCents } from "@/lib/money";

// conversionFactor is stored as a string on the backend; price is stored as integer cents.
const productFormSchema = z.object({
	name: z
		.string()
		.min(1, "Product name is required")
		.max(200, "Name must be 200 characters or fewer"),
	sku: z
		.string()
		.min(1, "SKU is required")
		.max(50, "SKU must be 50 characters or fewer"),
	barcode: z.string().optional(),
	type: z.enum(["product", "service_item"]).optional(),
	brandId: z.string().uuid().nullable().optional(),
	categoryId: z.string().uuid().nullable().optional(),
	supplierId: z.string().uuid().nullable().optional(),
	uomId: z.string().uuid("Unit of measure is required"),
	conversionFactor: z.string().optional(),
	price: z
		.number({ message: "Price is required" })
		.min(0, "Price must be 0 or greater")
		.transform((v) => rmToCents(v)),
	status: z.enum(["active", "inactive", "discontinued"]).optional(),
});

type ProductFormInput = z.input<typeof productFormSchema>;

interface Brand {
	id: string;
	name: string;
}
interface Category {
	id: string;
	name: string;
}
interface Supplier {
	id: string;
	name: string;
}
interface Uom {
	id: string;
	name: string;
	symbol?: string;
}

interface ProductFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: {
		id?: string;
		name?: string;
		sku?: string;
		barcode?: string | null;
		type?: string | null;
		brandId?: string | null;
		categoryId?: string | null;
		supplierId?: string | null;
		uomId?: string | null;
		conversionFactor?: string | null;
		price?: number;
		status?: string | null;
	};
	brands: Brand[];
	categories: Category[];
	suppliers: Supplier[];
	uoms: Uom[];
}

function buildDefaultValues(
	initialData?: ProductFormDialogProps["initialData"],
): ProductFormInput {
	return {
		name: initialData?.name ?? "",
		sku: initialData?.sku ?? "",
		barcode: initialData?.barcode ?? "",
		type:
			(initialData?.type as "product" | "service_item" | undefined) ??
			undefined,
		brandId: initialData?.brandId ?? null,
		categoryId: initialData?.categoryId ?? null,
		supplierId: initialData?.supplierId ?? null,
		uomId: initialData?.uomId ?? "",
		conversionFactor: initialData?.conversionFactor ?? "",
		price:
			initialData?.price != null
				? Number(centsToRm(initialData.price))
				: (0 as number),
		status:
			(initialData?.status as
				| "active"
				| "inactive"
				| "discontinued"
				| undefined) ?? "active",
	};
}

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-rose-600">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

export function ProductFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
	brands,
	categories,
	suppliers,
	uoms,
}: ProductFormDialogProps) {
	const mutation = useApiMutation({
		mutationFn: (values: z.output<typeof productFormSchema>) =>
			mode === "create"
				? client.products.create({
						organizationId,
						name: values.name,
						sku: values.sku,
						barcode: values.barcode || undefined,
						type: values.type,
						brandId: values.brandId ?? undefined,
						categoryId: values.categoryId ?? undefined,
						supplierId: values.supplierId ?? undefined,
						uomId: values.uomId,
						conversionFactor: values.conversionFactor || undefined,
						price: values.price,
						status: values.status,
					})
				: client.products.update({
						organizationId,
						id: initialData!.id!,
						name: values.name,
						sku: values.sku,
						barcode: values.barcode || undefined,
						type: values.type,
						brandId: values.brandId ?? undefined,
						categoryId: values.categoryId ?? undefined,
						supplierId: values.supplierId ?? undefined,
						uomId: values.uomId,
						conversionFactor: values.conversionFactor || undefined,
						price: values.price,
						status: values.status,
					}),
		successMessage: mode === "create" ? "Product created" : "Product updated",
		errorMessage: (err) => err.message || "Failed to save product",
		invalidate: [orpc.products.list.key()],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: buildDefaultValues(initialData),
		validators: { onSubmit: productFormSchema },
		onSubmit: async ({ value }) => {
			// The schema transforms price (RM → cents) at parse time.
			// onSubmit receives the input shape; we parse to get the transformed output.
			const transformed = productFormSchema.parse(value);
			await mutation.mutateAsync(transformed);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// Helper: generate a random SKU from current type value
	function generateSKU() {
		const typeValue = form.state.values.type;
		const prefix = typeValue ? typeValue.substring(0, 3).toUpperCase() : "PRD";
		const random = Math.random().toString(36).substring(2, 8).toUpperCase();
		form.setFieldValue("sku", `${prefix}-${random}`);
	}

	function generateBarcode() {
		const barcode = Math.random().toString().substring(2, 15);
		form.setFieldValue("barcode", barcode);
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				hideCloseButton
				className="sm:max-w-2xl p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PRODUCT CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{mode === "create" ? "Add New Product" : "Edit Product"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{mode === "create"
							? "Fill in the details to add a new product."
							: "Update the product details below."}
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="px-6 pt-4 pb-2 overflow-y-auto max-h-[65vh] space-y-4">
						<ProductBasicSection
							form={form as unknown as ProductFormApi}
							onGenerateSKU={generateSKU}
							onGenerateBarcode={generateBarcode}
						/>

						{/* Pricing */}
						<div className="bg-white border border-[#e5e5e5] rounded-md p-4">
							<h5 className="text-sm font-medium text-[#0a0a0a] mb-3">
								Pricing
							</h5>
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="price">
									{(field) => (
										<div className="flex flex-col gap-1.5">
											<Label htmlFor={field.name}>
												Price (RM) <span className="text-rose-600">*</span>
											</Label>
											<Input
												id={field.name}
												type="number"
												step="0.01"
												min="0"
												placeholder="0.00"
												value={field.state.value ?? ""}
												onBlur={field.handleBlur}
												onChange={(e) => {
													const parsed = parseFloat(e.target.value);
													field.handleChange(
														Number.isNaN(parsed) ? (0 as number) : parsed,
													);
												}}
											/>
											<FieldError errors={field.state.meta.errors} />
										</div>
									)}
								</form.Field>

								<form.Field name="conversionFactor">
									{(field) => (
										<div className="flex flex-col gap-1.5">
											<Label htmlFor={field.name}>Conversion Factor</Label>
											<Input
												id={field.name}
												type="number"
												step="0.01"
												min="0"
												placeholder="1.0"
												value={field.state.value ?? ""}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
											/>
											<p className="text-xs text-[#737373] mt-1">
												Factor for unit conversion
											</p>
											<FieldError errors={field.state.meta.errors} />
										</div>
									)}
								</form.Field>
							</div>
						</div>

						<ProductCategoriesSection
							form={form as unknown as ProductFormApi}
							mode={mode}
							brands={brands}
							categories={categories}
							suppliers={suppliers}
							uoms={uoms}
						/>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={mutation.isPending}
							className="border-[#e5e5e5] bg-white text-[#0a0a0a] hover:bg-[#f3f3f3]"
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={mutation.isPending}
							className="bg-[#0a0a0a] text-white hover:bg-[#262626] disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{mutation.isPending
								? mode === "create"
									? "Adding..."
									: "Saving..."
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
