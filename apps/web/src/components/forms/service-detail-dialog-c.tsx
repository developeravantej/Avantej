/**
 * Design C variant of ServiceDetailDialog — slide-out sheet from the right.
 * All logic is copied verbatim from service-detail-dialog.tsx; only the visual layout changes.
 * Tabs are replaced with stacked sections separated by dividers.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusCallout } from "@/components/ui/status-callout";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { client, orpc } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";

// ---------------------------------------------------------------------------
// Props (verbatim from service-detail-dialog.tsx)
// ---------------------------------------------------------------------------

interface ServiceDetailDialogProps {
	isOpen: boolean;
	onClose: () => void;
	serviceId: string | null;
	organizationId: string | null;
	onEdit?: (serviceId: string) => void;
	onDelete?: (serviceId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers (verbatim from service-detail-dialog.tsx)
// ---------------------------------------------------------------------------

function formatDate(date: Date | string | null | undefined): string {
	if (!date) return "N/A";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "N/A";
	}
}

function formatDuration(duration: number, unit?: string | null): string {
	if (unit === "hours") return `${duration} hour(s)`;
	if (unit === "minutes") return `${duration} minute(s)`;
	return `${duration} second(s)`;
}

// ---------------------------------------------------------------------------
// Design-C presentational helpers
// ---------------------------------------------------------------------------

/** A horizontal key-value row with a light bottom border */
function FieldRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex justify-between items-center py-2.5 border-b border-[#f3f3f3] last:border-0">
			<span className="text-[11px] font-bold uppercase tracking-widest text-[#737373]">
				{label}
			</span>
			<span className="text-[13px] text-[#0a0a0a] font-medium text-right max-w-[60%]">
				{children}
			</span>
		</div>
	);
}

/** A section divider with title */
function SectionDivider({ title }: { title: string }) {
	return (
		<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373] pb-2 mb-1 border-b border-[#e5e5e5]">
			{title}
		</p>
	);
}

// ---------------------------------------------------------------------------
// TrainersTab (verbatim logic from service-detail-dialog.tsx)
// ---------------------------------------------------------------------------

interface TrainersTabProps {
	serviceId: string;
	organizationId: string;
}

function TrainersSection({ serviceId, organizationId }: TrainersTabProps) {
	const queryClient = useQueryClient();

	const { data: assigned, isLoading: loadingAssigned } = useQuery(
		orpc.serviceMembers.listForService.queryOptions({
			organizationId,
			serviceId,
		})
	);

	const { data: allMembers, isLoading: loadingMembers } = useQuery(
		orpc.members.list.queryOptions({ organizationId })
	);

	const [selectedMemberId, setSelectedMemberId] = useState<string>("");

	const assignedIds = new Set((assigned ?? []).map((m) => m.memberId));

	const unassigned = (allMembers ?? []).filter(
		(m) => !assignedIds.has(m.id)
	);

	const assignMutation = useMutation({
		mutationFn: (memberId: string) =>
			client.serviceMembers.assign({ organizationId, serviceId, memberId }),
		onSuccess: () => {
			setSelectedMemberId("");
			queryClient.invalidateQueries({
				queryKey: orpc.serviceMembers.listForService.key({ organizationId, serviceId }),
			});
			toast.success("Trainer assigned");
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to assign trainer");
		},
	});

	const removeMutation = useMutation({
		mutationFn: (memberId: string) =>
			client.serviceMembers.remove({ organizationId, serviceId, memberId }),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: orpc.serviceMembers.listForService.key({ organizationId, serviceId }),
			});
			toast.success("Trainer removed");
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to remove trainer");
		},
	});

	if (loadingAssigned || loadingMembers) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="size-6 animate-spin text-[#a3a3a3]" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Assign row */}
			<div className="flex gap-2">
				<Select
					value={selectedMemberId}
					onValueChange={setSelectedMemberId}
					disabled={unassigned.length === 0}
				>
					<SelectTrigger className="flex-1">
						<SelectValue
							placeholder={
								unassigned.length === 0
									? "All members assigned"
									: "Select a trainer to assign…"
							}
						/>
					</SelectTrigger>
					<SelectContent>
						{unassigned.map((m) => (
							<SelectItem key={m.id} value={m.id}>
								{m.name ?? m.email ?? m.id}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					size="sm"
					disabled={!selectedMemberId || assignMutation.isPending}
					onClick={() => selectedMemberId && assignMutation.mutate(selectedMemberId)}
				>
					{assignMutation.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<UserPlus className="size-4" />
					)}
					<span className="ml-1">Assign</span>
				</Button>
			</div>

			{/* Assigned list */}
			{assigned && assigned.length === 0 ? (
				<p className="text-[13px] text-[#737373] italic py-4 text-center">
					No trainers assigned to this service.
				</p>
			) : (
				<ul className="space-y-2">
					{(assigned ?? []).map((m) => (
						<li
							key={m.memberId}
							className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
						>
							<span className="text-[13px] font-medium text-[#0a0a0a]">
								{m.displayName}
							</span>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-7 shrink-0"
								disabled={removeMutation.isPending}
								onClick={() => removeMutation.mutate(m.memberId)}
							>
								<X className="size-4" />
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ServiceDetailDialogC({
	isOpen,
	onClose,
	serviceId,
	organizationId,
	onEdit,
	onDelete,
}: ServiceDetailDialogProps) {
	const [service, setService] = useState<{
		id: string;
		name: string;
		categoryId: string | null;
		duration: number;
		durationUnitType: string | null;
		maxAttendees: number;
		price: number | null;
		schedulingType: string | null;
		isActive: boolean;
		description: string | null;
		type: string | null;
		taxable: boolean;
		taxPercentage: number;
		location: string | null;
		features: string[] | null;
		expirable: boolean;
		expiryDays: number | null;
		sessionCount: number | null;
		isRecommended: boolean;
		timePresetConfig: {
			recurringDays: string[];
			timeSlotsPerDay: Record<string, string[]>;
		} | null;
		createdAt: Date | string;
		updatedAt: Date | string;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// Verbatim fetch logic from service-detail-dialog.tsx
	useEffect(() => {
		if (isOpen && serviceId && organizationId) {
			const fetchService = async () => {
				setIsLoading(true);
				setError(null);
				try {
					const result = await client.services.getById({
						organizationId,
						id: serviceId,
					});
					setService(result);
				} catch (err: unknown) {
					const message =
						err instanceof Error ? err.message : "Failed to load service";
					setError(message);
					setService(null);
				} finally {
					setIsLoading(false);
				}
			};
			fetchService();
		} else {
			setService(null);
			setError(null);
		}
	}, [isOpen, serviceId, organizationId]);

	// Verbatim delete handler from service-detail-dialog.tsx
	async function handleDelete() {
		if (!serviceId || !onDelete) return;
		try {
			setIsDeleting(true);
			await onDelete(serviceId);
			setShowDeleteConfirm(false);
			onClose();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to deactivate service";
			toast.error(message);
		} finally {
			setIsDeleting(false);
		}
	}

	return (
		<Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
			<SheetContent
				side="right"
				className="w-full sm:max-w-[560px] overflow-y-auto flex flex-col p-0"
			>
				{/* ── Header ────────────────────────────────────────────────── */}
				<SheetHeader className="px-8 pt-8 pb-6 border-b border-[#e5e5e5] shrink-0">
					<SheetTitle className="text-[20px] font-extrabold tracking-tight text-[#0a0a0a]">
						{service ? service.name : "Service Details"}
					</SheetTitle>
					<p className="text-[13px] text-[#737373]">Personal Training</p>

					{service && (
						<div className="flex items-center gap-2 mt-3">
							{onEdit && (
								<button
									type="button"
									onClick={() => {
										onClose();
										onEdit(serviceId!);
									}}
									className="flex items-center gap-1.5 border border-[#e5e5e5] bg-white px-3 py-2 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3]"
								>
									<Pencil className="size-3.5" />
									Edit
								</button>
							)}
							{onDelete && (
								<button
									type="button"
									onClick={() => setShowDeleteConfirm(true)}
									className="flex items-center gap-1.5 border border-red-200 bg-red-50 px-3 py-2 rounded-[10px] text-[13px] font-medium text-red-600 hover:bg-red-100"
								>
									<Trash2 className="size-3.5" />
									Deactivate
								</button>
							)}
						</div>
					)}
				</SheetHeader>

				{/* ── Body ──────────────────────────────────────────────────── */}
				<div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-8 animate-spin text-[#a3a3a3]" />
							<span className="ml-3 text-[13px] text-[#737373]">Loading…</span>
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{service && !isLoading && (
						<>
							{/* OVERVIEW */}
							<SectionDivider title="Overview" />
							<div>
								<FieldRow label="Status">
									<StatusBadge status={service.isActive ? "active" : "inactive"} />
								</FieldRow>
								<FieldRow label="Type">
									<span className="capitalize">{service.type ?? "—"}</span>
								</FieldRow>
								{service.description && (
									<FieldRow label="Description">{service.description}</FieldRow>
								)}
								{service.isRecommended && (
									<FieldRow label="Recommended">
										<Badge variant="default">Yes</Badge>
									</FieldRow>
								)}
							</div>

							{/* SCHEDULING */}
							<SectionDivider title="Scheduling" />
							<div>
								<FieldRow label="Type">
									<Badge variant="outline">
										{service.schedulingType === "class_slot"
											? "Class slot"
											: "Appointment"}
									</Badge>
								</FieldRow>
								<FieldRow label="Duration">
									{formatDuration(service.duration, service.durationUnitType)}
								</FieldRow>
								<FieldRow label="Max Attendees">{service.maxAttendees}</FieldRow>
							</div>

							{service.schedulingType === "class_slot" && service.timePresetConfig && (
								<>
									<SectionDivider title="Time-Preset Schedule" />
									{service.timePresetConfig.recurringDays.length > 0 ? (
										<div className="space-y-3">
											<div className="flex flex-wrap gap-1">
												{service.timePresetConfig.recurringDays.map((day) => (
													<Badge key={day} variant="outline">
														{day}
													</Badge>
												))}
											</div>
											<div className="space-y-2">
												{service.timePresetConfig.recurringDays.map((day) => {
													const slots =
														service.timePresetConfig?.timeSlotsPerDay[day] ?? [];
													return (
														<div
															key={day}
															className="flex flex-wrap items-center gap-2"
														>
															<span className="text-[11px] font-bold uppercase tracking-widest text-[#737373] w-20 shrink-0">
																{day}
															</span>
															{slots.length > 0 ? (
																slots.map((time, i) => (
																	<Badge key={i} variant="secondary">
																		{time}
																	</Badge>
																))
															) : (
																<span className="text-[13px] text-[#737373] italic">
																	No slots
																</span>
															)}
														</div>
													);
												})}
											</div>
										</div>
									) : (
										<p className="text-[13px] text-[#737373] italic">
											No recurring schedule configured.
										</p>
									)}
								</>
							)}

							{/* PRICING & SESSIONS */}
							<SectionDivider title="Pricing & Sessions" />
							<div>
								<FieldRow label="Price">
									{service.price != null
										? formatPrice(service.price, "MYR")
										: "—"}
								</FieldRow>
								<FieldRow label="Taxable">
									{service.taxable ? `Yes (${service.taxPercentage}%)` : "No"}
								</FieldRow>
								<FieldRow label="Sessions">{service.sessionCount ?? "—"}</FieldRow>
								{service.expirable && (
									<FieldRow label="Expiry">
										{service.expiryDays ? `${service.expiryDays} days` : "—"}
									</FieldRow>
								)}
							</div>

							{/* Optional details */}
							{(service.location ||
								(service.features && service.features.length > 0)) && (
								<>
									<SectionDivider title="Details" />
									<div>
										{service.location && (
											<FieldRow label="Location">{service.location}</FieldRow>
										)}
										{service.features && service.features.length > 0 && (
											<FieldRow label="Features">
												<div className="flex flex-wrap gap-1 justify-end">
													{service.features.map((f, i) => (
														<Badge key={i} variant="secondary">
															{f}
														</Badge>
													))}
												</div>
											</FieldRow>
										)}
									</div>
								</>
							)}

							{/* TRAINERS */}
							{organizationId && serviceId && (
								<>
									<SectionDivider title="Trainers" />
									<TrainersSection
										serviceId={serviceId}
										organizationId={organizationId}
									/>
								</>
							)}

							{/* META */}
							<SectionDivider title="Meta" />
							<div>
								<FieldRow label="Created">{formatDate(service.createdAt)}</FieldRow>
								<FieldRow label="Updated">{formatDate(service.updatedAt)}</FieldRow>
							</div>
						</>
					)}
				</div>

				{/* ── Footer ────────────────────────────────────────────────── */}
				<div className="px-8 py-5 border-t border-[#e5e5e5] flex items-center justify-end gap-3 shrink-0">
					<button
						type="button"
						onClick={onClose}
						className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3]"
					>
						Close
					</button>
				</div>

				{/* ── Deactivate confirm panel (bottom-anchored within sheet) ── */}
				{showDeleteConfirm && (
					<div className="fixed bottom-0 right-0 w-[560px] border-t border-[#e5e5e5] bg-white p-6 z-50 shadow-lg">
						<p className="text-[15px] font-bold text-[#0a0a0a] mb-1">
							Deactivate &quot;{service?.name}&quot;?
						</p>
						<p className="text-[13px] text-[#737373] mb-4">
							It will be hidden from active lists. You can reactivate later.
						</p>
						<div className="flex items-center gap-3 justify-end">
							<button
								onClick={() => setShowDeleteConfirm(false)}
								className="border border-[#e5e5e5] bg-white px-4 py-2 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3]"
							>
								Cancel
							</button>
							<button
								onClick={handleDelete}
								disabled={isDeleting}
								className="bg-red-600 text-white px-4 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
							>
								{isDeleting && <Loader2 className="size-4 animate-spin" />}
								{isDeleting ? "Deactivating…" : "Deactivate"}
							</button>
						</div>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
