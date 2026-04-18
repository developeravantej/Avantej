import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useEffect, useState } from "react";

export interface SupplierFormData {
	name: string;
	description?: string;
	accountNumber?: string;
	paymentTerms?: string;
	contactPerson?: string;
	contactPhone?: string;
	officePhone?: string;
	email?: string;
	website?: string;
	barcode?: string;
	isActive?: boolean;
}

interface SupplierFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess?: () => void;
	initialData?: SupplierFormData & { id: string };
	mode?: "create" | "edit";
	onSubmit?: (data: SupplierFormData, id?: string) => Promise<void> | void;
	isLoading?: boolean;
}

export function SupplierFormDialog({
	isOpen,
	onClose,
	onSuccess,
	initialData,
	mode = "create",
	onSubmit,
	isLoading = false,
}: SupplierFormDialogProps) {
	const [formData, setFormData] = useState<SupplierFormData>({
		name: "",
		description: "",
		accountNumber: "",
		paymentTerms: "",
		contactPerson: "",
		contactPhone: "",
		officePhone: "",
		email: "",
		website: "",
		barcode: "",
		isActive: true,
	});

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialData) {
			setFormData({
				name: initialData.name,
				description: initialData.description ?? "",
				accountNumber: initialData.accountNumber ?? "",
				paymentTerms: initialData.paymentTerms ?? "",
				contactPerson: initialData.contactPerson ?? "",
				contactPhone: initialData.contactPhone ?? "",
				officePhone: initialData.officePhone ?? "",
				email: initialData.email ?? "",
				website: initialData.website ?? "",
				barcode: initialData.barcode ?? "",
				isActive: initialData.isActive ?? true,
			});
		} else {
			setFormData({
				name: "",
				description: "",
				accountNumber: "",
				paymentTerms: "",
				contactPerson: "",
				contactPhone: "",
				officePhone: "",
				email: "",
				website: "",
				barcode: "",
				isActive: true,
			});
		}
	}, [initialData, isOpen]);

	if (!isOpen) return null;

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>
	) => {
		const { name, value, type } = e.target;
		if (type === "checkbox") {
			const checked = (e.target as HTMLInputElement).checked;
			setFormData((prev) => ({ ...prev, [name]: checked }));
		} else {
			setFormData((prev) => ({ ...prev, [name]: value }));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setIsSubmitting(true);
		try {
			if (onSubmit) await onSubmit(formData, initialData?.id);
			onSuccess?.();
			onClose();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to save supplier"
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const busy = isSubmitting || isLoading;

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
							<Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
								<Dialog.Title
									as="h1"
									className="text-lg font-medium leading-6 text-brand-primary-1 mb-4"
								>
									{mode === "create" ? "Add Supplier" : "Edit Supplier"}
								</Dialog.Title>

								{error && (
									<div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
										{error}
									</div>
								)}

								<form onSubmit={handleSubmit} className="space-y-4">
									{/* Supplier Details Section */}
									<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
										<h4 className="text-md font-medium text-brand-primary-1 mb-2">
											Supplier Details
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<label
													htmlFor="name"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Supplier Name *
												</label>
												<input
													id="name"
													name="name"
													type="text"
													required
													value={formData.name}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: THE BODY SHOP"
												/>
											</div>

											<div>
												<label
													htmlFor="description"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Supplier Description
												</label>
												<input
													id="description"
													name="description"
													type="text"
													value={formData.description}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: SUPPLY LOTION"
												/>
											</div>

											<div>
												<label
													htmlFor="accountNumber"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Account Number
												</label>
												<input
													id="accountNumber"
													name="accountNumber"
													type="text"
													value={formData.accountNumber}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="888888888888 (BANK)"
												/>
											</div>

											<div>
												<label
													htmlFor="paymentTerms"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Payment Terms
												</label>
												<input
													id="paymentTerms"
													name="paymentTerms"
													type="text"
													value={formData.paymentTerms}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: 30 days"
												/>
											</div>

											<div>
												<label
													htmlFor="barcode"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Barcode
												</label>
												<input
													id="barcode"
													name="barcode"
													type="text"
													value={formData.barcode}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: 1234567890"
												/>
											</div>

											<div className="flex items-center gap-2 pt-2">
												<input
													id="isActive"
													name="isActive"
													type="checkbox"
													checked={formData.isActive ?? true}
													onChange={handleChange}
													className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3 rounded"
												/>
												<label
													htmlFor="isActive"
													className="ml-2 block text-sm text-brand-primary-1"
												>
													Active
												</label>
											</div>
										</div>
									</div>

									{/* Contact Information Section */}
									<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
										<h4 className="text-md font-medium text-brand-primary-1 mb-2">
											Contact Information
										</h4>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<label
													htmlFor="contactPerson"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Contact Person
												</label>
												<input
													id="contactPerson"
													name="contactPerson"
													type="text"
													value={formData.contactPerson}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: JONATHAN MORRISON"
												/>
											</div>

											<div>
												<label
													htmlFor="contactPhone"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Mobile Number
												</label>
												<input
													id="contactPhone"
													name="contactPhone"
													type="tel"
													value={formData.contactPhone}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="+60 12-345 6789"
												/>
											</div>

											<div>
												<label
													htmlFor="officePhone"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Office Phone
												</label>
												<input
													id="officePhone"
													name="officePhone"
													type="tel"
													value={formData.officePhone}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="+60 3-1234 5678"
												/>
											</div>

											<div>
												<label
													htmlFor="email"
													className="block text-sm font-medium text-brand-primary-1"
												>
													E-Mail
												</label>
												<input
													id="email"
													name="email"
													type="email"
													value={formData.email}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: SUPPLIER@EXAMPLE.COM"
												/>
											</div>

											<div>
												<label
													htmlFor="website"
													className="block text-sm font-medium text-brand-primary-1"
												>
													Website
												</label>
												<input
													id="website"
													name="website"
													type="url"
													value={formData.website}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
													placeholder="EG: https://www.example.com"
												/>
											</div>
										</div>
									</div>

									{/* Form Actions */}
									<div className="mt-6 flex justify-end space-x-3">
										<button
											type="button"
											onClick={onClose}
											disabled={busy}
											className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={busy || !formData.name}
											className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{busy
												? mode === "create"
													? "Adding..."
													: "Saving..."
												: mode === "create"
													? "Add Supplier"
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
