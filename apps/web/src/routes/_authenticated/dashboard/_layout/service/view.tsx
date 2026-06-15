import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ServicesPage } from "@/components/pages/services/services-page";
import { ServiceCategoriesPage } from "@/components/pages/services/categories-page";
import { RoomsPage } from "@/components/pages/services/rooms-page";
import { PromotionsPage } from "@/components/pages/services/promotions-page";
import { ServicePricingPage } from "@/components/pages/services/pricing-page";
import { InstallmentPlansTab } from "@/components/pages/services/installment-plans-tab";

import { z } from "zod";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service/view",
)({
	beforeLoad: async () => {
		await requirePermission("service_management:read");
	},
	validateSearch: z.object({ tab: z.string().catch("services") }),
	component: ServicesTabPage,
});

const TABS = [
	{ id: "services", label: "Services" },
	{ id: "categories", label: "Categories" },
	{ id: "rooms", label: "Rooms" },
	{ id: "promotions", label: "Promotions" },
	{ id: "pricing", label: "Pricing" },
	{ id: "installments", label: "Installment Plans" },
];

function ServicesTabPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	const content =
		tab === "installments" ? (
			<InstallmentPlansTab />
		) : tab === "pricing" ? (
			<ServicePricingPage />
		) : tab === "promotions" ? (
			<PromotionsPage />
		) : tab === "rooms" ? (
			<RoomsPage />
		) : tab === "categories" ? (
			<ServiceCategoriesPage />
		) : (
			<ServicesPage />
		);

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Services</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Catalog</span>
				</div>
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${tab === t.id ? "bg-[#0a0a0a] text-white" : "text-muted-foreground hover:text-foreground"}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</header>

			{/* ── Tab content ─────────────────────────────────────────────────── */}
			<div className="px-6 py-6">{content}</div>
		</div>
	);
}
