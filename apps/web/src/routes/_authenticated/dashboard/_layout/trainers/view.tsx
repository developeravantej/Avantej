import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { TrainersListPage } from "@/components/pages/trainers/trainers-list-page";
import { TrainerTiersPage } from "@/components/pages/trainers/trainer-tiers-page";
import { TrainerAvailabilityTab } from "@/components/pages/trainers/trainer-availability-tab";

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
	{ id: "availability", label: "Availability" },
];

function TrainersTabPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();

	const stickyHeader = (
		<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
			<div className="flex items-center gap-3 text-sm">
				<span className="text-muted-foreground">Staff</span>
				<span className="text-[#a3a3a3]">/</span>
				<span className="font-semibold">Trainers</span>
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
	);

	if (tab === "tiers") {
		return (
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				{stickyHeader}
				<div className="px-6 py-6">
					<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
						<TrainerTiersPage />
					</div>
				</div>
			</div>
		);
	}

	if (tab === "availability") {
		return (
			<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
				{stickyHeader}
				<div className="px-6 py-6">
					<TrainerAvailabilityTab />
				</div>
			</div>
		);
	}

	return (
		<div className="-m-6 flex h-screen flex-col bg-[#f3f3f3]">
			{stickyHeader}
			<div className="mx-6 my-6 min-h-0 flex-1 overflow-hidden rounded-tl-2xl rounded-tr-2xl border border-[#e5e5e5] bg-white">
				<TrainersListPage />
			</div>
		</div>
	);
}
