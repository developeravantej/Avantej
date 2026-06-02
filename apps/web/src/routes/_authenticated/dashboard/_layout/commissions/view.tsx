"use client";

import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AllCommissionsPage } from "@/components/pages/commissions/all-tab";
import { LiabilityTab } from "@/components/pages/commissions/liability-tab";
import { ManualAdjustmentDialog } from "@/components/pages/commissions/manual-adjustment-dialog";
import { MyCommissionsPage } from "@/components/pages/commissions/mine-tab";
import { ReviewTab } from "@/components/pages/commissions/review-tab";
import { PayoutsTab } from "@/components/pages/commissions/payouts-tab";
import { Button } from "@/components/ui/button";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/commissions/view",
)({
	beforeLoad: async () => {
		await requirePermission("commission_management:read");
	},
	validateSearch: (search: Record<string, unknown>) => ({
		tab: (search.tab as string | undefined) ?? "mine",
		recipientId: search.recipientId as string | undefined,
	}),
	component: CommissionsPage,
});

function CommissionsPage() {
	const { tab, recipientId } = Route.useSearch();
	const navigate = Route.useNavigate();
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Always-mounted badge query for pending review count
	const { data: reviewMeta } = useQuery({
		...orpc.commissionSplits.listPendingReview.queryOptions({
			input: { organizationId: organizationId!, limit: 1 },
		}),
		enabled: !!organizationId && hasPermission("commission_management:read"),
		staleTime: 30_000,
	});
	const pendingReviewTotal = reviewMeta?.total ?? 0;

	// F-COM-01: gate the "New Adjustment" trigger on the same permission the
	// manualAdjustment procedure requires (commission_payout:create).
	const canCreateAdjustment = hasPermission("commission_payout:create");
	const [adjustmentOpen, setAdjustmentOpen] = useState(false);

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
			: [
					{ id: "liability", label: "Liability", badge: null as number | null },
					{ id: "payouts", label: "Payouts", badge: null as number | null },
				]),
	];

	const content =
		tab === "all" ? (
			<AllCommissionsPage />
		) : tab === "review" ? (
			<ReviewTab />
		) : tab === "liability" ? (
			<LiabilityTab />
		) : tab === "payouts" && organizationId ? (
			<PayoutsTab
				organizationId={organizationId}
				recipientId={recipientId}
				onSelectRecipient={(id) =>
					navigate({ search: (prev) => ({ ...prev, recipientId: id }) })
				}
			/>
		) : (
			<MyCommissionsPage />
		);

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Finance</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Commissions</span>
				</div>
				<div className="ml-8 flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-1">
					{PILLS.map((pill) => (
						<button
							key={pill.id}
							type="button"
							onClick={() =>
								navigate({
									search: (prev) => ({
										...prev,
										tab: pill.id,
										recipientId:
											pill.id !== "payouts" ? undefined : prev.recipientId,
									}),
								})
							}
							className={`rounded-lg px-3 py-1 text-xs font-semibold transition flex items-center gap-1.5 ${tab === pill.id ? "bg-[#0a0a0a] text-white" : "text-muted-foreground hover:text-foreground"}`}
						>
							{pill.label}
							{pill.badge != null && (
								<span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
									{pill.badge}
								</span>
							)}
						</button>
					))}
				</div>

				{canCreateAdjustment && (
					<div className="ml-auto">
						<Button
							size="sm"
							className="h-8 bg-[#0a0a0a] text-white hover:bg-[#262626]"
							onClick={() => setAdjustmentOpen(true)}
						>
							New Adjustment
						</Button>
					</div>
				)}
			</header>

			<div className={tab === "payouts" ? "flex-1 flex flex-col" : "py-6"}>
				{content}
			</div>

			{canCreateAdjustment && organizationId && (
				<ManualAdjustmentDialog
					open={adjustmentOpen}
					onOpenChange={setAdjustmentOpen}
					organizationId={organizationId}
				/>
			)}
		</div>
	);
}
