import { useQuery } from "@tanstack/react-query";
import { useUserContext } from "@/hooks/useUserContext";
import { useProductData } from "@/hooks/useProductData";
import { orpc } from "@/utils/orpc";
import DataTable from "@/components/tables/products/view/data-table";
import {
	columns,
	type ProductRow,
} from "@/components/tables/products/view/columns";
import { ProductPricingPage } from "@/components/pages/products/pricing-page";

const TABS = [
	{ id: "catalog", label: "Catalog" },
	{ id: "pricing", label: "Pricing" },
] as const;

type ProductsTab = (typeof TABS)[number]["id"];

export function ProductsViewPage({
	tab,
	onTabChange,
}: {
	tab: ProductsTab;
	onTabChange: (tab: ProductsTab) => void;
}) {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	const { brands, categories, suppliers, uoms } =
		useProductData(organizationId);

	const {
		data: products = [],
		error,
		refetch,
	} = useQuery({
		...orpc.products.list.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Inventory</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Products</span>
				</div>
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => onTabChange(t.id)}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${tab === t.id ? "bg-[#0a0a0a] text-white" : "text-muted-foreground hover:text-foreground"}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</header>

			<div className="flex-1 px-6 py-6">
				{tab === "pricing" ? (
					<ProductPricingPage />
				) : (
					<div className="flex h-[calc(100vh-8rem)] flex-col rounded-2xl border border-[#e5e5e5] bg-white">
						<DataTable<ProductRow, unknown>
							columns={columns}
							data={products as ProductRow[]}
							organizationId={organizationId ?? ""}
							brands={brands}
							categories={categories}
							suppliers={suppliers}
							uoms={uoms}
							error={error ?? undefined}
							onRetry={() => refetch()}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
