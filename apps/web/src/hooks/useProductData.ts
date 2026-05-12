import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

export function useProductData(organizationId: string | null) {
	const { data: brands = [] } = useQuery({
		...orpc.brands.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});

	const { data: categories = [] } = useQuery({
		...orpc.productCategories.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});

	const { data: suppliers = [] } = useQuery({
		...orpc.suppliers.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});

	const { data: uoms = [] } = useQuery({
		...orpc.unitsOfMeasure.list.queryOptions({ input: { organizationId: organizationId! } }),
		enabled: !!organizationId,
	});

	return { brands, categories, suppliers, uoms };
}
