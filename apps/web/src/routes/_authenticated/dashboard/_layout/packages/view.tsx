import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { MembershipsPage } from "@/components/pages/packages/memberships-page";
import { PackageInstancesPage } from "@/components/pages/packages/instances-page";
import { PackageInstallmentsPage } from "@/components/pages/packages/installments-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/packages/view",
)({
	beforeLoad: async () => {
		await requirePermission("package_management:read");
	},
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
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Packages</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Overview</span>
				</div>
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{NAV_TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${activeTab === t.id ? "bg-[#0a0a0a] text-white" : "text-muted-foreground hover:text-foreground"}`}
						>
							{t.label}
						</button>
					))}
				</div>
			</header>

			{/* Tab content — wrapped in a white card */}
			<div className="px-6 py-6">
				<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
					{activeTab === "memberships" && <MembershipsPage />}
					{activeTab === "session-packs" && <PackageInstancesPage />}
					{activeTab === "installments" && <PackageInstallmentsPage />}
				</div>
			</div>
		</div>
	);
}
