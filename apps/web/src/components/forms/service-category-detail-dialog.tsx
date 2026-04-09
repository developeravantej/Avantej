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
					const result = await client.serviceCategories.getById({
						organizationId,
						id: categoryId,
					});
					setCategory(result);
				} catch (err: unknown) {
					const message = err instanceof Error ? err.message : "Failed to load category";
					setError(message);
					setCategory(null);
				} finally {
					setIsLoading(false);
				}
			};
			fetchCategory();
		} else {
			setCategory(null);
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
							<Dialog.Panel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
								<div className="flex items-center justify-between mb-6">
									<Dialog.Title className="text-lg font-semibold">
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
										<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
										<span className="ml-3 text-muted-foreground">Loading...</span>
									</div>
								)}

								{error && (
									<div className="mb-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
										{error}
									</div>
								)}

								{category && !isLoading && (
									<div className="space-y-4">
										<div>
											<label className="text-sm font-medium text-muted-foreground">Name</label>
											<p className="mt-1 text-sm font-medium">{category.name}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Description</label>
											<p className="mt-1 text-sm">{category.description ?? "—"}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Display order</label>
											<p className="mt-1 text-sm">{category.displayOrder}</p>
										</div>
										<div>
											<label className="text-sm font-medium text-muted-foreground">Status</label>
											<div className="mt-1">
												{category.isActive ? (
													<Badge variant="default">Active</Badge>
												) : (
													<Badge variant="secondary">Inactive</Badge>
												)}
											</div>
										</div>
										<div className="grid grid-cols-2 gap-4 pt-2 border-t">
											<div>
												<label className="text-sm font-medium text-muted-foreground">Created</label>
												<p className="mt-1 text-sm">{formatDate(category.createdAt)}</p>
											</div>
											<div>
												<label className="text-sm font-medium text-muted-foreground">Updated</label>
												<p className="mt-1 text-sm">{formatDate(category.updatedAt)}</p>
											</div>
										</div>
									</div>
								)}

								<div className="mt-6 flex justify-end">
									<Button type="button" variant="outline" onClick={onClose}>
										Close
									</Button>
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
													<Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
														<Dialog.Title className="text-lg font-medium mb-4">
															Deactivate category
														</Dialog.Title>
														<p className="text-sm text-muted-foreground mb-6">
															Deactivate &quot;{category?.name}&quot;? It will be hidden from active lists. You can reactivate it later by editing.
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
