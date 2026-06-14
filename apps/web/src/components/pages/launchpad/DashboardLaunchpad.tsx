import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { orpc } from "@/utils/orpc";

import { LAUNCHPAD_CARDS, type LaunchpadCardId } from "./cards";
import { LaunchpadPanel } from "./panels";

function StatTile({
	label,
	value,
	loading,
}: {
	label: string;
	value: string;
	loading?: boolean;
}) {
	return (
		<div className="min-w-[150px] rounded-xl border border-[#e8ebf0] bg-white px-4 py-3 shadow-sm">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className="mt-1 text-xl font-bold tracking-tight">
				{loading ? "…" : value}
			</div>
		</div>
	);
}

export function DashboardLaunchpad() {
	const { data: userContext, hasPermission } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;

	// Cards the current user is allowed to see.
	const visibleCards = useMemo(
		() =>
			LAUNCHPAD_CARDS.filter(
				(c) => !c.permission || hasPermission(c.permission),
			),
		[hasPermission],
	);

	const [activeId, setActiveId] = useState<LaunchpadCardId>(
		visibleCards[0]?.id ?? "new-sale",
	);
	// If the visible set changes (permissions load in), keep the active card valid.
	const active = visibleCards.find((c) => c.id === activeId) ?? visibleCards[0];

	// ── Today's glance ──
	const todayKpisQuery = useQuery({
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: { organizationId: organizationId!, period: "today" },
		}),
		enabled: !!organizationId,
		staleTime: 30_000,
	});
	const newTodayQuery = useQuery({
		...orpc.members.newToday.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
		staleTime: 30_000,
	});

	// ── Live card badges ──
	const installmentsDueQuery = useQuery({
		...orpc.installments.listUpcoming.queryOptions({
			input: { organizationId: organizationId!, window: "due_soon", limit: 1 },
		}),
		enabled: !!organizationId && hasPermission("service_management:read"),
		staleTime: 60_000,
	});
	const payoutsPendingQuery = useQuery({
		...orpc.payouts.list.queryOptions({
			input: { organizationId: organizationId!, status: "pending", limit: 200 },
		}),
		enabled: !!organizationId && hasPermission("commission_payout:read"),
		staleTime: 60_000,
	});

	// Badge value per card (undefined → no badge shown).
	const badges: Partial<Record<LaunchpadCardId, number>> = {
		installments: installmentsDueQuery.data?.total ?? undefined,
		payouts: payoutsPendingQuery.data?.length ?? undefined,
		schedule: todayKpisQuery.data?.totalAppointments ?? undefined,
	};

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen items-center justify-center text-muted-foreground">
				Select an organization to continue.
			</div>
		);
	}

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f6f7f9]">
			{/* ── Today's glance ── */}
			<div className="flex flex-wrap gap-3 px-7 pt-6">
				<StatTile
					label="Today's sales"
					value={formatPrice(todayKpisQuery.data?.totalSales ?? 0)}
					loading={todayKpisQuery.isLoading}
				/>
				<StatTile
					label="New customers today"
					value={String(newTodayQuery.data?.count ?? 0)}
					loading={newTodayQuery.isLoading}
				/>
				<StatTile
					label="Appointments today"
					value={String(todayKpisQuery.data?.totalAppointments ?? 0)}
					loading={todayKpisQuery.isLoading}
				/>
			</div>

			{/* ── Master / detail ── */}
			<div className="grid flex-1 grid-cols-1 gap-4 px-7 py-5 lg:grid-cols-[300px_1fr]">
				{/* Left: card rail */}
				<div className="flex flex-col gap-2.5">
					<div className="px-1 pb-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
						Daily tasks
					</div>
					{visibleCards.map((card) => {
						const isActive = card.id === active?.id;
						return (
							<button
								key={card.id}
								type="button"
								onClick={() => setActiveId(card.id)}
								className={cn(
									"flex items-center gap-3 rounded-xl border bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-sm",
									isActive
										? "border-primary bg-primary/5 shadow-sm"
										: "border-[#e8ebf0]",
								)}
							>
								<span
									className={cn(
										"grid size-9 shrink-0 place-items-center rounded-lg",
										isActive ? "bg-white" : "bg-slate-100",
									)}
								>
									<card.icon className="size-[18px]" />
								</span>
								<span className="min-w-0">
									<span className="block text-sm font-semibold">
										{card.label}
									</span>
									<span className="mt-0.5 block text-xs text-muted-foreground">
										{card.sub}
									</span>
								</span>
								{badges[card.id] && badges[card.id]! > 0 ? (
									<span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-700">
										{badges[card.id]! > 99 ? "99+" : badges[card.id]}
									</span>
								) : null}
							</button>
						);
					})}
				</div>

				{/* Right: detail panel */}
				<div className="min-h-[460px] rounded-2xl border border-[#e8ebf0] bg-white p-6 shadow-sm">
					{active ? (
						<LaunchpadPanel id={active.id} organizationId={organizationId} />
					) : (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							No tasks available for your role.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
