import { createFileRoute } from "@tanstack/react-router";
import { MembershipsPage } from "@/components/pages/packages/memberships-page";
import { PackageInstancesPage } from "@/components/pages/packages/instances-page";
import { PackageInstallmentsPage } from "@/components/pages/packages/installments-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "memberships",
	}),
	component: PackagesPage,
});

const NAV_TABS = [
	{ id: "memberships", label: "Memberships" },
	{ id: "session-packs", label: "Session Packs" },
	{ id: "installments", label: "Installments" },
] as const;

function PackagesPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	const activeTab = NAV_TABS.some((t) => t.id === tab) ? tab : "memberships";

	return (
		<div className="p-6">
			<div className="overflow-hidden rounded-xl border bg-card shadow-sm">
				{/* Navigation tabs — inside the card */}
				<div className="flex border-b">
					{NAV_TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`-mb-px border-b-2 px-5 py-3.5 text-sm font-medium transition-colors ${
								activeTab === t.id
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{t.label}
						</button>
					))}
				</div>

				{/* Page content */}
				{activeTab === "memberships" && <MembershipsPage />}
				{activeTab === "session-packs" && <PackageInstancesPage />}
				{activeTab === "installments" && <PackageInstallmentsPage />}
			</div>
		</div>
	);
}
