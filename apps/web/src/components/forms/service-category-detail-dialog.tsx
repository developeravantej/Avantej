import { useEffect, useState } from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { StatusBadge } from "@/components/ui/status-badge";
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

export function ServiceCategoryDetailDialog({
	isOpen,
	onClose,
	categoryId,
	organizationId,
	onEdit,
	onDelete,
// react-doctor-disable-next-line react-doctor/prefer-useReducer -- independent state vars (filters, form fields, dialog flags); direct setters with no cross-state transitions; reducer would not improve readability
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
						<div className="flex items-center justify-between gap-3 pr-8">
							<DialogTitle className="font-heading text-2xl">
								Service Category Details
							</DialogTitle>
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
							<LoadingSpinner size="lg" label="Loading..." />
						</div>
					)}

					{error && <StatusCallout variant="error" message={error} />}

					{category && !isLoading && (
						<div className="space-y-6">
							<Section title="Overview">
								<div className="space-y-4">
									<Field label="Name">{category.name}</Field>
									<Field label="Description">
										{category.description ?? "—"}
									</Field>
									<div className="grid grid-cols-2 gap-4">
										<Field label="Display order">
											{category.displayOrder}
										</Field>
										<Field label="Status">
											<StatusBadge
												status={category.isActive ? "active" : "inactive"}
											/>
										</Field>
									</div>
								</div>
							</Section>

							{config && (
								<>
									<Section title="Timing">
										<div className="grid grid-cols-2 gap-4">
											<Field label="Default Duration">
												{config.defaultDuration
													? `${config.defaultDuration} min`
													: "—"}
											</Field>
											<Field label="Max Attendees">
												{config.defaultMaxAttendees ?? "—"}
											</Field>
										</div>
									</Section>

									<Section title="Booking & Cancellation Rules">
										<div className="grid grid-cols-2 gap-4">
											<Field label="Advance Booking">
												{config.requireAdvanceBooking
													? `Required (${config.minAdvanceHours ?? 0}h ahead)`
													: "Not required"}
											</Field>
											<Field label="Cancellation Window">
												{config.enableCancellationWindow
													? `${config.cancellationCutoffHours ?? 0}h before start`
													: "No window"}
											</Field>
											<Field label="Buffer Time">
												{config.bufferTimeMinutes
													? `${config.bufferTimeMinutes} min`
													: "None"}
											</Field>
										</div>
									</Section>
								</>
							)}

							<div className="grid grid-cols-2 gap-4 border-t border-brand-secondary-3 pt-4">
								<Field label="Created">{formatDate(category.createdAt)}</Field>
								<Field label="Updated">{formatDate(category.updatedAt)}</Field>
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
						<DialogTitle className="font-heading text-2xl">
							Deactivate category
						</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-muted-foreground">
						Deactivate &quot;{category?.name}&quot;? It will be hidden from
						active lists. You can reactivate it later by editing.
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
