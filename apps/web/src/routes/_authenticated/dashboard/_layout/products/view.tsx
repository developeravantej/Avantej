import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/products/view",
)({
	component: ProductsViewPage,
});

function ProductsViewPage() {
	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			<div className="mb-5">
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
					PRODUCT CATALOG
				</p>
				<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
					Products
				</h1>
			</div>

			<div className="rounded-2xl border border-[#e5e5e5] bg-white flex flex-col items-center justify-center py-24 gap-4">
				<div className="rounded-full bg-[#f3f3f3] p-4">
					<Package className="h-8 w-8 text-[#737373]" />
				</div>
				<div className="text-center">
					<p className="text-[15px] font-semibold text-[#0a0a0a]">Coming Soon</p>
					<p className="mt-1 text-sm text-[#737373]">
						The Products module is under development and will be available shortly.
					</p>
				</div>
			</div>
		</div>
	);
}
