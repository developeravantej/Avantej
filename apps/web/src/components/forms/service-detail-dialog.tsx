import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { client } from "@/utils/orpc";

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

function formatPrice(priceCents: number | null | undefined): string {
	if (priceCents == null) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(priceCents / 100);
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
		<Transition appear show={isOpen} as={Fragment}>
			<Dialog as="div" className="relative z-10" onClose={onClose}>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-brand-primary-1/50" />
				</Transition.Child>
				<div className="fixed inset-0 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 scale-95"
							enterTo="opacity-100 scale-100"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 scale-100"
							leaveTo="opacity-0 scale-95"
						>
							<Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
								<div className="flex items-center justify-between mb-6">
									<Dialog.Title className="text-lg font-semibold">
										Service Details
									</Dialog.Title>
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
										</div>
									)}
								</div>

								{isLoading && (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
										<span className="ml-3 text-muted-foreground">Loading...</span>
									</div>
								)}

								{error && (
									<div className="mb-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
										{error}
									</div>
								)}

								{service && !isLoading && (
									<div className="space-y-4">
										<div>
											<label className="text-sm font-medium text-muted-foreground">Name</label>
											<p className="mt-1 text-sm font-medium">{service.name}</p>
										</div>
										{service.description && (
											<div>
												<label className="text-sm font-medium text-muted-foreground">Description</label>
												<p className="mt-1 text-sm">{service.description}</p>
											</div>
										)}
										<div>
											<label className="text-sm font-medium text-muted-foreground">Duration</label>
											<p className="mt-1 text-sm">
												{formatDuration(service.duration, service.durationUnitType)}
											</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Max attendees</label>
											<p className="mt-1 text-sm">{service.maxAttendees}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Price</label>
											<p className="mt-1 text-sm">{formatPrice(service.price)}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Scheduling</label>
											<div className="mt-1">
												<Badge variant="outline">
													{service.schedulingType === "class_slot" ? "Class slot" : "Appointment"}
												</Badge>
											</div>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Status</label>
											<div className="mt-1">
												{service.isActive ? (
													<Badge variant="default">Active</Badge>
												) : (
													<Badge variant="secondary">Inactive</Badge>
												)}
											</div>
										</div>
										<div className="grid grid-cols-2 gap-4 pt-2 border-t">
											<div>
												<label className="text-sm font-medium text-muted-foreground">Created</label>
												<p className="mt-1 text-sm">{formatDate(service.createdAt)}</p>
											</div>
											<div>
												<label className="text-sm font-medium text-muted-foreground">Updated</label>
												<p className="mt-1 text-sm">{formatDate(service.updatedAt)}</p>
											</div>
										</div>
									</div>
								)}

								<div className="mt-6 flex justify-end">
									<Button type="button" variant="outline" onClick={onClose}>
										Close
									</Button>
								</div>

								<Transition appear show={showDeleteConfirm} as={Fragment}>
									<Dialog as="div" className="relative z-20" onClose={() => setShowDeleteConfirm(false)}>
										<Transition.Child
											as={Fragment}
											enter="ease-out duration-300"
											enterFrom="opacity-0"
											enterTo="opacity-100"
											leave="ease-in duration-200"
											leaveFrom="opacity-100"
											leaveTo="opacity-0"
										>
											<div className="fixed inset-0 bg-brand-primary-1/50" />
										</Transition.Child>
										<div className="fixed inset-0 overflow-y-auto">
											<div className="flex min-h-full items-center justify-center p-4">
												<Transition.Child
													as={Fragment}
													enter="ease-out duration-300"
													enterFrom="opacity-0 scale-95"
													enterTo="opacity-100 scale-100"
													leave="ease-in duration-200"
													leaveFrom="opacity-100 scale-100"
													leaveTo="opacity-0 scale-95"
												>
													<Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
														<Dialog.Title className="text-lg font-medium mb-4">
															Deactivate service
														</Dialog.Title>
														<p className="text-sm text-muted-foreground mb-6">
															Deactivate &quot;{service?.name}&quot;? It will be hidden from active lists. You can reactivate it later by editing.
														</p>
														<div className="flex justify-end gap-3">
															<Button
																variant="outline"
																onClick={() => setShowDeleteConfirm(false)}
																disabled={isDeleting}
															>
																Cancel
															</Button>
															<Button
																variant="destructive"
																onClick={handleDelete}
																disabled={isDeleting}
															>
																{isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
																Deactivate
															</Button>
														</div>
													</Dialog.Panel>
												</Transition.Child>
											</div>
										</div>
									</Dialog>
								</Transition>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
}
