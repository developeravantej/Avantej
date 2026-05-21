"use client";

import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";
import { LiabilityTab } from "@/components/pages/commissions/liability-tab";
import { MyCommissionsPage } from "@/components/pages/commissions/mine-tab";
import { ReviewTab } from "@/components/pages/commissions/review-tab";
import { useUserContext } from "@/hooks/useUserContext";
import { client } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/view",
)({
	beforeLoad: async () => {
		await requirePermission("commission_management:read");
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "mine",
	}),
	component: CommissionsPage,
});

function CommissionsPage() {
	const { tab } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Always-mounted badge query for pending review count
	const { data: reviewMeta } = useQuery({
		queryKey: ["commissionSplits", "pendingReviewTotal"],
		queryFn: () =>
			client.commissionSplits.listPendingReview({
				organizationId: organizationId!,
				limit: 1,
			}),
		enabled: !!organizationId && hasPermission("commission_management:read"),
		staleTime: 30_000,
	});
	const pendingReviewTotal = reviewMeta?.total ?? 0;

	const PILLS = [
		{ id: "mine", label: "My Commissions", badge: null as number | null },
		...(!hasPermission("commission_management:read")
			? []
			: [
					{ id: "all", label: "All Commissions", badge: null as number | null },
					{
						id: "review",
						label: "Review",
						badge: pendingReviewTotal > 0 ? pendingReviewTotal : null,
					},
				]),
		...(!hasPermission("commission_payout:read")
			? []
			: [{ id: "liability", label: "Liability", badge: null as number | null }]),
	];

	const content =
		tab === "all" ? (
			<AllCommissionsPage />
		) : tab === "review" ? (
			<ReviewTab />
		) : tab === "liability" ? (
			<LiabilityTab />
		) : (
			<MyCommissionsPage />
		);

	return (
		<div className="-m-6 min-h-screen bg-[#f3f3f3]">
			{/* Page header */}
			<div className="px-6 pt-6 pb-5">
				<div className="mb-5 flex items-end justify-between">
					<div>
						<p className="mb-1 text-[10px] font-bold tracking-widest uppercase text-[#737373]">
							COMMISSIONS
						</p>
						<h1 className="text-[28px] font-extrabold tracking-tight leading-none text-[#0a0a0a]">
							Commissions
						</h1>
						<p className="mt-1 text-sm text-[#737373]">
							Commission ledger and payout tracking
						</p>
					</div>
				</div>

				{/* Tab pills */}
				<div className="flex flex-wrap items-center gap-2">
					{PILLS.map((pill) => (
						<button
							key={pill.id}
							type="button"
							onClick={() => navigate({ search: { tab: pill.id } })}
							className={
								tab === pill.id
									? "rounded-full bg-[#0a0a0a] text-white px-3.5 py-1.5 text-[13px] font-semibold inline-flex items-center gap-1.5"
									: "rounded-full border border-[#e5e5e5] bg-white text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3] px-3.5 py-1.5 text-[13px] font-medium inline-flex items-center gap-1.5"
							}
						>
							{pill.label}
							{pill.badge != null && (
								<span className="rounded-full bg-red-500 text-white text-[10px] px-1.5 py-0.5 font-bold leading-none">
									{pill.badge}
								</span>
							)}
						</button>
					))}
				</div>
			</div>

			{/* Content */}
			<div>
				{content}
			</div>
		</div>
	);
}
