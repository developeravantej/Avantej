/**
 * Approvals page — admins/trainers act on customer-purchased packages that
 * landed in `pending` status (gated by org setting package_approval.required).
 *
 * Pattern C: assignment IS approval. Trainers self-assign; admins assign any
 * trainer in their accessible branch. Admins can also reject.
 *
 * Layout: Design 1 — Inbox (Gmail-style dense list with hero KPIs, filter bar,
 * bulk-action bar, date-grouped rows, click-to-expand inline detail panel).
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { requireRole } from "@/lib/route-guards";
import { ChevronDown, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { RejectPackageDialog } from "@/components/forms/reject-package-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApiMutation } from "@/hooks/useApiMutation";
import { useUserContext } from "@/hooks/useUserContext";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";

// ── Types ────────────────────────────────────────────────────────────────────

type PendingRow = {
	id: string;
	clientId: string | null;
	serviceId: string;
	serviceName: string | null;
	branchId: string | null;
	totalPrice: number | null;
	creditsTotal: number;
	createdAt: string | Date;
	customerName: string | null;
	customerEmail: string | null;
	preferredTrainerId: string | null;
	preferredTrainerName: string | null;
	paymentMethod: string | null;
	paymentStatus: string | null;
};

type PriorityLevel = "high" | "med" | "low";
type DateGroup = "today" | "yesterday" | "earlier" | "older";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(value: string | Date | null | undefined): string {
	if (!value) return "—";
	try {
		return new Date(value).toLocaleString("en-MY", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

function formatPrice(cents: number | null): string {
	if (cents == null) return "—";
	return `RM ${(cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatPriceShort(cents: number): string {
	const rm = cents / 100;
	return `RM ${rm.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Priority logic: packages over a certain age or high value = high priority
function getPriority(row: PendingRow): PriorityLevel {
	const ageMs = Date.now() - new Date(row.createdAt).getTime();
	const ageDays = ageMs / (1000 * 60 * 60 * 24);
	if (ageDays > 3 || (row.totalPrice ?? 0) >= 50000) return "high";
	if (ageDays > 1 || (row.totalPrice ?? 0) >= 20000) return "med";
	return "low";
}

function getDateGroup(row: PendingRow): DateGroup {
	const now = new Date();
	const created = new Date(row.createdAt);
	const ageMs = now.getTime() - created.getTime();
	const ageDays = ageMs / (1000 * 60 * 60 * 24);

	// Same calendar day
	if (
		created.getDate() === now.getDate() &&
		created.getMonth() === now.getMonth() &&
		created.getFullYear() === now.getFullYear()
	) {
		return "today";
	}
	if (ageDays < 2) return "yesterday";
	if (ageDays < 3) return "earlier";
	return "older";
}

function formatAge(createdAt: string | Date): string {
	const ageMs = Date.now() - new Date(createdAt).getTime();
	const mins = Math.floor(ageMs / 60000);
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	const remHrs = hrs - days * 24;
	return `${days}d ${remHrs}h ago`;
}

function formatOverdue(createdAt: string | Date): string {
	const ageMs = Date.now() - new Date(createdAt).getTime();
	const hrs = Math.floor(ageMs / (1000 * 60 * 60));
	const days = Math.floor(hrs / 24);
	const remHrs = hrs - days * 24;
	return `${days}d ${remHrs}h overdue`;
}

function getInitials(name: string | null): string {
	if (!name) return "?";
	return name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase() ?? "")
		.join("");
}

function formatToday(): string {
	return new Date().toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: PriorityLevel }) {
	return (
		<span
			className={cn(
				"inline-block size-1.5 shrink-0 rounded-full",
				priority === "high" && "bg-rose-500",
				priority === "med" && "bg-amber-500",
				priority === "low" && "bg-blue-400",
			)}
			title={`${priority} priority`}
		/>
	);
}

// ── Hero section ─────────────────────────────────────────────────────────────

function HeroStats({
	list,
	orgName,
	filteredCount,
	onApproveAll,
	onExport,
}: {
	list: PendingRow[];
	orgName: string;
	filteredCount: number;
	onApproveAll: () => void;
	onExport: () => void;
}) {
	const totalPending = list.length;
	const pendingValueCents = list.reduce((s, r) => s + (r.totalPrice ?? 0), 0);
	const highCount = list.filter((r) => getPriority(r) === "high").length;

	// Oldest pending — computable from real data
	const oldestMs =
		list.length > 0
			? Math.max(...list.map((r) => Date.now() - new Date(r.createdAt).getTime()))
			: 0;
	const oldestHrs = Math.floor(oldestMs / (1000 * 60 * 60));
	const oldestDays = Math.floor(oldestHrs / 24);
	const oldestRemHrs = oldestHrs - oldestDays * 24;
	const oldestLabel =
		list.length === 0 ? "—" : `${oldestDays}d ${oldestRemHrs}h`;
	const isPastSLA = oldestDays >= 3;

	return (
		<section className="relative overflow-hidden rounded-3xl border border-[#e5e5e5] bg-gradient-to-br from-white to-[#fafafa] p-7">
			{/* Radial glow */}
			<div className="pointer-events-none absolute -top-32 right-0 size-[380px] rounded-full bg-[radial-gradient(circle,_rgba(214,205,177,0.35)_0%,_transparent_70%)]" />

			<div className="relative z-10">
				{/* Live status row */}
				<div className="mb-3 flex items-center gap-3">
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
					<span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						{orgName} · Approvals Queue · Live
					</span>
					<span className="text-[#a3a3a3]">·</span>
					<span className="text-xs text-muted-foreground">{formatToday()}</span>
				</div>

				<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
					Pending package approvals
				</div>
				<div className="mt-1 flex items-baseline gap-3">
					<span className="font-mono text-6xl font-extrabold leading-none tracking-tight tabular-nums text-[#0a0a0a]">
						{totalPending}
					</span>
				</div>

				<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
					<span>
						<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
							{highCount}
						</span>{" "}
						high-priority
					</span>
					<span className="text-[#a3a3a3]">·</span>
					<span>
						<span className="font-mono font-semibold tabular-nums text-[#0a0a0a]">
							{formatPriceShort(pendingValueCents)}
						</span>{" "}
						in pending value
					</span>
					{list.length > 0 && (
						<>
							<span className="text-[#a3a3a3]">·</span>
							<span>
								oldest{" "}
								<span
									className={`font-mono font-semibold tabular-nums ${
										isPastSLA ? "text-rose-600" : "text-[#0a0a0a]"
									}`}
								>
									{oldestLabel}
								</span>
								{isPastSLA && (
									<span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
										past SLA
									</span>
								)}
							</span>
						</>
					)}
				</div>

				<div className="mt-7 flex items-center gap-2">
					<button
						type="button"
						onClick={onApproveAll}
						className="flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626]"
					>
						Approve all visible ({filteredCount})
					</button>
					<button
						type="button"
						onClick={onExport}
						disabled={list.length === 0}
						className="flex items-center gap-1.5 rounded-lg border border-[#e5e5e5] bg-white px-4 py-2 text-xs font-medium transition-colors hover:bg-[#f3f3f3] disabled:opacity-40"
					>
						Export queue
					</button>
				</div>
			</div>
		</section>
	);
}

// ── Filter bar ────────────────────────────────────────────────────────────────

function FilterBar({
	search,
	onSearch,
	priorityFilter,
	onPriority,
	scope,
	onScope,
	counts,
}: {
	search: string;
	onSearch: (v: string) => void;
	priorityFilter: "all" | PriorityLevel;
	onPriority: (v: "all" | PriorityLevel) => void;
	scope: "all" | "assignable_to_me";
	onScope: (v: "all" | "assignable_to_me") => void;
	counts: { all: number; high: number; med: number; low: number };
}) {
	const priorityOptions: Array<{ key: "all" | PriorityLevel; label: string }> =
		[
			{ key: "all", label: "All" },
			{ key: "high", label: "High" },
			{ key: "med", label: "Med" },
			{ key: "low", label: "Low" },
		];

	return (
		<div className="mt-6 flex flex-wrap items-center gap-3">
			{/* Search */}
			<div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5">
				<Search size={14} className="shrink-0 text-muted-foreground" />
				<input
					type="text"
					value={search}
					onChange={(e) => onSearch(e.target.value)}
					placeholder="Search customer, package…"
					className="flex-1 bg-transparent text-sm text-[#0a0a0a] outline-none placeholder:text-[#a3a3a3]"
				/>
			</div>

			{/* Priority pills */}
			<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-white p-1">
				{priorityOptions.map((opt) => (
					<button
						key={opt.key}
						type="button"
						onClick={() => onPriority(opt.key)}
						className={cn(
							"rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
							priorityFilter === opt.key
								? "bg-[#0a0a0a] text-white"
								: "text-muted-foreground hover:text-[#0a0a0a]",
						)}
					>
						{opt.label}
						{opt.key !== "all" && (
							<span
								className={cn(
									"ml-1",
									priorityFilter === opt.key
										? "opacity-70"
										: "text-[#a3a3a3]",
								)}
							>
								{counts[opt.key]}
							</span>
						)}
						{opt.key === "all" && (
							<span
								className={cn(
									"ml-1",
									priorityFilter === "all" ? "opacity-70" : "text-[#a3a3a3]",
								)}
							>
								{counts.all}
							</span>
						)}
					</button>
				))}
			</div>

			{/* Scope toggle (folded into filter bar) */}
			<div className="flex items-center gap-1 rounded-xl border border-[#e5e5e5] bg-white p-1">
				<button
					type="button"
					onClick={() => onScope("all")}
					className={cn(
						"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
						scope === "all"
							? "bg-[#0a0a0a] text-white"
							: "text-muted-foreground hover:text-[#0a0a0a]",
					)}
				>
					All branches
				</button>
				<button
					type="button"
					onClick={() => onScope("assignable_to_me")}
					className={cn(
						"rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
						scope === "assignable_to_me"
							? "bg-[#0a0a0a] text-white"
							: "text-muted-foreground hover:text-[#0a0a0a]",
					)}
				>
					Assignable to me
				</button>
			</div>
		</div>
	);
}

// ── Bulk action bar ───────────────────────────────────────────────────────────

function BulkActionBar({
	checkedIds,
	list,
	isAdmin,
	onApprove,
	onReject,
	onClear,
}: {
	checkedIds: Set<string>;
	list: PendingRow[];
	isAdmin: boolean;
	onApprove: () => void;
	onReject: () => void;
	onClear: () => void;
}) {
	if (checkedIds.size === 0) return null;

	const selectedRows = list.filter((r) => checkedIds.has(r.id));
	const totalValueCents = selectedRows.reduce(
		(s, r) => s + (r.totalPrice ?? 0),
		0,
	);

	return (
		<div className="mt-4 flex items-center justify-between rounded-xl border border-[#0a0a0a] bg-[#0a0a0a] p-3 text-white shadow-lg">
			<div className="flex items-center gap-3 text-xs">
				<span className="font-mono font-bold tabular-nums">
					{checkedIds.size} selected
				</span>
				<span className="text-white/40">·</span>
				<span className="font-mono tabular-nums">
					{formatPriceShort(totalValueCents)} total value
				</span>
			</div>
			<div className="flex items-center gap-2">
				{isAdmin && (
					<>
						<button
							type="button"
							onClick={onApprove}
							className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
						>
							Approve {checkedIds.size}…
						</button>
						<button
							type="button"
							onClick={onReject}
							className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20"
						>
							Reject…
						</button>
					</>
				)}
				<button
					type="button"
					onClick={onClear}
					className="ml-2 text-white/40 transition-colors hover:text-white"
					title="Clear selection"
				>
					<X size={14} />
				</button>
			</div>
		</div>
	);
}

// ── Expanded row detail ───────────────────────────────────────────────────────

type TrainerMember = {
	role: string;
	status: string;
	id: string;
	userId: string;
	name: string;
};

function TrainerAvatar({
	name,
	role,
	selected,
}: {
	name: string;
	role: string;
	selected: boolean;
}) {
	const initials = name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase() ?? "")
		.join("");
	return (
		<div
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
				selected
					? "bg-white/15 text-white"
					: role === "admin"
						? "bg-[#d6cdb1]/50 text-[#6b5e3c]"
						: "bg-[#e8f0fe] text-[#3d6bce]",
			)}
		>
			{initials}
		</div>
	);
}

function ExpandedRowDetail({
	row,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	onAssigned,
	onReject,
}: {
	row: PendingRow;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
}) {
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [selectedTrainerId, setSelectedTrainerId] = useState("");

	const { data: members = [], isLoading: loadingTrainers } = useQuery({
		queryKey: ["members", organizationId, "trainer-list"],
		queryFn: () => client.members.list({ organizationId }),
		enabled: popoverOpen && isAdmin,
	});

	const trainers = useMemo(
		() =>
			(members as TrainerMember[])
				.filter((m) => (m.role === "trainer" || m.role === "admin") && m.status === "active")
				.sort((a, b) => {
					const aPreferred = a.id === row.preferredTrainerId ? -1 : 0;
					const bPreferred = b.id === row.preferredTrainerId ? -1 : 0;
					return aPreferred - bPreferred;
				}),
		[members, row.preferredTrainerId],
	);

	const selectedTrainerName = trainers.find((t) => t.id === selectedTrainerId)?.name;

	const assignMutation = useApiMutation({
		mutationFn: () => {
			if (!selectedTrainerId) throw new Error("Pick a trainer first");
			return client.packageInstances.assignTrainer({
				organizationId,
				packageInstanceId: row.id,
				trainerMemberId: selectedTrainerId,
			});
		},
		successMessage: "Trainer assigned. Package is now active.",
		errorMessage: (err) => err?.message ?? "Failed to assign trainer.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			setPopoverOpen(false);
			setSelectedTrainerId("");
			onAssigned();
		},
	});

	const selfAssignMutation = useApiMutation({
		mutationFn: () => {
			if (!callerMemberId) throw new Error("No member ID");
			return client.packageInstances.assignTrainer({
				organizationId,
				packageInstanceId: row.id,
				trainerMemberId: callerMemberId,
			});
		},
		successMessage: "You've been assigned as trainer.",
		errorMessage: (err) => err?.message ?? "Failed to self-assign.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => onAssigned(),
	});

	return (
		<div className="border-t border-[#e5e5e5] bg-white px-5 py-5">
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
				{/* Customer */}
				<div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						Customer
					</div>
					<div className="mt-1.5 text-sm font-semibold">
						{row.customerName ?? "—"}
					</div>
					<div className="text-xs text-muted-foreground">
						{row.customerEmail ?? "—"}
					</div>
				</div>

				{/* Package */}
				<div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						Package
					</div>
					<div className="mt-1.5 text-sm font-semibold">
						{row.serviceName ?? "—"}
					</div>
					<div className="text-xs text-muted-foreground">
						{row.creditsTotal} credits
					</div>
					<div className="font-mono text-sm font-bold tabular-nums">
						{formatPrice(row.totalPrice)}
					</div>
				</div>

				{/* Payment */}
				<div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						Payment
					</div>
					<div className="mt-1.5 text-sm font-semibold">
						{row.paymentMethod ?? (
							<span className="font-normal italic text-muted-foreground">
								No method recorded
							</span>
						)}
					</div>
					{row.paymentStatus && (
						<div className="mt-1">
							<span
								className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
									row.paymentStatus === "paid"
										? "bg-emerald-100 text-emerald-700"
										: row.paymentStatus === "partially_paid"
											? "bg-blue-100 text-blue-700"
											: row.paymentStatus === "pending"
												? "bg-amber-100 text-amber-700"
												: row.paymentStatus === "failed"
													? "bg-rose-100 text-rose-700"
													: "bg-[#f3f3f3] text-muted-foreground"
								}`}
							>
								{row.paymentStatus}
							</span>
						</div>
					)}
					<div className="mt-1.5 text-xs text-muted-foreground">
						Submitted {formatDate(row.createdAt)}
					</div>
				</div>

				{/* Preferred trainer */}
				<div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						Preferred trainer
					</div>
					{row.preferredTrainerName ? (
						<div className="mt-1.5 text-sm font-semibold">
							{row.preferredTrainerName}
						</div>
					) : (
						<div className="mt-1.5 text-sm italic text-muted-foreground">
							No preference
						</div>
					)}
				</div>
			</div>

			{/* Action row */}
			<div className="mt-5 flex items-center gap-2">
				{isAdmin && (
					<Popover
						open={popoverOpen}
						onOpenChange={(o) => {
							setPopoverOpen(o);
							if (!o) setSelectedTrainerId("");
						}}
					>
						<PopoverTrigger asChild>
							<button
								type="button"
								className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626]"
							>
								Approve &amp; assign
							</button>
						</PopoverTrigger>

						<PopoverContent
							align="start"
							sideOffset={8}
							className="w-[280px] overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white p-0 shadow-xl"
						>
							{/* Popover header */}
							<div className="border-b border-[#f0f0f0] px-4 py-3">
								<p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
									Select trainer
								</p>
								{row.preferredTrainerName && (
									<p className="mt-0.5 text-xs text-muted-foreground">
										Customer prefers{" "}
										<span className="font-semibold text-[#0a0a0a]">
											{row.preferredTrainerName}
										</span>
									</p>
								)}
							</div>

							{/* Trainer list */}
							<div className="max-h-[260px] overflow-y-auto py-1.5">
								{loadingTrainers ? (
									<div className="px-4 py-8 text-center text-xs text-muted-foreground">
										Loading trainers…
									</div>
								) : trainers.length === 0 ? (
									<div className="px-4 py-8 text-center text-xs text-muted-foreground">
										No active trainers found
									</div>
								) : (
									trainers.map((t) => {
										const isSelected = selectedTrainerId === t.id;
										const isPreferred = t.name === row.preferredTrainerName;
										return (
											<button
												key={t.id}
												type="button"
												onClick={() =>
													setSelectedTrainerId(isSelected ? "" : t.id)
												}
												className={cn(
													"flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
													isSelected
														? "bg-[#0a0a0a]"
														: "hover:bg-[#f5f5f5]",
												)}
											>
												<TrainerAvatar
													name={t.name}
													role={t.role}
													selected={isSelected}
												/>

												<div className="min-w-0 flex-1">
													<div
														className={cn(
															"flex items-center gap-1.5 text-sm font-semibold leading-tight",
															isSelected ? "text-white" : "text-[#0a0a0a]",
														)}
													>
														{t.name}
														{isPreferred && (
															<span
																className={cn(
																	"rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
																	isSelected
																		? "bg-white/20 text-white"
																		: "bg-amber-100 text-amber-700",
																)}
															>
																preferred
															</span>
														)}
													</div>
													<div
														className={cn(
															"mt-0.5 text-[11px] capitalize",
															isSelected
																? "text-white/60"
																: "text-muted-foreground",
														)}
													>
														{t.role}
													</div>
												</div>

												{isSelected && (
													<svg
														viewBox="0 0 16 16"
														fill="white"
														className="size-4 shrink-0 opacity-90"
													>
														<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
													</svg>
												)}
											</button>
										);
									})
								)}
							</div>

							{/* Popover footer */}
							<div className="border-t border-[#f0f0f0] p-3">
								<button
									type="button"
									disabled={!selectedTrainerId || assignMutation.isPending}
									onClick={() => assignMutation.mutate()}
									className="w-full rounded-lg bg-[#0a0a0a] py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-40"
								>
									{assignMutation.isPending
										? "Assigning…"
										: selectedTrainerName
											? `Assign ${selectedTrainerName}`
											: "Select a trainer above"}
								</button>
							</div>
						</PopoverContent>
					</Popover>
				)}

				{isTrainer && (
					<button
						type="button"
						disabled={!callerMemberId || selfAssignMutation.isPending}
						onClick={() => selfAssignMutation.mutate()}
						className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-40"
					>
						{selfAssignMutation.isPending ? "Assigning…" : "Assign me"}
					</button>
				)}

				{isAdmin && (
					<button
						type="button"
						onClick={() => onReject(row)}
						className="ml-auto rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
					>
						Reject…
					</button>
				)}
			</div>
		</div>
	);
}

// ── Single inbox row ──────────────────────────────────────────────────────────

function InboxRow({
	row,
	isExpanded,
	isChecked,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	isFirstInList,
	onToggle,
	onCheck,
	onAssigned,
	onReject,
}: {
	row: PendingRow;
	isExpanded: boolean;
	isChecked: boolean;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	isFirstInList: boolean;
	onToggle: () => void;
	onCheck: () => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
}) {
	const priority = getPriority(row);
	const group = getDateGroup(row);
	const isOverdue = group === "older";
	const initials = getInitials(row.customerName);

	return (
		<div
			className={cn(
				"border-b border-[#e5e5e5] transition-colors",
				isExpanded && "bg-[#f3f3f3]/40",
				isOverdue && !isExpanded && "border-l-2 border-l-rose-500 bg-rose-50/30",
				isChecked && !isOverdue && !isExpanded && "bg-[#f3f3f3]/40",
			)}
		>
			{/* Clickable row header */}
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex w-full cursor-pointer items-center gap-4 px-5 py-3.5 text-left transition-colors",
					isOverdue
						? "hover:bg-rose-50/50"
						: "hover:bg-[#f3f3f3]",
				)}
			>
				{/* Checkbox */}
				<span
					role="checkbox"
					aria-checked={isChecked}
					tabIndex={0}
					onClick={(e) => {
						e.stopPropagation();
						onCheck();
					}}
					onKeyDown={(e) => {
						if (e.key === " " || e.key === "Enter") {
							e.stopPropagation();
							onCheck();
						}
					}}
					className={cn(
						"inline-block h-3.5 w-3.5 shrink-0 cursor-pointer rounded-[3px] border",
						isChecked
							? "border-[#0a0a0a] bg-[#0a0a0a]"
							: "border-[#a3a3a3] bg-white",
					)}
				>
					{isChecked && (
						<svg viewBox="0 0 16 16" fill="white" className="h-full w-full">
							<path d="M13.485 4.515a.75.75 0 0 0-1.06-1.06L6.5 9.379 3.575 6.455a.75.75 0 1 0-1.06 1.06l3.485 3.486a.75.75 0 0 0 1.061 0z" />
						</svg>
					)}
				</span>

				<PriorityDot priority={priority} />

				{/* Avatar */}
				<div
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
						isFirstInList ? "bg-[#d6cdb1]/50" : "bg-[#f3f3f3]",
					)}
				>
					{initials}
				</div>

				{/* Content */}
				<div className="flex min-w-0 flex-1 items-baseline gap-3 truncate">
					<span className="shrink-0 text-sm font-bold text-[#0a0a0a]">
						{row.customerName ?? "Unknown"}
					</span>
					<span className="truncate text-xs text-muted-foreground">
						{row.serviceName ?? "—"}
					</span>
					{row.preferredTrainerName && (
						<span className="ml-auto shrink-0 rounded-full bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
							Trainer requested: {row.preferredTrainerName}
						</span>
					)}
					{isOverdue && (
						<span className="ml-auto shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
							{formatOverdue(row.createdAt)}
						</span>
					)}
				</div>

				<div className="shrink-0 font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
					{formatPrice(row.totalPrice)}
				</div>
				<div className="w-16 shrink-0 text-right text-[10px] text-muted-foreground">
					{formatAge(row.createdAt)}
				</div>
				<ChevronDown
					size={14}
					className={cn(
						"shrink-0 text-muted-foreground transition-transform duration-150",
						isExpanded && "rotate-180",
					)}
				/>
			</button>

			{/* Expanded detail */}
			{isExpanded && (
				<ExpandedRowDetail
					row={row}
					isAdmin={isAdmin}
					isTrainer={isTrainer}
					callerMemberId={callerMemberId}
					organizationId={organizationId}
					onAssigned={onAssigned}
					onReject={onReject}
				/>
			)}
		</div>
	);
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ label }: { label: string }) {
	return (
		<div className="border-b border-[#e5e5e5] bg-[#f3f3f3]/60 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
			{label}
		</div>
	);
}

// ── Inbox list ────────────────────────────────────────────────────────────────

function InboxList({
	filtered,
	expandedId,
	checkedIds,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	onToggle,
	onCheck,
	onAssigned,
	onReject,
}: {
	filtered: PendingRow[];
	expandedId: string | null;
	checkedIds: Set<string>;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	onToggle: (id: string) => void;
	onCheck: (id: string) => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
}) {
	const groups: Array<{
		key: DateGroup;
		label: string;
		rows: PendingRow[];
	}> = [
		{
			key: "today",
			label: "Today",
			rows: filtered.filter((r) => getDateGroup(r) === "today"),
		},
		{
			key: "yesterday",
			label: "Yesterday",
			rows: filtered.filter((r) => getDateGroup(r) === "yesterday"),
		},
		{
			key: "earlier",
			label: "Earlier",
			rows: filtered.filter((r) => getDateGroup(r) === "earlier"),
		},
		{
			key: "older",
			label: "Older than 3 days · past SLA",
			rows: filtered.filter((r) => getDateGroup(r) === "older"),
		},
	];

	return (
		<div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			{groups
				.filter((g) => g.rows.length > 0)
				.map((group) =>
					group.rows.map((row, idx) => (
						<div key={row.id}>
							{/* Group header only on first row of that group */}
							{idx === 0 && <GroupHeader label={group.label} />}
							<InboxRow
								row={row}
								isExpanded={expandedId === row.id}
								isChecked={checkedIds.has(row.id)}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								isFirstInList={filtered.indexOf(row) === 0}
								onToggle={() => onToggle(row.id)}
								onCheck={() => onCheck(row.id)}
								onAssigned={onAssigned}
								onReject={onReject}
							/>
						</div>
					)),
				)}
		</div>
	);
}

// ── Bulk Approve dialog ──────────────────────────────────────────────────────

function BulkApproveDialog({
	open,
	onOpenChange,
	organizationId,
	selectedRows,
	onDone,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	organizationId: string;
	selectedRows: PendingRow[];
	onDone: () => void;
}) {
	const [trainerMemberId, setTrainerMemberId] = useState<string | null>(null);

	const { data: members = [], isLoading: loadingTrainers } = useQuery({
		queryKey: ["members", organizationId, "bulk-trainer-list"],
		queryFn: () => client.members.list({ organizationId }),
		enabled: open,
	});

	const trainers = useMemo(
		() =>
			(members as Array<{
				role: string;
				status: string;
				id: string;
				userId: string;
				name: string;
			}>).filter(
				(m) => (m.role === "trainer" || m.role === "admin") && m.status === "active",
			),
		[members],
	);

	const mutation = useApiMutation({
		mutationFn: () => {
			if (!trainerMemberId) throw new Error("Pick a trainer first");
			return client.packageInstances.bulkApprove({
				organizationId,
				packageInstanceIds: selectedRows.map((r) => r.id),
				trainerMemberId,
			});
		},
		successMessage: (res: { succeededCount: number; failedCount: number }) =>
			res.failedCount === 0
				? `Approved ${res.succeededCount} package${res.succeededCount === 1 ? "" : "s"}.`
				: `Approved ${res.succeededCount}, ${res.failedCount} failed.`,
		errorMessage: (err) => err?.message ?? "Bulk approval failed.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onDone();
			onOpenChange(false);
			setTrainerMemberId(null);
		},
	});

	const totalValueCents = selectedRows.reduce(
		(s, r) => s + (r.totalPrice ?? 0),
		0,
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>Bulk approve {selectedRows.length} packages</DialogTitle>
					<DialogDescription>
						Assign one trainer to all selected packages. Rows whose branch
						doesn&apos;t match the trainer will be skipped — you&apos;ll see a
						count after.
					</DialogDescription>
				</DialogHeader>

				<div className="mb-3 rounded-lg border border-[#e5e5e5] bg-[#f3f3f3]/50 p-3 text-xs">
					<div>
						<b className="font-mono tabular-nums">{selectedRows.length}</b>{" "}
						packages selected ·{" "}
						<b className="font-mono tabular-nums">
							{formatPriceShort(totalValueCents)}
						</b>{" "}
						total value
					</div>
				</div>

				<div className="space-y-2">
					<Label htmlFor="bulk-trainer">Trainer to assign</Label>
					<Select
						value={trainerMemberId ?? undefined}
						onValueChange={(v) => setTrainerMemberId(v)}
					>
						<SelectTrigger id="bulk-trainer">
							<SelectValue
								placeholder={loadingTrainers ? "Loading…" : "Pick a trainer…"}
							/>
						</SelectTrigger>
						<SelectContent>
							{trainers.map((t) => (
								<SelectItem key={t.id} value={t.id}>
									{t.name}{" "}
									<span className="text-muted-foreground">({t.role})</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => mutation.mutate()}
						disabled={!trainerMemberId || mutation.isPending}
					>
						{mutation.isPending
							? "Approving…"
							: `Approve ${selectedRows.length}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ── Bulk Reject dialog ───────────────────────────────────────────────────────

function BulkRejectDialog({
	open,
	onOpenChange,
	organizationId,
	selectedRows,
	onDone,
}: {
	open: boolean;
	onOpenChange: (o: boolean) => void;
	organizationId: string;
	selectedRows: PendingRow[];
	onDone: () => void;
}) {
	const [reason, setReason] = useState("");

	const mutation = useApiMutation({
		mutationFn: () =>
			client.packageInstances.bulkReject({
				organizationId,
				packageInstanceIds: selectedRows.map((r) => r.id),
				reason: reason.trim() || undefined,
			}),
		successMessage: (res: { succeededCount: number; failedCount: number }) =>
			res.failedCount === 0
				? `Rejected ${res.succeededCount} package${res.succeededCount === 1 ? "" : "s"}.`
				: `Rejected ${res.succeededCount}, ${res.failedCount} failed.`,
		errorMessage: (err) => err?.message ?? "Bulk rejection failed.",
		invalidate: [["packageInstances"], ["notifications"]],
		onSuccess: () => {
			onDone();
			onOpenChange(false);
			setReason("");
		},
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<DialogTitle>
						Reject {selectedRows.length} package{selectedRows.length === 1 ? "" : "s"}
					</DialogTitle>
					<DialogDescription>
						The customers will be notified. This cannot be undone — affected
						packages move to <b>cancelled</b> status.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<Label htmlFor="bulk-reject-reason">Reason (optional)</Label>
					<Textarea
						id="bulk-reject-reason"
						placeholder="e.g. duplicate purchase, customer requested cancellation…"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						maxLength={500}
						rows={3}
					/>
					<div className="text-[11px] text-muted-foreground">
						{reason.length}/500
					</div>
				</div>

				<DialogFooter className="mt-4">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={mutation.isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
					>
						{mutation.isPending
							? "Rejecting…"
							: `Reject ${selectedRows.length}`}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ── CSV export ───────────────────────────────────────────────────────────────

function downloadCsv(rows: PendingRow[]) {
	const headers = [
		"id",
		"customer_name",
		"customer_email",
		"service_name",
		"total_price_rm",
		"credits_total",
		"payment_method",
		"payment_status",
		"preferred_trainer",
		"created_at",
	];
	const escape = (v: unknown): string => {
		if (v == null) return "";
		const s = String(v);
		// CSV escape: wrap in quotes if contains comma, quote, or newline
		if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	};
	const lines = [
		headers.join(","),
		...rows.map((r) =>
			[
				r.id,
				r.customerName,
				r.customerEmail,
				r.serviceName,
				r.totalPrice == null ? "" : (r.totalPrice / 100).toFixed(2),
				r.creditsTotal,
				r.paymentMethod,
				r.paymentStatus,
				r.preferredTrainerName,
				new Date(r.createdAt).toISOString(),
			]
				.map(escape)
				.join(","),
		),
	];
	const blob = new Blob([lines.join("\n")], {
		type: "text/csv;charset=utf-8;",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	const ts = new Date().toISOString().slice(0, 10);
	a.download = `pending-approvals-${ts}.csv`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ApprovalsPage() {
	const { data: userContext } = useUserContext();
	const organizationId = userContext?.currentOrganizationId ?? null;
	const navigate = Route.useNavigate();
	const { scope } = Route.useSearch();

	const currentOrg = userContext?.organizations.find(
		(o) => o.id === organizationId,
	);
	const orgName = currentOrg?.name ?? "Your Organisation";
	const callerRole = currentOrg?.hierarchy?.member?.role ?? null;
	type MemberWithId = NonNullable<typeof currentOrg>["hierarchy"]["member"] & {
		id?: string;
	};
	const callerMemberId =
		(currentOrg?.hierarchy?.member as MemberWithId | null | undefined)?.id ??
		null;

	const isAdmin = callerRole === "admin";
	const isTrainer = callerRole === "trainer";

	const setScope = (s: "all" | "assignable_to_me") => {
		navigate({ search: (prev) => ({ ...prev, scope: s }), replace: true });
	};

	const {
		data: rows,
		isLoading,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["packageInstances", "listPending", organizationId, scope],
		queryFn: () =>
			client.packageInstances.listPending({
				organizationId: organizationId!,
				scope,
				limit: 100,
			}),
		enabled: !!organizationId && (isAdmin || isTrainer),
	});

	// Dialog state
	const [rejectPkg, setRejectPkg] = useState<PendingRow | null>(null);
	const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
	const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

	// Inbox UI state
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState("");
	const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>(
		"all",
	);

	const list = useMemo(() => (rows ?? []) as PendingRow[], [rows]);

	const filtered = useMemo(() => {
		let result = list;
		if (search.trim()) {
			const q = search.toLowerCase();
			result = result.filter(
				(r) =>
					(r.customerName ?? "").toLowerCase().includes(q) ||
					(r.serviceName ?? "").toLowerCase().includes(q) ||
					(r.customerEmail ?? "").toLowerCase().includes(q),
			);
		}
		if (priorityFilter !== "all") {
			result = result.filter((r) => getPriority(r) === priorityFilter);
		}
		return result;
	}, [list, search, priorityFilter]);

	const priorityCounts = useMemo(
		() => ({
			all: list.length,
			high: list.filter((r) => getPriority(r) === "high").length,
			med: list.filter((r) => getPriority(r) === "med").length,
			low: list.filter((r) => getPriority(r) === "low").length,
		}),
		[list],
	);

	const allChecked =
		filtered.length > 0 && filtered.every((r) => checkedIds.has(r.id));

	function toggleAll() {
		if (allChecked) {
			setCheckedIds(new Set());
		} else {
			setCheckedIds(new Set(filtered.map((r) => r.id)));
		}
	}

	function toggleCheck(id: string) {
		setCheckedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function handleReject(row: PendingRow) {
		setRejectPkg(row);
	}

	// Bulk approve: no bulk mutation exists in the file; stubbed visually in BulkActionBar.
	// The "Approve all visible" hero CTA selects all visible rows (surfacing the bulk bar).
	function handleApproveAllVisible() {
		setCheckedIds(new Set(filtered.map((r) => r.id)));
	}

	if (!organizationId) {
		return <PageLoader label="Loading organization…" />;
	}
	if (!isAdmin && !isTrainer) {
		return (
			<div className="p-6">
				<StatusCallout
					variant="error"
					message="You don't have permission to view approvals."
				/>
			</div>
		);
	}

	return (
		<div className="-m-6 flex min-h-screen flex-col bg-[#f3f3f3]">
			{/* ░░ TOP APP BAR ░░ */}
			<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center border-b border-[#e5e5e5] bg-white px-7">
				<div className="flex items-center gap-3 text-sm">
					<span className="text-muted-foreground">Operations</span>
					<span className="text-[#a3a3a3]">/</span>
					<span className="font-semibold">Approvals</span>
				</div>
				<div className="ml-auto flex items-center gap-2">
					<button
						type="button"
						onClick={() => refetch()}
						className="rounded-lg p-2 text-muted-foreground transition hover:bg-[#f3f3f3] hover:text-foreground"
						title="Refresh"
					>
						<RefreshCw className="size-4" />
					</button>
				</div>
			</header>

			<div className="px-7 py-8">
				{/* Error banner */}
				{isError && (
					<div className="mb-6">
						<StatusCallout
							variant="error"
							message="Failed to load pending packages."
						/>
					</div>
				)}

				{isLoading ? (
					<PageLoader label="Loading…" />
				) : list.length === 0 ? (
					<div className="flex min-h-[60vh] items-center justify-center">
						<EmptyState
							icon={RefreshCw}
							title="All caught up"
							description="No packages waiting for trainer assignment."
						/>
					</div>
				) : (
					<>
						{/* Hero */}
						<HeroStats
							list={list}
							orgName={orgName}
							filteredCount={filtered.length}
							onApproveAll={handleApproveAllVisible}
							onExport={() => downloadCsv(filtered)}
						/>

						{/* Filter bar */}
						<FilterBar
							search={search}
							onSearch={setSearch}
							priorityFilter={priorityFilter}
							onPriority={setPriorityFilter}
							scope={scope}
							onScope={setScope}
							counts={priorityCounts}
						/>

						{/* Bulk-action bar — appears only when rows are selected */}
						<BulkActionBar
							checkedIds={checkedIds}
							list={list}
							isAdmin={isAdmin}
							onApprove={() => setBulkApproveOpen(true)}
							onReject={() => setBulkRejectOpen(true)}
							onClear={() => setCheckedIds(new Set())}
						/>

						{/* Inbox list */}
						{filtered.length === 0 ? (
							<div className="mt-4 rounded-2xl border border-[#e5e5e5] bg-white px-5 py-10 text-center text-sm text-muted-foreground">
								No results match your search.
							</div>
						) : (
							<InboxList
								filtered={filtered}
								expandedId={expandedId}
								checkedIds={checkedIds}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								onToggle={(id) =>
									setExpandedId(expandedId === id ? null : id)
								}
								onCheck={toggleCheck}
								onAssigned={() => refetch()}
								onReject={handleReject}
							/>
						)}

						{/* Footer count */}
						<div className="mt-3 text-center text-xs text-muted-foreground">
							Showing {filtered.length} of {list.length}
						</div>
					</>
				)}
			</div>

			{/* Dialogs */}
			<RejectPackageDialog
				open={!!rejectPkg}
				onOpenChange={(o) => {
					if (!o) setRejectPkg(null);
				}}
				organizationId={organizationId}
				packageInstanceId={rejectPkg?.id ?? null}
				customerName={rejectPkg?.customerName ?? null}
				serviceName={rejectPkg?.serviceName ?? null}
				onRejected={() => refetch()}
			/>

			<BulkApproveDialog
				open={bulkApproveOpen}
				onOpenChange={setBulkApproveOpen}
				organizationId={organizationId}
				selectedRows={list.filter((r) => checkedIds.has(r.id))}
				onDone={() => {
					setCheckedIds(new Set());
					refetch();
				}}
			/>

			<BulkRejectDialog
				open={bulkRejectOpen}
				onOpenChange={setBulkRejectOpen}
				organizationId={organizationId}
				selectedRows={list.filter((r) => checkedIds.has(r.id))}
				onDone={() => {
					setCheckedIds(new Set());
					refetch();
				}}
			/>
		</div>
	);
}

export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/operations/approvals",
)({
	beforeLoad: async () => {
		await requireRole(["admin", "trainer"]);
	},
	validateSearch: (search: Record<string, unknown>) => ({
		scope: (
			search.scope === "assignable_to_me" ? "assignable_to_me" : "all"
		) as "all" | "assignable_to_me",
	}),
	component: ApprovalsPage,
});
