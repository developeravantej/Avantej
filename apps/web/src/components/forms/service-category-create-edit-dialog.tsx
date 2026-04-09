import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ServiceCategoryFormData {
	id?: string;
	name: string;
	description: string | null;
	displayOrder: number;
	isActive: boolean;
}

interface ServiceCategoryCreateEditDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: ServiceCategoryFormData | null;
}

export function ServiceCategoryCreateEditDialog({
	isOpen,
	onClose,
	onSuccess,
	organizationId,
	mode,
	initialData,
}: ServiceCategoryCreateEditDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [displayOrder, setDisplayOrder] = useState(0);
	const [isActive, setIsActive] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (isOpen) {
			if (mode === "edit" && initialData) {
				setName(initialData.name);
				setDescription(initialData.description ?? "");
				setDisplayOrder(initialData.displayOrder ?? 0);
				setIsActive(initialData.isActive ?? true);
			} else {
				setName("");
				setDescription("");
				setDisplayOrder(0);
				setIsActive(true);
			}
		}
	}, [isOpen, mode, initialData]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		setIsSubmitting(true);
		try {
			const { client } = await import("@/utils/orpc");
			if (mode === "create") {
				await client.serviceCategories.create({
					organizationId,
					name: name.trim(),
					description: description.trim() || null,
					displayOrder,
					isActive,
				});
				toast.success("Service category created");
			} else if (initialData?.id) {
				await client.serviceCategories.update({
					organizationId,
					id: initialData.id,
					name: name.trim(),
					description: description.trim() || null,
					displayOrder,
					isActive,
				});
				toast.success("Service category updated");
			}
			onSuccess();
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Something went wrong";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
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
							<Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
								<Dialog.Title className="text-lg font-semibold">
									{mode === "create" ? "Add Service Category" : "Edit Service Category"}
								</Dialog.Title>
								<form onSubmit={handleSubmit} className="mt-4 space-y-4">
									<div>
										<Label htmlFor="name">Name *</Label>
										<Input
											id="name"
											value={name}
											onChange={(e) => setName(e.target.value)}
											placeholder="Category name"
											className="mt-1"
										/>
									</div>
									<div>
										<Label htmlFor="description">Description</Label>
										<Input
											id="description"
											value={description}
											onChange={(e) => setDescription(e.target.value)}
											placeholder="Optional description"
											className="mt-1"
										/>
									</div>
									<div>
										<Label htmlFor="displayOrder">Display order</Label>
										<Input
											id="displayOrder"
											type="number"
											min={0}
											value={displayOrder}
											onChange={(e) => setDisplayOrder(Number(e.target.value) || 0)}
											className="mt-1"
										/>
									</div>
									<div className="flex items-center gap-2">
										<input
											type="checkbox"
											id="isActive"
											checked={isActive}
											onChange={(e) => setIsActive(e.target.checked)}
											className="h-4 w-4 rounded border-brand-secondary-3"
										/>
										<Label htmlFor="isActive">Active</Label>
									</div>
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" onClick={onClose}>
											Cancel
										</Button>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
											{mode === "create" ? "Create" : "Save"}
										</Button>
									</div>
								</form>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
}
