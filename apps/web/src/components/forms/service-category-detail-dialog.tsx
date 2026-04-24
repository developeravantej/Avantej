import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StatusCallout } from "@/components/ui/status-callout";
import { client } from "@/utils/orpc";

interface ServiceCategoryDetailDialogProps {
	isOpen: boolean;
	onClose: () => void;
	categoryId: string | null;
	organizationId: string | null;
	onEdit?: (categoryId: string) => void;
	onDelete?: (categoryId: string) => Promise<void>;
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

export function ServiceCategoryDetailDialog({
	isOpen,
	onClose,
	categoryId,
	organizationId,
	onEdit,
	onDelete,
}: ServiceCategoryDetailDialogProps) {
	const [category, setCategory] = useState<{
		id: string;
		name: string;
		description: string | null;
		displayOrder: number;
		isActive: boolean;
		createdAt: Date | string;
		updatedAt: Date | string;
	} | null>(null);
	const [config, setConfig] = useState<{
		defaultDuration: number | null;
		defaultMaxAttendees: number | null;
		requireAdvanceBooking: boolean;
		minAdvanceHours: number | null;
		enableCancellationWindow: boolean;
		cancellationCutoffHours: number | null;
		bufferTimeMinutes: number | null;
	} | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	useEffect(() => {
		if (isOpen && categoryId && organizationId) {
			const fetchCategory = async () => {
				setIsLoading(true);
				setError(null);
				try {
					const [categoryResult, configResult] = await Promise.all([
						client.serviceCategories.getById({
							organizationId,
							id: categoryId,
						}),
						client.serviceCategoryConfig
							.getByCategoryId({
								organizationId,
								categoryId,
							})
							.catch(() => null),
					]);
					setCategory(categoryResult);
					setConfig(configResult);
				} catch (err: unknown) {
					const message =
						err instanceof Error ? err.message : "Failed to load category";
					setError(message);
					setCategory(null);
					setConfig(null);
				} finally {
					setIsLoading(false);
				}
			};
			fetchCategory();
		} else {
			setCategory(null);
			setConfig(null);
			setError(null);
		}
	}, [isOpen, categoryId, organizationId]);

	async function handleDelete() {
		if (!categoryId || !onDelete) return;
		try {
			setIsDeleting(true);
			await onDelete(categoryId);
			setShowDeleteConfirm(false);
			onClose();
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Failed to deactivate category";
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
						<div className="flex items-center justify-between gap-4">
							<DialogTitle>Service Category Details</DialogTitle>
							{category && (
								<div className="flex items-center gap-2">
									{onEdit && (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => {
												onClose();
												onEdit(categoryId!);
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
					</DialogHeader>

					{isLoading && (
						<div className="flex items-center justify-center py-12">
							<LoadingSpinner size="lg" label="Loading..." />
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{category && !isLoading && (
						<div className="space-y-4">
							<div>
								<label className="block text-sm font-medium text-brand-primary-1">Name</label>
								<p className="mt-1 text-sm text-brand-secondary-1">{category.name}</p>
							</div>
							<div>
								<label className="block text-sm font-medium text-brand-primary-1">Description</label>
								<p className="mt-1 text-sm text-brand-secondary-1">{category.description ?? "—"}</p>
							</div>
							<div>
								<label className="block text-sm font-medium text-brand-primary-1">Display order</label>
								<p className="mt-1 text-sm text-brand-secondary-1">{category.displayOrder}</p>
							</div>
							<div>
								<label className="block text-sm font-medium text-brand-primary-1">Status</label>
								<div className="mt-1">
									{category.isActive ? (
										<Badge variant="default">Active</Badge>
									) : (
										<Badge variant="secondary">Inactive</Badge>
									)}
								</div>
							</div>
							{config && (
								<>
									<div className="border-t border-brand-secondary-3 pt-4 mt-4">
										<h3 className="text-lg font-medium text-brand-primary-1 mb-4">Category Configuration</h3>
										<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
											<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Timing</h5>
											<div className="grid grid-cols-2 gap-4">
												<div>
													<label className="block text-sm font-medium text-brand-primary-1">Default Duration</label>
													<p className="mt-1 text-sm text-brand-secondary-1">{config.defaultDuration ? `${config.defaultDuration} min` : "—"}</p>
												</div>
												<div>
													<label className="block text-sm font-medium text-brand-primary-1">Max Attendees</label>
													<p className="mt-1 text-sm text-brand-secondary-1">{config.defaultMaxAttendees ?? "—"}</p>
												</div>
											</div>
										</div>
									</div>
									<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
										<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Booking &amp; Cancellation Rules</h5>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<label className="block text-sm font-medium text-brand-primary-1">Advance Booking</label>
												<p className="mt-1 text-sm text-brand-secondary-1">
													{config.requireAdvanceBooking
														? `Required (${config.minAdvanceHours ?? 0}h ahead)`
														: "Not required"}
												</p>
											</div>
											<div>
												<label className="block text-sm font-medium text-brand-primary-1">Cancellation Window</label>
												<p className="mt-1 text-sm text-brand-secondary-1">
													{config.enableCancellationWindow
														? `${config.cancellationCutoffHours ?? 0}h before start`
														: "No window"}
												</p>
											</div>
											<div>
												<label className="block text-sm font-medium text-brand-primary-1">Buffer Time</label>
												<p className="mt-1 text-sm text-brand-secondary-1">
													{config.bufferTimeMinutes ? `${config.bufferTimeMinutes} min` : "None"}
												</p>
											</div>
										</div>
									</div>
								</>
							)}
							<div className="grid grid-cols-2 gap-4 border-t border-brand-secondary-3 pt-4 mt-4">
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Created</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{formatDate(category.createdAt)}</p>
								</div>
								<div>
									<label className="block text-sm font-medium text-brand-primary-1">Updated</label>
									<p className="mt-1 text-sm text-brand-secondary-1">{formatDate(category.updatedAt)}</p>
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

			<Dialog
				open={showDeleteConfirm}
				onOpenChange={(open) => !open && setShowDeleteConfirm(false)}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Deactivate category</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Deactivate &quot;{category?.name}&quot;? It will be hidden from active lists. You can reactivate it later by editing.
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
