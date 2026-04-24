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
					const message = err instanceof Error ? err.message : "Failed to load service";
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
			const message = err instanceof Error ? err.message : "Failed to deactivate service";
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
						<DialogTitle>Service Details</DialogTitle>
					</DialogHeader>

					<div className="flex items-center justify-end gap-2">
						{service && (
							<>
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
										<Pencil className="h-4 w-4 mr-1" />
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
										<Trash2 className="h-4 w-4 mr-1" />
										Deactivate
									</Button>
								)}
							</>
						)}
					</div>

					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<Loader2 className="h-8 w-8 animate-spin text-brand-secondary-1" />
							<span className="ml-3 text-brand-secondary-1">Loading...</span>
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{service && !isLoading && (
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-brand-primary-1">Name</label>
								<p className="mt-1 text-sm text-brand-secondary-1">{service.name}</p>
							</div>
							{service.description && (
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Description</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{service.description}</p>
								</div>
							)}
							<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
								<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Scheduling</h5>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Duration</label>
										<p className="mt-1 text-sm text-brand-secondary-1">
											{formatDuration(service.duration, service.durationUnitType)}
										</p>
									</div>
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Max attendees</label>
										<p className="mt-1 text-sm text-brand-secondary-1">{service.maxAttendees}</p>
									</div>
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Scheduling type</label>
										<div className="mt-1">
											<Badge variant="outline">
												{service.schedulingType === "class_slot" ? "Class slot" : "Appointment"}
											</Badge>
										</div>
									</div>
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Type</label>
										<div className="mt-1">
											<Badge variant="outline" className="capitalize">
												{service.type ?? "—"}
											</Badge>
										</div>
									</div>
								</div>
							</div>
							<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
								<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Pricing &amp; Tax</h5>
								<div className="grid grid-cols-2 gap-4">
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Price</label>
										<p className="mt-1 text-sm text-brand-secondary-1">
											{service.price != null ? formatPrice(service.price, "MYR") : "—"}
										</p>
									</div>
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Taxable</label>
										<p className="mt-1 text-sm text-brand-secondary-1">
											{service.taxable ? `Yes (${service.taxPercentage}%)` : "No"}
										</p>
									</div>
								</div>
							</div>
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Sessions</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{service.sessionCount ?? "—"}</p>
								</div>
								{service.expirable && (
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Expiry</label>
										<p className="mt-1 text-sm text-brand-secondary-1">
											{service.expiryDays ? `${service.expiryDays} days` : "—"}
										</p>
									</div>
								)}
							</div>
							{service.location && (
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Location</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{service.location}</p>
								</div>
							)}
							{service.features && service.features.length > 0 && (
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Features</label>
									<div className="mt-1 flex flex-wrap gap-1">
										{service.features.map((f, i) => (
											<Badge key={i} variant="secondary">{f}</Badge>
										))}
									</div>
								</div>
							)}
							<div className="grid grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Status</label>
									<div className="mt-1">
										{service.isActive ? (
											<Badge variant="default">Active</Badge>
										) : (
											<Badge variant="secondary">Inactive</Badge>
										)}
									</div>
								</div>
								{service.isRecommended && (
									<div>
										<label className="block text-sm font-medium text-brand-primary-1">Recommended</label>
										<div className="mt-1">
											<Badge variant="default">Yes</Badge>
										</div>
									</div>
								)}
							</div>
							<div className="grid grid-cols-2 gap-4 border-t border-brand-secondary-3 pt-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Created</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{formatDate(service.createdAt)}</p>
								</div>
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Updated</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{formatDate(service.updatedAt)}</p>
								</div>
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
			<Dialog open={showDeleteConfirm} onOpenChange={(open) => !open && setShowDeleteConfirm(false)}>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Deactivate service</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-brand-secondary-1">
						Deactivate &quot;{service?.name}&quot;? It will be hidden from active lists. You can reactivate it later by editing.
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
							{isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
							Deactivate
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
