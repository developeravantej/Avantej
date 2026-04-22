import { createFileRoute } from "@tanstack/react-router";
import { ServicesPage } from "@/components/pages/services/services-page";
import { ServiceCategoriesPage } from "@/components/pages/services/categories-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/service/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "services",
	}),
	component: ServicesTabPage,
});

const TABS = [
	{ id: "services", label: "Services" },
	{ id: "categories", label: "Categories" },
];

function ServicesTabPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div>
					<h1 className="text-xl font-semibold">Services</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Manage services and categories offered by your organization
					</p>
				</div>
			</div>

			{/* Underline tabs */}
			<div className="shrink-0 border-b border-border/40 px-6">
				<div className="flex h-10 items-end gap-0">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`px-4 pb-2 pt-0 text-sm font-medium border-b-2 transition-colors ${
								tab === t.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>

			{/* Tab content */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{tab === "services" ? <ServicesPage /> : <ServiceCategoriesPage />}
			</div>
		</div>
	);
}
