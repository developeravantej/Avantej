import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";
import { orpc } from "@/utils/orpc";

import { LAUNCHPAD_CARDS, type LaunchpadCardId } from "./cards";
import { LaunchpadPanel } from "./panels";

export function DashboardLaunchpad() {
	const { data: userContext, hasPermission, isLoading } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const { scopeNodeId } = useScope();

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

	// Keep-alive: once a panel has been opened it stays mounted (hidden when
	// inactive) so in-progress work — most importantly a half-built POS sale —
	// survives switching cards. Panels are mounted lazily on first visit.
	const [visited, setVisited] = useState<Set<LaunchpadCardId>>(new Set());
	useEffect(() => {
		if (!active) return;
		setVisited((prev) =>
			prev.has(active.id) ? prev : new Set(prev).add(active.id),
		);
	}, [active]);

	// Appointment count feeds the schedule card badge. Permission-gated: the
	// front-desk cashier persona may lack reports:read, and firing it
	// unconditionally would 403.
	const canReadKpis = hasPermission("reports:read");
	const todayKpisQuery = useQuery({
		...orpc.analytics.getDashboardKpis.queryOptions({
			input: {
				organizationId: organizationId!,
				period: "today",
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId && canReadKpis,
		staleTime: 30_000,
	});

	// ── Live card badges ──
	const installmentsDueQuery = useQuery({
		...orpc.installments.listUpcoming.queryOptions({
			input: {
				organizationId: organizationId!,
				window: "due_soon",
				limit: 1,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId && hasPermission("service_management:read"),
		staleTime: 60_000,
	});
	const payoutsPendingQuery = useQuery({
		...orpc.payouts.list.queryOptions({
			input: {
				organizationId: organizationId!,
				status: "pending",
				limit: 200,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId && hasPermission("commission_payout:read"),
		staleTime: 60_000,
	});
	// Memberships expiring within 7 days — the renewals worklist count.
	// listExpiring is reports:read-gated (the schedule KPI badge is too), so the
	// badge only appears for users with reports access even though the card
	// itself is gated on service_management:read.
	const renewalsDueQuery = useQuery({
		...orpc.packageInstances.listExpiring.queryOptions({
			input: { organizationId: organizationId!, within: 7 },
		}),
		enabled: !!organizationId && hasPermission("reports:read"),
		staleTime: 60_000,
	});
	const refundsPendingQuery = useQuery({
		...orpc.refunds.list.queryOptions({
			input: {
				organizationId: organizationId!,
				status: "pending",
				limit: 1,
				branchId: scopeNodeId,
			},
		}),
		enabled: !!organizationId && hasPermission("refund_management:read"),
		staleTime: 60_000,
	});

	// Badge value per card (undefined → no badge shown).
	const badges: Partial<Record<LaunchpadCardId, number>> = {
		renewals: renewalsDueQuery.data?.total ?? undefined,
		installments: installmentsDueQuery.data?.total ?? undefined,
		refunds: refundsPendingQuery.data?.total ?? undefined,
		payouts: payoutsPendingQuery.data?.length ?? undefined,
		schedule: todayKpisQuery.data?.totalAppointments ?? undefined,
	};

	// While the user context is still resolving, organizationId and permissions
	// are not yet known — show a neutral loading state rather than a misleading
	// "Select an organization" / "No tasks" flash.
	if (isLoading && !userContext) {
		return (
			<div className="-m-6 flex h-screen items-center justify-center text-muted-foreground">
				Loading your dashboard…
			</div>
		);
	}

	if (!organizationId) {
		return (
			<div className="-m-6 flex h-screen items-center justify-center text-muted-foreground">
				Select an organization to continue.
			</div>
		);
	}

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f6f7f9]">
			{/* ── Header: title + tenant scope switcher (country → state → branch) ── */}
			<div className="flex flex-wrap items-center justify-between gap-3 px-7 pt-5">
				<h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
				<ScopeSwitcher className="w-56" />
			</div>

			{/* ── Master / detail ── */}
			<div className="grid flex-1 grid-cols-1 gap-4 px-7 pb-5 pt-4 lg:grid-cols-[300px_1fr]">
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

				{/* Right: detail panel (keep-alive — visited panels stay mounted) */}
				<div className="flex min-h-[460px] flex-col rounded-2xl border border-[#e8ebf0] bg-white p-6 shadow-sm">
					{active ? (
						visibleCards
							.filter((c) => visited.has(c.id))
							.map((c) => (
								<div
									key={c.id}
									className={cn(
										"flex-1 min-h-0",
										c.id !== active.id && "hidden",
									)}
								>
									<LaunchpadPanel id={c.id} organizationId={organizationId} />
								</div>
							))
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
