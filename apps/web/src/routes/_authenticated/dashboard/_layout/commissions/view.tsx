import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";
import { LiabilityTab } from "@/components/pages/commissions/liability-tab";
import { MyCommissionsPage } from "@/components/pages/commissions/mine-tab";
import { useUserContext } from "@/hooks/useUserContext";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/view",
)({
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "mine",
	}),
	component: CommissionsPage,
});

function CommissionsPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { hasPermission } = useUserContext();

	const TABS = [
		{ id: "mine", label: "My Commissions" },
		...(!hasPermission("commission_management:read")
			? []
			: [{ id: "all", label: "All Commissions" }]),
		...(!hasPermission("commission_payout:read")
			? []
			: [{ id: "liability", label: "Liability" }]),
	];

	const content =
		tab === "all" ? (
			<AllCommissionsPage />
		) : tab === "liability" ? (
			<LiabilityTab />
		) : (
			<MyCommissionsPage />
		);

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm">
			{/* Fixed header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4">
				<div className="flex items-center gap-3">
					<div className="p-2 rounded-lg bg-primary/10">
						<TrendingUp className="h-6 w-6 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">Commissions</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Track commission earnings and approvals
						</p>
					</div>
				</div>
			</div>

			{/* Tabs band */}
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

			{/* Scroll region */}
			<div className="min-h-0 flex-1 overflow-auto p-6 space-y-4">
				{content}
			</div>
		</div>
	);
}
