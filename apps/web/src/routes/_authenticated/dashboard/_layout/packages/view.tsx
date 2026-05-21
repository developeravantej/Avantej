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
		<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
			{/* Page header */}
			<div className="mb-5 flex items-end justify-between">
				<div>
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PACKAGE CATALOG
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Packages
					</h1>
					<p className="mt-1 text-sm text-[#737373]">
						Manage memberships, session packs, and installment schedules
					</p>
				</div>
			</div>

			{/* Pill tabs */}
			<div className="mb-5 flex flex-wrap items-center gap-2">
				{NAV_TABS.map((t) => (
					<button
						key={t.id}
						type="button"
						onClick={() => navigate({ search: { tab: t.id } })}
						className={
							activeTab === t.id
								? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
								: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
						}
					>
						{t.label}
					</button>
				))}
			</div>

			{/* Tab content — wrapped in a white card */}
			<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
				{activeTab === "memberships" && <MembershipsPage />}
				{activeTab === "session-packs" && <PackageInstancesPage />}
				{activeTab === "installments" && <PackageInstallmentsPage />}
			</div>
		</div>
	);
}
