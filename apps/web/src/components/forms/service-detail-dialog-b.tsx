/**
 * Design B — Step Wizard (vertical nav) variant of ServiceDetailDialog.
 * Visual layout only — all logic copied verbatim from service-detail-dialog.tsx.
 * Source: apps/web/src/components/forms/service-detail-dialog.tsx
 *
 * Deactivate confirm is an inline panel replacing the right content (no sibling Dialog).
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, UserPlus, X } from "lucide-react";
import {
	Dialog,
	DialogContent,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatusCallout } from "@/components/ui/status-callout";
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
// Design-B field row
// ---------------------------------------------------------------------------

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex justify-between items-start py-2 border-b border-[#f3f3f3] last:border-0">
			<span className="text-[11px] uppercase tracking-widest font-bold text-[#737373] shrink-0 mr-4 mt-0.5">
				{label}
			</span>
			<span className="text-[13px] text-[#0a0a0a] text-right">{children}</span>
		</div>
	);
}

// ---------------------------------------------------------------------------
// TrainersTab (verbatim from service-detail-dialog.tsx — logic only; styled for Design B)
// ---------------------------------------------------------------------------

interface TrainersTabProps {
	serviceId: string;
	organizationId: string;
}

function TrainersTab({ serviceId, organizationId }: TrainersTabProps) {
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
			<div className="flex items-center justify-center py-12">
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
					<SelectTrigger className="flex-1 border border-[#e5e5e5] rounded-xl text-[13px]">
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
				<button
					type="button"
					disabled={!selectedMemberId || assignMutation.isPending}
					onClick={() => selectedMemberId && assignMutation.mutate(selectedMemberId)}
					className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] disabled:opacity-50 transition-colors flex items-center gap-1.5"
				>
					{assignMutation.isPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<UserPlus className="size-4" />
					)}
					Assign
				</button>
			</div>

			{/* Assigned list */}
			{assigned && assigned.length === 0 ? (
				<p className="text-[13px] text-[#a3a3a3] italic py-4 text-center">
					No trainers assigned to this service.
				</p>
			) : (
				<ul className="space-y-2">
					{(assigned ?? []).map((m) => (
						<li
							key={m.memberId}
							className="flex items-center justify-between rounded-xl border border-[#e5e5e5] bg-white px-4 py-3"
						>
							<span className="text-[13px] font-medium text-[#0a0a0a]">{m.displayName}</span>
							<button
								type="button"
								disabled={removeMutation.isPending}
								onClick={() => removeMutation.mutate(m.memberId)}
								className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#f3f3f3] text-[#737373] hover:text-[#0a0a0a] transition-colors disabled:opacity-50"
							>
								<X className="size-4" />
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Inline Deactivate Confirm Panel (Dialog 3 — no sibling Dialog)
// ---------------------------------------------------------------------------

function DeactivateConfirmPanel({
	serviceName,
	isDeleting,
	onCancel,
	onConfirm,
}: {
	serviceName: string;
	isDeleting: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center h-full min-h-[300px] px-4">
			<div className="rounded-2xl border border-[#e5e5e5] bg-[#f3f3f3] p-6 w-full max-w-sm text-center">
				{/* Warning icon */}
				<div className="flex justify-center mb-4">
					<svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
						<path
							d="M20 6L36 34H4L20 6Z"
							fill="#FEF3C7"
							stroke="#F59E0B"
							strokeWidth="2"
							strokeLinejoin="round"
						/>
						<path d="M20 16V23" stroke="#92400E" strokeWidth="2.5" strokeLinecap="round" />
						<circle cx="20" cy="28" r="1.5" fill="#92400E" />
					</svg>
				</div>

				<h3 className="text-[18px] font-extrabold text-[#0a0a0a] mb-2">
					Deactivate this service?
				</h3>
				<p className="text-[13px] text-[#737373] leading-relaxed">
					<span className="font-semibold text-[#0a0a0a]">&ldquo;{serviceName}&rdquo;</span> will be hidden from
					active lists. You can reactivate it later from the Services table.
				</p>

				<div className="flex gap-2 mt-6 justify-center">
					<button
						type="button"
						onClick={onCancel}
						disabled={isDeleting}
						className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] disabled:opacity-50 transition-colors"
					>
						← Go back
					</button>
					<button
						type="button"
						onClick={onConfirm}
						disabled={isDeleting}
						className="bg-red-600 text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
					>
						{isDeleting && <Loader2 className="size-4 animate-spin" />}
						Deactivate
					</button>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Dialog
// ---------------------------------------------------------------------------

type SectionKey = "overview" | "pricing" | "trainers";

const NAV_SECTIONS: { key: SectionKey; label: string }[] = [
	{ key: "overview", label: "Overview" },
	{ key: "pricing", label: "Pricing" },
	{ key: "trainers", label: "Trainers" },
];

export function ServiceDetailDialogB({
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
	const [activeSection, setActiveSection] = useState<SectionKey>("overview");

	// Fetch service — verbatim from service-detail-dialog.tsx
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
		// Reset section + confirm when dialog reopens
		setActiveSection("overview");
		setShowDeleteConfirm(false);
	}, [isOpen, serviceId, organizationId]);

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

	// ---------------------------------------------------------------------------
	// Section renderers
	// ---------------------------------------------------------------------------

	function renderOverview() {
		if (!service) return null;
		return (
			<div className="space-y-1">
				<FieldRow label="Name">{service.name}</FieldRow>
				<FieldRow label="Status">
					<StatusBadge status={service.isActive ? "active" : "inactive"} />
				</FieldRow>
				{service.description && (
					<FieldRow label="Description">{service.description}</FieldRow>
				)}
				<FieldRow label="Type">
					<span className="capitalize">{service.type ?? "—"}</span>
				</FieldRow>
				<FieldRow label="Recommended">{service.isRecommended ? "Yes" : "No"}</FieldRow>
				<FieldRow label="Scheduling">
					{service.schedulingType === "class_slot" ? "Class slot" : "Appointment"}
				</FieldRow>
				<FieldRow label="Duration">
					{formatDuration(service.duration, service.durationUnitType)}
				</FieldRow>
				<FieldRow label="Max Attendees">{service.maxAttendees}</FieldRow>
				{service.location && <FieldRow label="Location">{service.location}</FieldRow>}
				{service.features && service.features.length > 0 && (
					<FieldRow label="Features">
						<span>{service.features.join(", ")}</span>
					</FieldRow>
				)}
				<div className="pt-3 mt-2 border-t border-[#e5e5e5] space-y-1">
					<FieldRow label="Created">{formatDate(service.createdAt)}</FieldRow>
					<FieldRow label="Updated">{formatDate(service.updatedAt)}</FieldRow>
				</div>
			</div>
		);
	}

	function renderPricing() {
		if (!service) return null;
		return (
			<div className="space-y-1">
				<FieldRow label="Price">
					{service.price != null ? formatPrice(service.price, "MYR") : "—"}
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

				{service.schedulingType === "class_slot" && (
					<div className="mt-4 pt-4 border-t border-[#e5e5e5]">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-3">
							Time-Preset Schedule
						</p>
						{service.timePresetConfig && service.timePresetConfig.recurringDays.length > 0 ? (
							<div className="space-y-3">
								<FieldRow label="Recurring Days">
									{service.timePresetConfig.recurringDays.join(", ")}
								</FieldRow>
								{service.timePresetConfig.recurringDays.map((day) => {
									const slots = service.timePresetConfig?.timeSlotsPerDay[day] ?? [];
									return (
										<FieldRow key={day} label={day}>
											{slots.length > 0 ? slots.join(", ") : <em className="text-[#a3a3a3]">No slots</em>}
										</FieldRow>
									);
								})}
							</div>
						) : (
							<p className="text-[13px] text-[#a3a3a3] italic">No recurring schedule configured.</p>
						)}
					</div>
				)}
			</div>
		);
	}

	function renderTrainers() {
		if (!organizationId || !serviceId) return null;
		return (
			<TrainersTab
				serviceId={serviceId}
				organizationId={organizationId}
			/>
		);
	}

	function renderRightContent() {
		if (showDeleteConfirm && service) {
			return (
				<DeactivateConfirmPanel
					serviceName={service.name}
					isDeleting={isDeleting}
					onCancel={() => setShowDeleteConfirm(false)}
					onConfirm={handleDelete}
				/>
			);
		}

		if (activeSection === "overview") return renderOverview();
		if (activeSection === "pricing") return renderPricing();
		if (activeSection === "trainers") return renderTrainers();
		return null;
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
				{/* Header */}
				<div className="px-8 pt-7 pb-5 border-b border-[#e5e5e5] shrink-0">
					<div className="flex items-center justify-between gap-3">
						<h2 className="text-[20px] font-extrabold tracking-tight text-[#0a0a0a] truncate">
							{service?.name ?? "Service Details"}
						</h2>
						{service && !showDeleteConfirm && (
							<div className="flex items-center gap-2 shrink-0">
								{onEdit && (
									<button
										type="button"
										onClick={() => {
											onClose();
											onEdit(serviceId!);
										}}
										className="border border-[#e5e5e5] bg-white px-3 py-2 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] transition-colors flex items-center gap-1.5"
									>
										<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
											<path d="M9.5 2.5L11.5 4.5M1.5 12.5L2.5 9.5L10 2L12 4L4.5 11.5L1.5 12.5Z" stroke="#404040" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
										</svg>
										Edit
									</button>
								)}
								{onDelete && (
									<button
										type="button"
										onClick={() => setShowDeleteConfirm(true)}
										className="border border-[#e5e5e5] bg-white px-3 py-2 rounded-[10px] text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5"
									>
										<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
											<path d="M2 4H12M5 4V2.5C5 2.22 5.22 2 5.5 2H8.5C8.78 2 9 2.22 9 2.5V4M10.5 4L10 11.5C10 11.78 9.78 12 9.5 12H4.5C4.22 12 4 11.78 4 11.5L3.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
										</svg>
										Deactivate
									</button>
								)}
							</div>
						)}
					</div>
				</div>

				{/* Body */}
				<div className="flex-1 min-h-0 overflow-hidden">
					{isLoading && (
						<div className="flex items-center justify-center h-full py-12">
							<Loader2 className="size-8 animate-spin text-[#a3a3a3]" />
							<span className="ml-3 text-[13px] text-[#a3a3a3]">Loading...</span>
						</div>
					)}

					{error && (
						<div className="p-8">
							<StatusCallout variant="error" message={error} />
						</div>
					)}

					{service && !isLoading && (
						<div className="grid grid-cols-[180px_1fr] divide-x divide-[#e5e5e5] h-full min-h-[400px]">
							{/* Left nav */}
							<nav className="py-4 px-3 space-y-1 overflow-y-auto" aria-label="Service sections">
								{NAV_SECTIONS.map(({ key, label }) => {
									const isActive = activeSection === key && !showDeleteConfirm;
									return (
										<button
											key={key}
											type="button"
											onClick={() => {
												setActiveSection(key);
												setShowDeleteConfirm(false);
											}}
											className={[
												"px-3 py-2 text-[13px] cursor-pointer w-full text-left transition rounded-xl",
												isActive
													? "bg-[#f3f3f3] text-[#0a0a0a] font-semibold"
													: "text-[#737373] hover:text-[#0a0a0a] hover:bg-[#f3f3f3]/60",
											].join(" ")}
										>
											{label}
										</button>
									);
								})}
							</nav>

							{/* Right panel */}
							<div className="px-8 py-6 overflow-y-auto">
								{renderRightContent()}
							</div>
						</div>
					)}
				</div>

				{/* Footer close button */}
				{!showDeleteConfirm && (
					<div className="px-8 py-4 border-t border-[#e5e5e5] flex justify-end shrink-0">
						<button
							type="button"
							onClick={onClose}
							className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] transition-colors"
						>
							Close
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
