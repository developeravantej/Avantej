import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { TrainersListPage } from "@/components/pages/trainers/trainers-list-page";
import { TrainerTiersPage } from "@/components/pages/trainers/trainer-tiers-page";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/trainers/view",
)({
	beforeLoad: async () => {
		await requirePermission("user_management:read");
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "trainers",
	}),
	component: TrainersTabPage,
});

const TABS = [
	{ id: "trainers", label: "Trainers" },
	{ id: "tiers", label: "Tiers" },
];

function TrainersTabPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	if (tab === "tiers") {
		return (
			<div className="-m-6 min-h-screen bg-[#f3f3f3] p-6">
				{/* Page header */}
				<div className="mb-5">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						STAFF DIRECTORY
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Trainers
					</h1>
					<p className="mt-1 text-sm text-[#737373]">Manage trainers and their seniority tiers</p>
				</div>

				{/* Pill tabs */}
				<div className="mb-5 flex flex-wrap items-center gap-2">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={
								tab === t.id
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
							}
						>
							{t.label}
						</button>
					))}
				</div>

				<div className="rounded-2xl border border-[#e5e5e5] bg-white overflow-hidden">
					<TrainerTiersPage />
				</div>
			</div>
		);
	}

	// Trainers tab — master-detail layout with paper bg
	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			{/* Header + pill tabs */}
			<div className="shrink-0 px-6 pt-6 pb-4 bg-[#f3f3f3]">
				<div className="mb-4">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						STAFF DIRECTORY
					</p>
					<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
						Trainers
					</h1>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{TABS.map((t) => (
						<button
							key={t.id}
							type="button"
							onClick={() => navigate({ search: { tab: t.id } })}
							className={
								tab === t.id
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium"
							}
						>
							{t.label}
						</button>
					))}
				</div>
			</div>
			<div className="min-h-0 flex-1 rounded-tl-2xl rounded-tr-2xl overflow-hidden border border-[#e5e5e5] bg-white mx-6">
				<TrainersListPage />
			</div>
		</div>
	);
}
