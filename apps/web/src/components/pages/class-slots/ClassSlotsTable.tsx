import { CalendarDays, MoreHorizontal, Search, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageLoader } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/money";
import { FillBar } from "./fill-bar";
import { SlotStatusBadge } from "./slot-status-badge";
import { durationMinutes, deriveStatus, slotDayLabel } from "./helpers";
import type { ClassSlotRow } from "./types";

type StatusFilter = "all" | "open" | "full" | "waitlist";

interface ClassSlotsTableProps {
	classSlots: ClassSlotRow[];
	filteredSlots: ClassSlotRow[];
	isLoading: boolean;
	isError: boolean;
	statusFilter: StatusFilter;
	setStatusFilter: (filter: StatusFilter) => void;
	onRetry: () => void;
	onOpenCreate: () => void;
	onOpenEdit: (slot: ClassSlotRow) => void;
	onOpenCancel: (slot: ClassSlotRow) => void;
	onViewSignups: (slot: ClassSlotRow) => void;
	serviceNameById: (id: string) => string;
	memberNameById: (id: string | null) => string | null;
}

export function ClassSlotsTable({
	classSlots,
	filteredSlots,
	isLoading,
	isError,
	statusFilter,
	setStatusFilter,
	onRetry,
	onOpenCreate,
	onOpenEdit,
	onOpenCancel,
	onViewSignups,
	serviceNameById,
	memberNameById,
}: ClassSlotsTableProps) {
	return (
		<div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			{/* Table toolbar */}
			<div className="flex items-center justify-between border-b border-[#e5e5e5] bg-[#f3f3f3] px-5 py-3">
				<span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
					All Class Slots
				</span>
				{/* Status filter pills */}
				<div className="flex items-center gap-1 rounded-lg border border-[#e5e5e5] bg-white p-1">
					{(["all", "open", "waitlist", "full"] as const).map((f) => (
						<button
							key={f}
							type="button"
							onClick={() => setStatusFilter(f)}
							className={cn(
								"rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition",
								statusFilter === f
									? "bg-[#0a0a0a] text-white"
									: "text-[#737373] hover:text-[#0a0a0a]",
							)}
						>
							{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
						</button>
					))}
				</div>
			</div>

			{/* Scrollable table body */}
			<div className="overflow-y-auto h-[calc(100%-49px)]">
				{isError ? (
					<div className="p-6">
						<StatusCallout
							variant="error"
							title="Couldn't load class slots"
							onRetry={onRetry}
						/>
					</div>
				) : isLoading ? (
					<PageLoader />
				) : classSlots.length === 0 ? (
					<EmptyState
						icon={CalendarDays}
						title="No class slots scheduled"
						description="Create your first class slot to start scheduling group sessions."
						action={{
							label: "Add Slot",
							onClick: onOpenCreate,
						}}
					/>
				) : filteredSlots.length === 0 ? (
					<EmptyState
						icon={Search}
						title="No slots match your filters"
						description="Try a different search term or status filter."
					/>
				) : (
					<table className="w-full text-sm">
						<thead className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-[#f3f3f3]/80 backdrop-blur-sm">
							<tr>
								<th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Class
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Day / Time
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Instructor
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Studio
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Duration
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373] w-36">
									Fill Rate
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Capacity
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Waitlist
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Revenue
								</th>
								<th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">
									Status
								</th>
								<th className="px-4 py-2.5 w-10" />
							</tr>
						</thead>
						<tbody className="divide-y divide-[#e5e5e5]">
							{filteredSlots.map((slot) => {
								const status = deriveStatus(slot);
								const isFull = status === "full";
								const isCancelled = status === "cancelled";
								const dur = durationMinutes(slot.startTime, slot.endTime);
								const instrName = memberNameById(slot.instructorId);
								const dayLabel = slotDayLabel(slot.date);

								return (
									<tr
										key={slot.id}
										className={cn(
											"transition-colors",
											isFull && !isCancelled
												? "bg-[#fffbf0] hover:bg-[#fff7e6]"
												: isCancelled
													? "opacity-60 hover:bg-[#f3f3f3]"
													: "hover:bg-[#f3f3f3]/60",
										)}
									>
										{/* Class name */}
										<td className="px-5 py-3 font-semibold text-[#0a0a0a]">
											{serviceNameById(slot.serviceId)}
										</td>

										{/* Day / Time */}
										<td className="px-4 py-3 font-medium text-[#0a0a0a]">
											{dayLabel} · {slot.startTime}
										</td>

										{/* Instructor */}
										<td className="px-4 py-3 text-[#737373]">
											{instrName ?? <span className="text-[#a3a3a3]">—</span>}
										</td>

										{/* Studio / Location */}
										<td className="px-4 py-3 text-[#737373]">
											{slot.location ?? (
												<span className="text-[#a3a3a3]">—</span>
											)}
										</td>

										{/* Duration */}
										<td className="px-4 py-3 font-mono tabular-nums text-xs text-[#737373]">
											{dur > 0 ? `${dur} min` : "—"}
										</td>

										{/* Fill rate bar */}
										<td className="px-4 py-3">
											{isCancelled ? (
												<span className="text-xs text-[#a3a3a3]">—</span>
											) : (
												<FillBar
													booked={slot.spotsBooked}
													capacity={slot.capacity}
												/>
											)}
										</td>

										{/* Capacity fraction */}
										<td
											className={cn(
												"px-4 py-3 font-mono tabular-nums font-semibold",
												isFull && !isCancelled
													? "text-red-600"
													: "text-[#0a0a0a]",
											)}
										>
											{slot.spotsBooked} / {slot.capacity}
										</td>

										{/* Waitlist count */}
										<td className="px-4 py-3 font-mono tabular-nums text-[#737373]">
											{isCancelled ? (
												<span className="text-[#a3a3a3]">—</span>
											) : slot.waitlistCount > 0 ? (
												<span className="font-semibold text-amber-600">
													{slot.waitlistCount}
												</span>
											) : (
												0
											)}
										</td>

										{/* Projected revenue: pricePerSpotCents × spotsBooked */}
										<td className="px-4 py-3 font-mono tabular-nums text-[#737373]">
											{isCancelled ? (
												<span className="text-[#a3a3a3]">—</span>
											) : (
												formatPrice(slot.pricePerSpotCents * slot.spotsBooked)
											)}
										</td>

										{/* Status badge */}
										<td className="px-4 py-3">
											<SlotStatusBadge status={status} />
										</td>

										{/* Actions */}
										<td className="px-4 py-3 text-right">
											{isFull && !isCancelled ? (
												// Full slot: Waitlist button replaces normal Manage
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<button
															type="button"
															className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
														>
															Waitlist ▾
														</button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() => onViewSignups(slot)}
														>
															<Users className="mr-2 h-3.5 w-3.5" />
															View Signups
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => onOpenEdit(slot)}>
															Edit
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => onOpenCancel(slot)}
															className="text-destructive focus:text-destructive"
														>
															Cancel Class
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											) : (
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="sm"
															className="h-7 w-7 p-0"
														>
															<MoreHorizontal className="h-3.5 w-3.5" />
															<span className="sr-only">Open menu</span>
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() => onViewSignups(slot)}
														>
															<Users className="mr-2 h-3.5 w-3.5" />
															View Signups
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => onOpenEdit(slot)}
															disabled={isCancelled}
														>
															Edit
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => onOpenCancel(slot)}
															disabled={isCancelled}
															className="text-destructive focus:text-destructive"
														>
															Cancel Class
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
