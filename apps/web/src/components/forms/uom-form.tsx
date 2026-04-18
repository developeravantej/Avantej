import { useEffect, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { toast } from "sonner";

export interface UomFormData {
	name: string;
	description?: string;
	baseUomId?: string;
	conversionFactor?: string;
}

interface UomFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	mode?: "create" | "edit";
	initialData?: UomFormData & { id: string };
	onSubmit: (data: UomFormData) => void;
	isLoading?: boolean;
	/** Optional list of base UOMs for the baseUomId selector */
	baseUoms?: { id: string; name: string }[];
}

export function UomFormDialog({
	isOpen,
	onClose,
	mode = "create",
	initialData,
	onSubmit,
	isLoading,
	baseUoms,
}: UomFormDialogProps) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [baseUomId, setBaseUomId] = useState("");
	const [conversionFactor, setConversionFactor] = useState("");

	useEffect(() => {
		if (isOpen) {
			setName(initialData?.name ?? "");
			setDescription(initialData?.description ?? "");
			setBaseUomId(initialData?.baseUomId ?? "");
			setConversionFactor(initialData?.conversionFactor ?? "");
		}
	}, [isOpen, initialData]);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		onSubmit({
			name: name.trim(),
			description: description.trim() || undefined,
			baseUomId: baseUomId || undefined,
			conversionFactor: conversionFactor || undefined,
		});
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
									{mode === "create" ? "Add New UoM" : "Edit UoM"}
								</Dialog.Title>

								<form onSubmit={handleSubmit} className="space-y-4">
									<div>
										<label
											htmlFor="uom-name"
											className="block text-sm font-medium text-brand-primary-1"
										>
											Name *
										</label>
										<input
											id="uom-name"
											type="text"
											placeholder="e.g., Piece, Kilogram"
											value={name}
											onChange={(e) => setName(e.target.value)}
											required
											className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
										/>
									</div>

									<div>
										<label
											htmlFor="uom-description"
											className="block text-sm font-medium text-brand-primary-1"
										>
											Description
										</label>
										<textarea
											id="uom-description"
											placeholder="Optional description for this UoM"
											value={description}
											onChange={(e) => setDescription(e.target.value)}
											rows={3}
											className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
										/>
									</div>

									{baseUoms && baseUoms.length > 0 && (
										<div>
											<label
												htmlFor="uom-base"
												className="block text-sm font-medium text-brand-primary-1"
											>
												Base UoM (optional)
											</label>
											<select
												id="uom-base"
												value={baseUomId}
												onChange={(e) => setBaseUomId(e.target.value)}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											>
												<option value="">None (this is a base UoM)</option>
												{baseUoms.map((u) => (
													<option key={u.id} value={u.id}>
														{u.name}
													</option>
												))}
											</select>
										</div>
									)}

									{baseUomId && (
										<div>
											<label
												htmlFor="uom-factor"
												className="block text-sm font-medium text-brand-primary-1"
											>
												Conversion Factor
											</label>
											<input
												id="uom-factor"
												type="number"
												step="any"
												min="0"
												placeholder="e.g., 1000"
												value={conversionFactor}
												onChange={(e) => setConversionFactor(e.target.value)}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											/>
										</div>
									)}

									<div className="mt-6 flex justify-end space-x-3">
										<button
											type="button"
											onClick={onClose}
											disabled={isLoading}
											className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={isLoading || !name.trim()}
											className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isLoading
												? mode === "create"
													? "Adding..."
													: "Saving..."
												: mode === "create"
													? "Add UoM"
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
