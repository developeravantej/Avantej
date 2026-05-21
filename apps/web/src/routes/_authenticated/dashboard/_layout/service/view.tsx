import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ServicesPage } from "@/components/pages/services/services-page";
import { ServiceCategoriesPage } from "@/components/pages/services/categories-page";
import { RoomsPage } from "@/components/pages/services/rooms-page";
import { PromotionsPage } from "@/components/pages/services/promotions-page";
import { ServicePricingPage } from "@/components/pages/services/pricing-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service/view",
)({
	beforeLoad: async () => {
		await requirePermission("service_management:read");
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "services",
	}),
	component: ServicesTabPage,
});

const TABS = [
	{ id: "services", label: "Services" },
	{ id: "categories", label: "Categories" },
	{ id: "rooms", label: "Rooms" },
	{ id: "promotions", label: "Promotions" },
	{ id: "pricing", label: "Pricing" },
];

function ServicesTabPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	const content =
		tab === "pricing" ? (
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
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* ── Page header ─────────────────────────────────────────────────── */}
			<div className="mb-5">
				<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
					Service Catalog
				</p>
				<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
					Services
				</h1>
				<p className="mt-1 text-sm text-[#737373]">
					Manage services, categories, rooms, and promotions for your organization
				</p>
			</div>

			{/* ── Tab pills ───────────────────────────────────────────────────── */}
			<div className="mb-5 flex flex-wrap items-center gap-2">
				{TABS.map((t) => {
					const isActive = tab === t.id;
					return (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={
								isActive
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold transition"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium transition"
							}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			{/* ── Tab content ─────────────────────────────────────────────────── */}
			<div>{content}</div>
		</div>
	);
}
