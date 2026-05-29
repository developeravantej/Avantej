import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useApiMutation } from "@/hooks/useApiMutation";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";
import {
	formatDate,
	formatPreferredTime,
	formatPrice,
} from "../approvals.helpers";
import type { PendingRow, TrainerMember } from "../approvals.types";
import { TrainerAvatar } from "./TrainerAvatar";

export function ExpandedRowDetail({
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
								<li key={t.priority} className="flex items-center gap-1.5 text-xs">
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
