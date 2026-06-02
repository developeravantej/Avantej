/**
 * Design A variant of ServiceDetailDialog — two-column modal layout.
 * All logic is copied verbatim from service-detail-dialog.tsx.
 * Only the visual layout changes: tabs removed, everything visible at once in two columns.
 */

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { StatusCallout } from "@/components/ui/status-callout";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { formatPrice } from "@/lib/money";

interface ServiceDetailDialogProps {
	isOpen: boolean;
	onClose: () => void;
	serviceId: string | null;
	organizationId: string | null;
	onEdit?: (serviceId: string) => void;
	onDelete?: (serviceId: string) => Promise<void>;
}

// §1 — dates: text-[10px] text-[#737373] font-mono tabular-nums
function formatDate(date: Date | string | null | undefined): string {
	if (!date) return "—";
	try {
		return new Date(date).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return "—";
	}
}

function formatDuration(duration: number, unit?: string | null): string {
	if (unit === "hours") return `${duration} hour(s)`;
	if (unit === "minutes") return `${duration} minute(s)`;
	return `${duration} second(s)`;
}

// §8 — status pill with colored dot
function StatusPill({ active }: { active: boolean }) {
	return active ? (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
			<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
			Active
		</span>
	) : (
		<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
			<span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
			Inactive
		</span>
	);
}

// Field label — matches service-form-a.tsx labelCls exactly
const labelCls =
	"block text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-1";

function SectionDivider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-3 mb-4">
			<span className="text-[10px] uppercase tracking-widest font-bold text-[#737373] whitespace-nowrap">
				{label}
			</span>
			<div className="flex-1 border-t border-[#e5e5e5]" />
		</div>
	);
}

// mono=true → font-mono tabular-nums (§1: numbers, prices, dates, durations, counts)
function FieldRow({
	label,
	mono = false,
	children,
}: {
	label: string;
	mono?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="mb-3">
			<p className={labelCls}>{label}</p>
			<div
				className={
					mono
						? "text-[13px] text-[#0a0a0a] font-mono tabular-nums"
						: "text-[13px] text-[#0a0a0a]"
				}
			>
				{children}
			</div>
		</div>
	);
}

export function ServiceDetailDialogA({
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
		schedulingType: string;
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
		<>
			<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
				<DialogContent
					hideCloseButton
					className="!w-[70vw] !max-w-[70vw] max-h-[90vh] flex flex-col p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				>
					<DialogHeader className="sr-only">
						<DialogTitle>Service Details</DialogTitle>
						<DialogDescription>
							View and manage the details of this service.
						</DialogDescription>
					</DialogHeader>
					{/* ── Header — §10: dialog H2 = text-lg font-bold ── */}
					<div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							SERVICE CATALOG
						</p>
						<div className="flex items-start justify-between gap-4 pr-8">
							<div>
								{/* matches edit form: text-[22px] font-extrabold tracking-tight */}
								<h2 className="text-[22px] font-extrabold tracking-tight text-[#0a0a0a]">
									{service?.name ?? "Service Details"}
								</h2>
								{service && (
									<p className="text-[13px] text-[#737373] mt-1">
										{service.schedulingType === "class_slot"
											? "Class slot"
											: "Appointment"}
										{service.duration != null && (
											<>
												{" "}
												·{" "}
												<span className="font-mono tabular-nums">
													{formatDuration(
														service.duration,
														service.durationUnitType,
													)}
												</span>
											</>
										)}
										{service.price != null && (
											<>
												{" "}
												·{" "}
												<span className="font-mono tabular-nums">
													{formatPrice(service.price, "MYR")}
												</span>
											</>
										)}
									</p>
								)}
							</div>
							{service && (
								<div className="flex items-center gap-2 shrink-0">
									{onEdit && (
										<button
											type="button"
											onClick={() => {
												onClose();
												onEdit(serviceId!);
											}}
											className="border border-[#e5e5e5] bg-white px-4 py-2 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] transition-colors"
										>
											Edit
										</button>
									)}
									{onDelete && (
										<button
											type="button"
											onClick={() => setShowDeleteConfirm(true)}
											className="bg-red-600 text-white px-4 py-2 rounded-[10px] text-[13px] font-semibold hover:bg-red-700 transition-colors"
										>
											Deactivate
										</button>
									)}
								</div>
							)}
						</div>
					</div>

					<div className="flex-1 overflow-y-auto">
						{isLoading && (
							<div className="flex items-center justify-center py-16 gap-3">
								<Loader2 className="size-6 animate-spin text-[#737373]" />
								<span className="text-sm text-[#737373]">Loading…</span>
							</div>
						)}

						{error && (
							<div className="px-5 py-4">
								<StatusCallout variant="error" message={error} />
							</div>
						)}

						{service && !isLoading && (
							<div className="grid grid-cols-2 divide-x divide-[#e5e5e5]">
								{/* LEFT: Overview + Scheduling + Timestamps */}
								<div className="px-5 py-4 space-y-5">
									<div>
										<SectionDivider label="Overview" />
										<div className="grid grid-cols-2 gap-x-6">
											<FieldRow label="Status">
												{/* §8: status pill with dot */}
												<StatusPill active={service.isActive} />
											</FieldRow>
											<FieldRow label="Type">
												<span className="capitalize">
													{service.type ?? "—"}
												</span>
											</FieldRow>
											<FieldRow label="Recommended">
												{service.isRecommended ? "Yes" : "No"}
											</FieldRow>
											{service.description && (
												<FieldRow label="Description">
													{service.description}
												</FieldRow>
											)}
										</div>
									</div>

									<div>
										<SectionDivider label="Scheduling" />
										<div className="grid grid-cols-2 gap-x-6">
											<FieldRow label="Type">
												{service.schedulingType === "class_slot"
													? "Class slot"
													: "Appointment"}
											</FieldRow>
											{/* §1: duration is numeric — mono */}
											<FieldRow label="Duration" mono>
												{formatDuration(
													service.duration,
													service.durationUnitType,
												)}
											</FieldRow>
											<FieldRow label="Max attendees" mono>
												{service.maxAttendees}
											</FieldRow>
											{service.location && (
												<FieldRow label="Location">{service.location}</FieldRow>
											)}
										</div>
										{service.schedulingType === "class_slot" &&
											service.timePresetConfig &&
											service.timePresetConfig.recurringDays.length > 0 && (
												<div className="mt-2">
													<p className={labelCls}>Recurring days</p>
													<div className="flex flex-wrap gap-1 mt-1">
														{service.timePresetConfig.recurringDays.map(
															(day) => (
																<span
																	key={day}
																	className="inline-block border border-[#e5e5e5] rounded-md px-2 py-0.5 text-[11px] font-medium text-[#0a0a0a]"
																>
																	{day}
																</span>
															),
														)}
													</div>
												</div>
											)}
									</div>

									{/* §1: dates = text-[10px] text-[#737373] font-mono tabular-nums */}
									<div className="border-t border-[#e5e5e5] pt-4 grid grid-cols-2 gap-x-6">
										<FieldRow label="Created" mono>
											{formatDate(service.createdAt)}
										</FieldRow>
										<FieldRow label="Updated" mono>
											{formatDate(service.updatedAt)}
										</FieldRow>
									</div>
								</div>

								{/* RIGHT: Pricing & Sessions */}
								<div className="px-5 py-4">
									<SectionDivider label="Pricing & Sessions" />
									<div className="grid grid-cols-2 gap-x-6">
										{/* §1: price = mono */}
										<FieldRow label="Price" mono>
											{service.price != null
												? formatPrice(service.price, "MYR")
												: "—"}
										</FieldRow>
										{/* §1: percentage = mono */}
										<FieldRow label="Taxable" mono>
											{service.taxable
												? `Yes (${service.taxPercentage}%)`
												: "No"}
										</FieldRow>
										{/* §1: count = mono */}
										<FieldRow label="Sessions" mono>
											{service.sessionCount ?? "—"}
										</FieldRow>
										{/* §1: numeric expiry = mono */}
										<FieldRow label="Expiry" mono>
											{service.expirable
												? service.expiryDays
													? `${service.expiryDays} days`
													: "—"
												: "None"}
										</FieldRow>
									</div>
									{service.features && service.features.length > 0 && (
										<div className="mt-2">
											<p className={labelCls}>Features</p>
											<div className="flex flex-wrap gap-1 mt-1">
												{service.features.map((f, i) => (
													<span
														key={i}
														className="inline-block bg-[#f3f3f3] rounded-md px-2 py-0.5 text-[11px] font-medium text-[#0a0a0a]"
													>
														{f}
													</span>
												))}
											</div>
										</div>
									)}
								</div>
							</div>
						)}
					</div>

					{/* ── Footer ── */}
					<div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] transition-colors"
						>
							Close
						</button>
					</div>
				</DialogContent>
			</Dialog>

			{/* ── Deactivate confirmation ── */}
			<Dialog
				open={showDeleteConfirm}
				onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
			>
				<DialogContent
					hideCloseButton
					className="sm:max-w-sm p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							SERVICE CATALOG
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Deactivate service?
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Deactivate this service to hide it from active lists.
						</DialogDescription>
					</DialogHeader>
					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						{/* §10: description = text-sm text-[#737373] */}
						<p className="text-sm text-[#737373]">
							Deactivate{" "}
							<span className="font-semibold text-[#0a0a0a]">
								&ldquo;{service?.name}&rdquo;
							</span>
							? It will be hidden from active lists. You can reactivate it later
							by editing.
						</p>
					</div>
					<div className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						{/* §10: secondary outline on the left */}
						<button
							type="button"
							onClick={() => setShowDeleteConfirm(false)}
							disabled={isDeleting}
							className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] disabled:opacity-50 transition-colors"
						>
							Cancel
						</button>
						{/* §10: destructive = red primary on the right */}
						<button
							type="button"
							onClick={handleDelete}
							disabled={isDeleting}
							className="bg-red-600 text-white hover:bg-red-700 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2 transition-colors"
						>
							{isDeleting && <Loader2 className="size-3.5 animate-spin" />}
							Deactivate
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
