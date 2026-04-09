import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";

export interface BrandFormData {
	name: string;
}

interface BrandFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mode: "create" | "edit";
	initialData?: BrandFormData & { id?: string };
	onSubmit: (data: BrandFormData, id?: string) => Promise<void>;
	isLoading?: boolean;
}

export function BrandFormDialog({
	isOpen,
	onClose,
	mode,
	initialData,
	onSubmit,
	isLoading,
}: BrandFormDialogProps) {
	const [formData, setFormData] = useState<BrandFormData>({
		name: "",
	});
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialData) {
			setFormData({
				name: initialData.name || "",
			});
		} else {
			setFormData({
				name: "",
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
				throw new Error("Brand name is required");
			}

			await onSubmit(formData, initialData?.id);
			onClose();
		} catch (err) {
			const errorMessage =
				err instanceof Error
					? err.message
					: `Failed to ${mode === "create" ? "create" : "update"} brand`;
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
								<div className="flex justify-between items-center mb-6">
									<div>
										<Dialog.Title
											as="h1"
											className="text-2xl font-semibold text-brand-primary-1"
										>
											{mode === "create" ? "ADD BRAND" : "EDIT BRAND"}
										</Dialog.Title>
										<p className="text-sm text-brand-secondary-1 mt-1">Brand Details</p>
									</div>
									<button
										onClick={onClose}
										className="text-brand-secondary-1 hover:text-brand-secondary-1 focus:outline-none"
									>
										<svg
											className="h-6 w-6"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2}
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</div>

								{error && (
									<div className="mb-4 p-3 text-red-700 bg-red-100 rounded-md border border-red-200">
										{error}
									</div>
								)}

								<form onSubmit={handleSubmit} className="space-y-6">
									<div className="bg-brand-secondary-3/50 p-6 rounded-lg">
										<h3 className="text-lg font-semibold text-brand-primary-1 mb-4">
											Brand Details
										</h3>
										<div>
											<label
												htmlFor="name"
												className="block text-sm font-medium text-brand-primary-1 mb-2"
											>
												Brand Name *
											</label>
											<input
												id="name"
												name="name"
												type="text"
												required
												value={formData.name}
												onChange={handleChange}
												className="w-full px-3 py-2 border border-brand-secondary-3 rounded-md shadow-sm focus:border-black focus:ring-black sm:text-sm"
												placeholder="Enter brand name"
											/>
										</div>
									</div>

									{/* Form Actions */}
									<div className="flex justify-end space-x-4 pt-6 border-t border-brand-secondary-3">
										<button
											type="button"
											onClick={onClose}
											className="px-6 py-2 border border-brand-secondary-3 rounded-md text-sm font-medium text-brand-primary-1 bg-white hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={isPending || !formData.name.trim()}
											className="px-6 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-black hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isPending
												? mode === "create"
													? "Adding..."
													: "Saving..."
												: mode === "create"
													? "Add Brand"
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
