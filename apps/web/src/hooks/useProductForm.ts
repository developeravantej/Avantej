import { useQueryClient } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";
import { useApiMutation } from "@/hooks/useApiMutation";

type ProductStatus = "active" | "inactive" | "discontinued";
type ProductType = "product" | "service_item";

export interface CreateProductInput {
	sku: string;
	name: string;
	barcode?: string;
	type?: ProductType;
	brandId?: string;
	categoryId?: string;
	supplierId?: string;
	uomId: string;
	conversionFactor?: string;
	price: number; // integer cents
	status?: ProductStatus;
}

export interface UpdateProductInput {
	sku?: string;
	name?: string;
	barcode?: string;
	type?: ProductType;
	brandId?: string;
	categoryId?: string;
	supplierId?: string;
	uomId?: string;
	conversionFactor?: string;
	price?: number; // integer cents
	status?: ProductStatus;
}

export function useProductForm(organizationId: string | null) {
	const queryClient = useQueryClient();

	// Use .key() for partial-match invalidation (invalidates all products queries)
	function invalidateProducts() {
		queryClient.invalidateQueries({
			queryKey: orpc.products.list.key(),
		});
	}

	const createMutation = useApiMutation({
		mutationFn: (data: CreateProductInput) =>
			client.products.create({ organizationId: organizationId!, ...data }),
		successMessage: "Product created successfully",
		errorMessage: (err) => err.message || "Failed to create product",
		onSuccess: () => {
			invalidateProducts();
		},
	});

	const updateMutation = useApiMutation({
		mutationFn: ({ id, ...data }: { id: string } & UpdateProductInput) =>
			client.products.update({ organizationId: organizationId!, id, ...data }),
		successMessage: "Product updated successfully",
		errorMessage: (err) => err.message || "Failed to update product",
		onSuccess: () => {
			invalidateProducts();
		},
	});

	return { createMutation, updateMutation };
}
