import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Lock, LockOpen, Unlock } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useScope } from "@/components/scope/ScopeProvider";
import { ScopeSwitcher } from "@/components/scope/ScopeSwitcher";
import { StatusCallout } from "@/components/ui/status-callout";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a timestamp value (Date or ISO string) as a UTC day (YYYY-MM-DD). */
function fmtDay(value: unknown): string {
	if (!value) return "—";
	const d = new Date(value as string);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

/** Format a timestamp value (Date or ISO string) as a local date-time. */
function fmtDateTime(value: unknown): string {
	if (!value) return "—";
	const d = new Date(value as string);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toLocaleString();
}

function StateBadge({ state }: { state: string }) {
	const locked = state === "locked";
	return (
		<span
			className={
				locked
					? "inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700"
					: "inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700"
			}
		>
			{locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
			{locked ? "Locked" : "Open"}
		</span>
	);
}

function LockKindBadge({ kind }: { kind: string | null | undefined }) {
	if (!kind) return <span className="text-[#a3a3a3]">—</span>;
	return (
		<span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#525252]">
			{kind}
		</span>
	);
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

/**
 * WS5 Payroll Periods — tenant grid of per-branch commission windows with
 * lock / unlock controls. A locked window freezes back-dated commission
 * corrections so a settled month can't be mutated. Read is route-gated on
 * `commission_payout:read`; the lock/unlock actions require
 * `commission_payout:update`.
 */
export function PayrollPeriodsPage() {
	const { data: userContext, hasPermission } = useUserContext();
	const { scopeNodeId, scopeNodes } = useScope();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const canUpdate = hasPermission("commission_payout:update");

	// Current org → node-name lookup for the Branch column.
	const org = useMemo(() => {
		if (!userContext) return null;
		const id = userContext.currentOrganizationId;
		return (
			(id
				? userContext.organizations.find((o) => o.id === id)
				: userContext.organizations[0]) ?? null
		);
	}, [userContext]);

	const branchNameById = useMemo(() => {
		const map = new Map<string, string>();
		for (const n of org?.hierarchy.nodes ?? []) map.set(n.id, n.name);
		return map;
	}, [org]);

	// Branches the caller can lock (accessible leaf nodes typed "branch").
	const branchOptions = useMemo(
		() => scopeNodes.filter((n) => n.type === "branch"),
		[scopeNodes],
	);

	// ---- Lock-form state ----
	const [lockBranchId, setLockBranchId] = useState("");
	const [lockDate, setLockDate] = useState("");
	// Default the lock target to the active scope only when it is itself a branch
	// (a country/state scope isn't a lockable window), else the first branch.
	const scopeIsBranch = branchOptions.some((n) => n.id === scopeNodeId);
	const effectiveBranchId =
		lockBranchId ||
		(scopeIsBranch ? (scopeNodeId ?? "") : "") ||
		branchOptions[0]?.id ||
		"";

	// ---- Query ----
	const query = useQuery({
		...orpc.payrollPeriods.list.queryOptions({
			input: {
				organizationId: organizationId!,
				branchNodeId: scopeNodeId ?? undefined,
			},
		}),
		enabled: !!organizationId,
	});

	const periods = query.data ?? [];

	// ---- Mutations ----
	const lockMutation = useApiMutation({
		mutationFn: (vars: { branchNodeId: string; referenceDate?: string }) =>
			client.payrollPeriods.lockNow({
				organizationId: organizationId!,
				branchNodeId: vars.branchNodeId,
				referenceDate: vars.referenceDate,
			}),
		successMessage: "Payroll period locked",
		errorMessage: (err) =>
			`Failed to lock period: ${err.message || "An unexpected error occurred"}`,
		invalidate: [orpc.payrollPeriods.list.key()],
	});

	const unlockMutation = useApiMutation({
		mutationFn: (vars: { periodId: string; reason: string }) =>
			client.payrollPeriods.unlock({
				organizationId: organizationId!,
				periodId: vars.periodId,
				reason: vars.reason,
			}),
		successMessage: "Payroll period unlocked",
		errorMessage: (err) =>
			`Failed to unlock period: ${err.message || "An unexpected error occurred"}`,
		invalidate: [orpc.payrollPeriods.list.key()],
	});

	// ---- Handlers ----
	function handleLock() {
		if (!effectiveBranchId) {
			toast.error("Select a branch to lock.");
			return;
		}
		const referenceDate = lockDate
			? new Date(`${lockDate}T00:00:00.000Z`).toISOString()
			: undefined;
		lockMutation.mutate({ branchNodeId: effectiveBranchId, referenceDate });
	}

	function handleUnlock(periodId: string) {
		const reason = window.prompt(
			"Reason for unlocking this payroll period (min 3 characters):",
		);
		if (reason === null) return; // cancelled
		if (reason.trim().length < 3) {
			toast.error("Unlock reason must be at least 3 characters.");
			return;
		}
		unlockMutation.mutate({ periodId, reason: reason.trim() });
	}

	// ---- Guards ----
	if (!organizationId) {
		return (
			<div className="-m-6 flex min-h-screen flex-col items-center justify-center bg-[#f3f3f3] p-6">
				<Lock className="mb-3 h-8 w-8 text-[#737373] opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					No organization selected
				</p>
				<p className="mt-1 text-xs text-[#737373]">
					Select an organization to view payroll periods.
				</p>
			</div>
		);
	}

	if (!hasPermission("commission_payout:read")) {
		return (
			<div className="-m-6 flex min-h-screen flex-col items-center justify-center bg-[#f3f3f3] p-6">
				<Lock className="mb-3 h-8 w-8 text-[#737373] opacity-30" />
				<p className="text-sm font-medium text-[#0a0a0a]">
					You don&apos;t have access to this page
				</p>
				<p className="mt-1 text-xs text-[#737373]">
					Ask an admin to grant commission payout access.
				</p>
			</div>
		);
	}

	// ---- Render ----
	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			{/* ── Sticky header ── */}
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-[#737373]">Finance</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Payroll Periods</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<ScopeSwitcher className="w-56" />
				</div>
			</header>

			<div className="px-6 py-6">
				{/* ── Lock current period ── */}
				{canUpdate && (
					<div className="mb-5 rounded-2xl border border-[#e5e5e5] bg-white p-4">
						<div className="flex flex-wrap items-end gap-3">
							<div className="flex flex-col gap-1">
								<label
									htmlFor="payroll-lock-branch"
									className="text-[10px] font-bold uppercase tracking-widest text-[#737373]"
								>
									Branch
								</label>
								<select
									id="payroll-lock-branch"
									className="h-9 min-w-56 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
									value={effectiveBranchId}
									onChange={(e) => setLockBranchId(e.target.value)}
								>
									{branchOptions.length === 0 ? (
										<option value="">No branches available</option>
									) : (
										branchOptions.map((n) => (
											<option key={n.id} value={n.id}>
												{n.name}
											</option>
										))
									)}
								</select>
							</div>
							<div className="flex flex-col gap-1">
								<label
									htmlFor="payroll-lock-date"
									className="text-[10px] font-bold uppercase tracking-widest text-[#737373]"
								>
									Reference date (optional)
								</label>
								<input
									id="payroll-lock-date"
									type="date"
									className="h-9 w-40 rounded-xl border border-[#e5e5e5] bg-white px-3 text-sm text-[#0a0a0a] outline-none"
									value={lockDate}
									onChange={(e) => setLockDate(e.target.value)}
								/>
							</div>
							<button
								type="button"
								onClick={handleLock}
								disabled={lockMutation.isPending || !effectiveBranchId}
								className="flex h-9 items-center gap-2 rounded-lg bg-[#0a0a0a] px-4 text-xs font-semibold text-white transition hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
							>
								<Lock className="h-3.5 w-3.5" />
								{lockMutation.isPending ? "Locking…" : "Lock current period"}
							</button>
							<p className="ml-auto max-w-xs text-[11px] leading-snug text-[#a3a3a3]">
								Locks the commission window covering the reference date
								(defaults to today) for the selected branch.
							</p>
						</div>
					</div>
				)}

				{/* ── Table ── */}
				{query.isError ? (
					<div className="rounded-2xl border border-[#e5e5e5] bg-white p-5">
						<StatusCallout variant="error" onRetry={() => query.refetch()}>
							Failed to load payroll periods. Please try again.
						</StatusCallout>
					</div>
				) : (
					<div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
						<div className="overflow-x-auto">
							<table className="w-full">
								<thead className="bg-[#f3f3f3]">
									<tr className="border-b border-[#e5e5e5]">
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Branch
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Period
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											State
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Locked At
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Locked By
										</th>
										<th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-[#737373]">
											Lock Kind
										</th>
										{canUpdate && (
											<th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-[#737373]">
												Actions
											</th>
										)}
									</tr>
								</thead>
								<tbody className="divide-y divide-[#e5e5e5]">
									{query.isLoading ? (
										<tr>
											<td colSpan={canUpdate ? 7 : 6}>
												<div className="flex items-center justify-center py-16 text-sm text-[#737373]">
													Loading payroll periods…
												</div>
											</td>
										</tr>
									) : periods.length === 0 ? (
										<tr>
											<td colSpan={canUpdate ? 7 : 6}>
												<div className="flex flex-col items-center justify-center py-16 text-[#737373]">
													<CalendarClock className="mb-3 h-8 w-8 opacity-30" />
													<p className="text-sm font-medium text-[#0a0a0a]">
														No payroll periods yet
													</p>
													<p className="mt-1 text-xs">
														{canUpdate
															? "Lock a branch's current window to create the first period."
															: "Locked commission windows will appear here."}
													</p>
												</div>
											</td>
										</tr>
									) : (
										periods.map((p) => {
											const locked = p.state === "locked";
											return (
												<tr
													key={p.id}
													className="group transition-colors hover:bg-[#fafafa]"
												>
													<td className="px-4 py-3 text-sm font-medium text-[#0a0a0a]">
														{branchNameById.get(p.branchNodeId) ??
															p.branchNodeId}
													</td>
													<td className="px-4 py-3 font-mono text-sm tabular-nums text-[#525252]">
														{fmtDay(p.periodStart)}
														<span className="mx-1 text-[#a3a3a3]">–</span>
														{fmtDay(p.periodEnd)}
													</td>
													<td className="px-4 py-3">
														<StateBadge state={p.state} />
													</td>
													<td className="px-4 py-3 font-mono text-xs tabular-nums text-[#737373]">
														{fmtDateTime(p.lockedAt)}
													</td>
													<td className="px-4 py-3 font-mono text-xs tabular-nums text-[#737373]">
														{p.lockedBy ?? "—"}
													</td>
													<td className="px-4 py-3">
														<LockKindBadge kind={p.lockKind} />
													</td>
													{canUpdate && (
														<td className="px-4 py-3 text-right">
															{locked ? (
																<button
																	type="button"
																	onClick={() => handleUnlock(p.id)}
																	disabled={unlockMutation.isPending}
																	className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
																>
																	<Unlock className="h-3.5 w-3.5" />
																	Unlock
																</button>
															) : (
																<span className="text-xs text-[#a3a3a3]">
																	—
																</span>
															)}
														</td>
													)}
												</tr>
											);
										})
									)}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
