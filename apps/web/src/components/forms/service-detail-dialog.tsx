import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
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

// ── Local presentational helpers ──────────────────────────────────────────────

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
				{label}
			</p>
			<div className="mt-1 text-sm text-foreground">{children}</div>
		</div>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6">
			<h3 className="font-subheading text-base text-foreground mb-4">
				{title}
			</h3>
			{children}
		</div>
	);
}

export function ServiceDetailDialog({
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
				<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
					<DialogHeader>
						<div className="flex items-center justify-between gap-3 pr-8">
							<DialogTitle className="font-heading text-2xl">
								Service Details
							</DialogTitle>
							{service && (
								<div className="flex items-center gap-2">
									{onEdit && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												onClose();
												onEdit(serviceId!);
											}}
										>
											<Pencil className="mr-1 size-4" />
											Edit
										</Button>
									)}
									{onDelete && (
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={() => setShowDeleteConfirm(true)}
										>
											<Trash2 className="mr-1 size-4" />
											Deactivate
										</Button>
									)}
								</div>
							)}
						</div>
					</DialogHeader>

					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="size-8 animate-spin text-muted-foreground" />
							<span className="ml-3 text-sm text-muted-foreground">
								Loading...
							</span>
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{service && !isLoading && (
						<div className="space-y-6">
							{/* Header card: name + status + recommended */}
							<Section title="Overview">
								<div className="space-y-4">
									<Field label="Name">{service.name}</Field>
									{service.description && (
										<Field label="Description">{service.description}</Field>
									)}
									<div className="grid grid-cols-2 gap-4">
										<Field label="Status">
											<StatusBadge
												status={service.isActive ? "active" : "inactive"}
											/>
										</Field>
										{service.isRecommended && (
											<Field label="Recommended">
												<Badge variant="default">Yes</Badge>
											</Field>
										)}
									</div>
								</div>
							</Section>

							<Section title="Scheduling">
								<div className="grid grid-cols-2 gap-4">
									<Field label="Duration">
										{formatDuration(service.duration, service.durationUnitType)}
									</Field>
									<Field label="Max attendees">{service.maxAttendees}</Field>
									<Field label="Scheduling type">
										<Badge variant="outline">
											{service.schedulingType === "class_slot"
												? "Class slot"
												: "Appointment"}
										</Badge>
									</Field>
									<Field label="Type">
										<Badge variant="outline" className="capitalize">
											{service.type ?? "—"}
										</Badge>
									</Field>
								</div>
							</Section>

							{service.schedulingType === "class_slot" && (
							<Section title="Time-Preset Schedule">
								{service.timePresetConfig &&
								service.timePresetConfig.recurringDays.length > 0 ? (
									<div className="space-y-4">
										<Field label="Recurring Days">
											<div className="flex flex-wrap gap-1">
												{service.timePresetConfig.recurringDays.map((day) => (
													<Badge key={day} variant="outline">
														{day}
													</Badge>
												))}
											</div>
										</Field>
										<Field label="Time Slots per Day">
											<div className="space-y-2">
												{service.timePresetConfig.recurringDays.map((day) => {
													const slots =
														service.timePresetConfig?.timeSlotsPerDay[day] ?? [];
													return (
														<div
															key={day}
															className="flex flex-wrap items-center gap-2"
														>
															<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground w-20 shrink-0">
																{day}
															</span>
															{slots.length > 0 ? (
																slots.map((time, i) => (
																	<Badge key={i} variant="secondary">
																		{time}
																	</Badge>
																))
															) : (
																<span className="text-sm text-muted-foreground italic">
																	No slots configured
																</span>
															)}
														</div>
													);
												})}
											</div>
										</Field>
									</div>
								) : (
									<p className="text-sm text-muted-foreground italic">
										No recurring schedule configured.
									</p>
								)}
							</Section>
						)}

						<Section title="Pricing & Tax">
								<div className="grid grid-cols-2 gap-4">
									<Field label="Price">
										{service.price != null
											? formatPrice(service.price, "MYR")
											: "—"}
									</Field>
									<Field label="Taxable">
										{service.taxable ? `Yes (${service.taxPercentage}%)` : "No"}
									</Field>
								</div>
							</Section>

							<Section title="Sessions & Expiry">
								<div className="grid grid-cols-2 gap-4">
									<Field label="Sessions">{service.sessionCount ?? "—"}</Field>
									{service.expirable && (
										<Field label="Expiry">
											{service.expiryDays
												? `${service.expiryDays} days`
												: "—"}
										</Field>
									)}
								</div>
							</Section>

							{(service.location ||
								(service.features && service.features.length > 0)) && (
								<Section title="Details">
									<div className="space-y-4">
										{service.location && (
											<Field label="Location">{service.location}</Field>
										)}
										{service.features && service.features.length > 0 && (
											<Field label="Features">
												<div className="flex flex-wrap gap-1">
													{service.features.map((f, i) => (
														<Badge key={i} variant="secondary">
															{f}
														</Badge>
													))}
												</div>
											</Field>
										)}
									</div>
								</Section>
							)}

							<div className="grid grid-cols-2 gap-4 border-t border-brand-secondary-3 pt-4">
								<Field label="Created">{formatDate(service.createdAt)}</Field>
								<Field label="Updated">{formatDate(service.updatedAt)}</Field>
							</div>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Confirmation dialog — sibling, not nested */}
			<Dialog
				open={showDeleteConfirm}
				onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle className="font-heading text-2xl">
							Deactivate service
						</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Deactivate &quot;{service?.name}&quot;? It will be hidden from active
						lists. You can reactivate it later by editing.
					</p>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowDeleteConfirm(false)}
							disabled={isDeleting}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
							Deactivate
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
