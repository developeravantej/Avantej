import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
		incentiveType: string | null;
		isConditional: boolean;
		maxStaff: number;
		staffPoolPercentage: number;
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
						client.serviceCategoryConfig.getByCategoryId({
							organizationId,
							categoryId,
						}).catch(() => null),
					]);
					setCategory(categoryResult);
					setConfig(configResult);
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : "Failed to load category";
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
			const message = err instanceof Error ? err.message : "Failed to deactivate category";
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
							<Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
								<div className="flex items-center justify-between mb-6">
									<Dialog.Title
										as="h1"
										className="text-lg font-medium leading-6 text-brand-primary-1"
									>
										Service Category Details
									</Dialog.Title>
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

								{isLoading && (
									<div className="flex items-center justify-center py-12">
										<Loader2 className="h-8 w-8 animate-spin text-brand-secondary-1" />
										<span className="ml-3 text-brand-secondary-1">Loading...</span>
									</div>
								)}

								{error && (
									<div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
										{error}
									</div>
								)}

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
												<div className="grid grid-cols-2 gap-4">
													<div>
														<label className="block text-sm font-medium text-brand-primary-1">Incentive Type</label>
														<p className="mt-1 text-sm text-brand-secondary-1 capitalize">{config.incentiveType ?? "—"}</p>
													</div>
													<div>
														<label className="block text-sm font-medium text-brand-primary-1">Conditional</label>
														<p className="mt-1 text-sm text-brand-secondary-1">{config.isConditional ? "Yes" : "No"}</p>
													</div>
													<div>
														<label className="block text-sm font-medium text-brand-primary-1">Max Staff</label>
														<p className="mt-1 text-sm text-brand-secondary-1">{config.maxStaff}</p>
													</div>
													<div>
														<label className="block text-sm font-medium text-brand-primary-1">Staff Pool %</label>
														<p className="mt-1 text-sm text-brand-secondary-1">{config.staffPoolPercentage}%</p>
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

								<div className="mt-6 flex justify-end space-x-3">
									<button
										type="button"
										onClick={onClose}
										className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
									>
										Close
									</button>
								</div>

								{/* Deactivate confirmation */}
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
													<Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
														<Dialog.Title
															as="h1"
															className="text-lg font-medium leading-6 text-brand-primary-1 mb-4"
														>
															Deactivate category
														</Dialog.Title>
														<p className="text-sm text-brand-secondary-1 mb-6">
															Deactivate &quot;{category?.name}&quot;? It will be hidden from active lists. You can reactivate it later by editing.
														</p>
														<div className="mt-6 flex justify-end space-x-3">
															<button
																type="button"
																onClick={() => setShowDeleteConfirm(false)}
																disabled={isDeleting}
																className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
															>
																Cancel
															</button>
															<button
																type="button"
																onClick={handleDelete}
																disabled={isDeleting}
																className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
															>
																{isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
																Deactivate
															</button>
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
