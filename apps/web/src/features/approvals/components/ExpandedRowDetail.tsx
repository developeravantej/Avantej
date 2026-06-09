import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useApiMutation } from "@/hooks/useApiMutation";
import { cn } from "@/lib/utils";
import { client, orpc } from "@/utils/orpc";
import {
	formatDate,
	formatPreferredTime,
	formatPrice,
} from "../approvals.helpers";
import type {
	ApprovalStatus,
	PendingRow,
	TrainerMember,
} from "../approvals.types";
import { ConfirmPaymentDialog } from "./ConfirmPaymentDialog";
import { TrainerAvatar } from "./TrainerAvatar";

/**
 * Shows how many of the package's preferred times the given trainer can cover.
 * One bounded query (≤ 4 preferred times). Rendered for the selected trainer in
 * the assign popover and for the caller in the self-assign path — deliberately
 * not per-trainer-row to avoid N concurrent queries on popover open.
 */
function CoverageChip({
	organizationId,
	trainerId,
	packageInstanceId,
	enabled,
}: {
	organizationId: string;
	trainerId: string | null;
	packageInstanceId: string;
	enabled: boolean;
}) {
	const { data } = useQuery({
		...orpc.trainerAvailability.coverageForPreferredTimes.queryOptions({
			input: {
				organizationId,
				trainerId: trainerId ?? "",
				packageInstanceId,
			},
		}),
		enabled: enabled && !!trainerId,
		staleTime: 60_000,
	});
	if (!data || data.totalCount === 0) return null;
	const full = data.coveredCount === data.totalCount;
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
				full
					? "bg-emerald-100 text-emerald-700"
					: data.coveredCount === 0
						? "bg-rose-100 text-rose-700"
						: "bg-amber-100 text-amber-700",
			)}
			title="Preferred times this trainer is available for"
		>
			<CalendarClock className="size-2.5" />
			Covers {data.coveredCount}/{data.totalCount}
		</span>
	);
}

export function ExpandedRowDetail({
	row,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	approvalStatus,
	onAssigned,
	onReject,
	onSchedule,
}: {
	row: PendingRow;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	approvalStatus: ApprovalStatus;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
	/** Open the page-level schedule panel for this package. Lifted to the page so
	 *  it survives the row leaving the pending list after assignment. */
	onSchedule: (packageInstanceId: string) => void;
}) {
	const [popoverOpen, setPopoverOpen] = useState(false);
	const [selectedTrainerId, setSelectedTrainerId] = useState("");
	const [confirmPayOpen, setConfirmPayOpen] = useState(false);

	const { data: members = [], isLoading: loadingTrainers } = useQuery({
		...orpc.members.list.queryOptions({ input: { organizationId } }),
		enabled: popoverOpen && isAdmin,
	});

	const trainers = useMemo(
		() =>
			(members as TrainerMember[])
				.filter(
					(m) =>
						(m.role === "trainer" || m.role === "admin") &&
						m.status === "active",
				)
				.sort((a, b) => {
					const aPreferred = a.id === row.preferredTrainerId ? -1 : 0;
					const bPreferred = b.id === row.preferredTrainerId ? -1 : 0;
					return aPreferred - bPreferred;
				}),
		[members, row.preferredTrainerId],
	);

	const selectedTrainerName = trainers.find(
		(t) => t.id === selectedTrainerId,
	)?.name;

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
		invalidate: [orpc.packageInstances.key(), orpc.notifications.list.key()],
		onSuccess: () => {
			setPopoverOpen(false);
			setSelectedTrainerId("");
			// Journey A step 4–5: package is now active — go straight to scheduling.
			// onSchedule first: this row leaves the pending list on refetch, so the
			// panel must live at the page level to survive the unmount.
			onSchedule(row.id);
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
		invalidate: [orpc.packageInstances.key(), orpc.notifications.list.key()],
		// Journey B step 3: land on the same scheduling step after self-assign.
		onSuccess: () => {
			onSchedule(row.id);
			onAssigned();
		},
	});

	return (
		<div className="border-t border-[#e5e5e5] bg-white px-5 py-5">
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
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

				{/* Preferred times */}
				<div>
					<div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
						Preferred times
					</div>
					{row.preferredTimes.length > 0 ? (
						<ol className="mt-1.5 space-y-0.5">
							{row.preferredTimes.map((t) => (
								<li
									key={t.priority}
									className="flex items-center gap-1.5 text-xs"
								>
									<span className="font-mono tabular-nums text-[10px] text-muted-foreground">
										{t.priority}.
									</span>
									<span className="font-medium text-[#0a0a0a]">
										{formatPreferredTime(t)}
									</span>
								</li>
							))}
						</ol>
					) : (
						<div className="mt-1.5 text-sm italic text-muted-foreground">
							No preference
						</div>
					)}
				</div>
			</div>

			{/* Action row */}
			<div className="mt-5 flex items-center gap-2">
				{/* Awaiting-payment stage — method-aware:
				    - failed        → read-only "Payment failed" note (Reject only; no manual mark-paid)
				    - stripe/online → read-only "Processing" (auto-confirms via webhook; no button)
				    - offline       → "Confirm payment received" (admin) */}
				{approvalStatus === "awaiting_payment" &&
					(row.paymentStatus === "failed" ? (
						<span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
							Payment failed — resolve or reject
						</span>
					) : row.paymentMethod === "stripe" ? (
						<span
							className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700"
							title="Online payments confirm automatically once the gateway clears."
						>
							<span className="relative flex size-1.5">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-500 opacity-60" />
								<span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
							</span>
							Processing online payment…
						</span>
					) : isAdmin ? (
						<button
							type="button"
							onClick={() => setConfirmPayOpen(true)}
							className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626]"
						>
							Confirm payment received
						</button>
					) : null)}

				{isAdmin && approvalStatus !== "awaiting_payment" && (
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
								{approvalStatus === "pending"
									? "Approve & assign"
									: "Re-assign"}
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
													isSelected ? "bg-[#0a0a0a]" : "hover:bg-[#f5f5f5]",
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
							<div className="space-y-2 border-t border-[#f0f0f0] p-3">
								{selectedTrainerId && row.preferredTimes.length > 0 && (
									<div className="flex justify-center">
										<CoverageChip
											organizationId={organizationId}
											trainerId={selectedTrainerId}
											packageInstanceId={row.id}
											enabled={popoverOpen}
										/>
									</div>
								)}
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

				{isTrainer && approvalStatus !== "awaiting_payment" && (
					<div className="flex items-center gap-2">
						<button
							type="button"
							disabled={!callerMemberId || selfAssignMutation.isPending}
							onClick={() => selfAssignMutation.mutate()}
							className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626] disabled:opacity-40"
						>
							{selfAssignMutation.isPending ? "Assigning…" : "Assign me"}
						</button>
						{row.preferredTimes.length > 0 && (
							<CoverageChip
								organizationId={organizationId}
								trainerId={callerMemberId}
								packageInstanceId={row.id}
								enabled={isTrainer}
							/>
						)}
					</div>
				)}

				{/* Already-approved rows: schedule the sessions for the active package. */}
				{approvalStatus === "approved" && (
					<button
						type="button"
						onClick={() => onSchedule(row.id)}
						className="inline-flex items-center gap-1.5 rounded-lg bg-[#0a0a0a] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#262626]"
					>
						<CalendarClock className="size-3.5" />
						Schedule sessions
					</button>
				)}

				{isAdmin &&
					(approvalStatus === "pending" ||
						approvalStatus === "awaiting_payment") && (
						<button
							type="button"
							onClick={() => onReject(row)}
							className="ml-auto rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
						>
							Reject…
						</button>
					)}
			</div>

			<ConfirmPaymentDialog
				open={confirmPayOpen}
				onOpenChange={setConfirmPayOpen}
				organizationId={organizationId}
				row={row}
				onConfirmed={onAssigned}
			/>
		</div>
	);
}
