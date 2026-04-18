import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";

export interface CategoryFormData {
	name: string;
	externalCode?: string;
}

interface CategoryFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mode: "create" | "edit";
	initialData?: CategoryFormData & { id?: string };
	onSubmit: (data: CategoryFormData, id?: string) => Promise<void>;
	isLoading?: boolean;
}

export function CategoryFormDialog({
	isOpen,
	onClose,
	mode,
	initialData,
	onSubmit,
	isLoading,
}: CategoryFormDialogProps) {
	const [formData, setFormData] = useState<CategoryFormData>({
		name: "",
		externalCode: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialData) {
			setFormData({
				name: initialData.name || "",
				externalCode: initialData.externalCode || "",
			});
		} else {
			setFormData({
				name: "",
				externalCode: "",
			});
		}
	}, [initialData, isOpen]);

	if (!isOpen) return null;

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsSubmitting(true);

		try {
			if (!formData.name.trim()) {
				throw new Error("Category name is required");
			}

			await onSubmit(formData, initialData?.id);
			onClose();
		} catch (err) {
			const errorMessage =
				err instanceof Error
					? err.message
					: `Failed to ${mode === "create" ? "create" : "update"} category`;
			setError(errorMessage);
		} finally {
			setIsSubmitting(false);
		}
	};

	const isPending = isSubmitting || isLoading;

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
					<div className="flex min-h-full items-center justify-center p-4 text-center">
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
									{mode === "create" ? "Add Category" : "Edit Category"}
								</Dialog.Title>

								{error && (
									<div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
										{error}
									</div>
								)}

								<form onSubmit={handleSubmit} className="space-y-4">
									<div>
										<label
											htmlFor="name"
											className="block text-sm font-medium text-brand-primary-1"
										>
											Category Name *
										</label>
										<input
											id="name"
											name="name"
											type="text"
											required
											value={formData.name}
											onChange={handleChange}
											className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											placeholder="Enter category name"
										/>
									</div>

									<div>
										<label
											htmlFor="externalCode"
											className="block text-sm font-medium text-brand-primary-1"
										>
											External Code
										</label>
										<input
											id="externalCode"
											name="externalCode"
											type="text"
											value={formData.externalCode ?? ""}
											onChange={handleChange}
											className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											placeholder="Enter external code (optional)"
										/>
									</div>

									<div className="mt-6 flex justify-end space-x-3">
										<button
											type="button"
											onClick={onClose}
											className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={isPending || !formData.name.trim()}
											className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isPending
												? mode === "create"
													? "Adding..."
													: "Saving..."
												: mode === "create"
													? "Add Category"
													: "Save Changes"}
										</button>
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
