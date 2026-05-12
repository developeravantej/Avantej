/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 * - Error display: inline <FormMessage> + toast on mutation error
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { ProductBasicSection } from "./product-basic-section";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { centsToRm, rmToCents } from "@/lib/money";

// 1. Schema — colocated, defines UI shape + validation. Server validates separately.
// conversionFactor is stored as a string on the backend; price is stored as integer cents.
const productFormSchema = z.object({
	name: z.string().min(1, "Product name is required").max(200, "Name must be 200 characters or fewer"),
	sku: z.string().min(1, "SKU is required").max(50, "SKU must be 50 characters or fewer"),
	barcode: z.string().optional(),
	type: z.enum(["product", "service_item"]).optional(),
	brandId: z.string().uuid().nullable().optional(),
	categoryId: z.string().uuid().nullable().optional(),
	supplierId: z.string().uuid().nullable().optional(),
	uomId: z.string().uuid("Unit of measure is required"),
	conversionFactor: z.string().optional(),
	// UI: user enters dollars; transform converts to integer cents for the API
	price: z
		.number({ message: "Price is required" })
		.min(0, "Price must be 0 or greater")
		.transform((v) => rmToCents(v)),
	status: z.enum(["active", "inactive", "discontinued"]).optional(),
});

// Input type (before transform) — used for defaultValues + form typings
type ProductFormInput = z.input<typeof productFormSchema>;
// Output type (after transform) — used for the mutation payload
type ProductFormOutput = z.output<typeof productFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
interface Brand { id: string; name: string }
interface Category { id: string; name: string }
interface Supplier { id: string; name: string }
interface Uom { id: string; name: string; symbol?: string }

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
		price?: number; // integer cents from server
		status?: string | null;
	};
	brands: Brand[];
	categories: Category[];
	suppliers: Supplier[];
	uoms: Uom[];
}

function buildDefaultValues(initialData?: ProductFormDialogProps["initialData"]): ProductFormInput {
	return {
		name: initialData?.name ?? "",
		sku: initialData?.sku ?? "",
		barcode: initialData?.barcode ?? "",
		type: (initialData?.type as "product" | "service_item" | undefined) ?? undefined,
		brandId: initialData?.brandId ?? null,
		categoryId: initialData?.categoryId ?? null,
		supplierId: initialData?.supplierId ?? null,
		uomId: initialData?.uomId ?? "",
		conversionFactor: initialData?.conversionFactor ?? "",
		// Convert cents → dollars for display; undefined if no price
		price: initialData?.price != null ? Number(centsToRm(initialData.price)) : (0 as number),
		status: (initialData?.status as "active" | "inactive" | "discontinued" | undefined) ?? "active",
	};
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
	// 3. Form instance — typed against input shape (pre-transform)
	const form = useForm<ProductFormInput>({
		resolver: zodResolver(productFormSchema),
		defaultValues: buildDefaultValues(initialData),
	});

	// 4. Reset on dialog re-open with fresh initialData
	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// Helper: generate a random SKU from current type value
	function generateSKU() {
		const typeValue = form.getValues("type");
		const prefix = typeValue ? typeValue.substring(0, 3).toUpperCase() : "PRD";
		const random = Math.random().toString(36).substring(2, 8).toUpperCase();
		form.setValue("sku", `${prefix}-${random}`);
	}

	// Helper: generate a random barcode
	function generateBarcode() {
		const barcode = Math.random().toString().substring(2, 15);
		form.setValue("barcode", barcode);
	}

	// 5. Mutation — isPending drives submit state; branches on mode
	const mutation = useApiMutation({
		mutationFn: (values: ProductFormOutput) =>
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

	// 6. Submit handler — Zod transform runs inside handleSubmit, output is ProductFormOutput
	const onSubmit = (values: ProductFormOutput) => mutation.mutate(values);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader className="mb-4">
					<DialogTitle className="text-lg font-medium leading-6 text-brand-primary-1">
						{mode === "create" ? "Add New Product" : "Edit Product"}
					</DialogTitle>
					<DialogDescription className="text-sm text-brand-secondary-1">
						{mode === "create"
							? "Fill in the details to add a new product."
							: "Update the product details below."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit as Parameters<typeof form.handleSubmit>[0])}
						className="space-y-4"
					>
						<ProductBasicSection form={form as any} onGenerateSKU={generateSKU} onGenerateBarcode={generateBarcode} />

						{/* Pricing */}
						<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
							<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Pricing</h5>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="price"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												Price (RM) <span className="text-destructive">*</span>
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													step="0.01"
													min="0"
													placeholder="0.00"
													value={field.value ?? ""}
													onChange={(e) => {
														const parsed = parseFloat(e.target.value);
														field.onChange(Number.isNaN(parsed) ? undefined : parsed);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="conversionFactor"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Conversion Factor</FormLabel>
											<FormControl>
												<Input
													type="number"
													step="0.01"
													min="0"
													placeholder="1.0"
													{...field}
												/>
											</FormControl>
											<p className="text-xs text-brand-secondary-1 mt-1">Factor for unit conversion</p>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>

						<ProductCategoriesSection form={form as any} mode={mode} brands={brands} categories={categories} suppliers={suppliers} uoms={uoms} />

						<DialogFooter className="mt-6">
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={mutation.isPending}
								className="border-brand-secondary-3 bg-white text-brand-primary-1 hover:bg-brand-secondary-3/50"
							>
								Cancel
							</Button>
							<Button
								type="submit"
								disabled={mutation.isPending}
								className="bg-zinc-950 text-white hover:bg-black/90 disabled:opacity-50 disabled:cursor-not-allowed"
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
				</Form>
			</DialogContent>
		</Dialog>
	);
}
