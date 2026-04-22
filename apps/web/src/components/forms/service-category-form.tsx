import { Dialog, Transition } from '@headlessui/react';
import { Fragment, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orpc, client } from '@/utils/orpc';
import { useUserContext } from '@/hooks/useUserContext';
import { toast } from 'sonner';

interface ServiceFormData {
	name: string;
	duration: number;
	maxAttendees?: number;
	rules?: {
		requireAdvanceBooking: boolean;
		minAdvanceHours: number; // hours before start to allow booking
		enableCancellationWindow: boolean;
		cancellationCutoffHours: number; // hours before start to allow cancel
		bufferTimeMinutes: number; // minutes required between consecutive bookings
	};
}

interface ServiceFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (data: ServiceFormData, serviceId?: string) => Promise<void>;
	initialData?: ServiceFormData & { id: string };
	mode?: 'create' | 'edit';
}

export function ServiceFormDialog({ isOpen, onClose, onSubmit, initialData, mode = 'create' }: ServiceFormDialogProps) {
	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	const [formData, setFormData] = useState<ServiceFormData>({
		name: '',
		duration: 0,
		maxAttendees: undefined,
		rules: {
			requireAdvanceBooking: false,
			minAdvanceHours: 0,
			enableCancellationWindow: false,
			cancellationCutoffHours: 0,
			bufferTimeMinutes: 0,
		},
	});

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (initialData) {
			setFormData({
				name: initialData.name,
				duration: initialData.duration,
				maxAttendees: initialData.maxAttendees,
				rules: initialData.rules ? {
					requireAdvanceBooking: initialData.rules.requireAdvanceBooking,
					minAdvanceHours: initialData.rules.minAdvanceHours,
					enableCancellationWindow: initialData.rules.enableCancellationWindow,
					cancellationCutoffHours: initialData.rules.cancellationCutoffHours,
					bufferTimeMinutes: initialData.rules.bufferTimeMinutes ?? 0,
				} : {
					requireAdvanceBooking: false,
					minAdvanceHours: 0,
					enableCancellationWindow: false,
					cancellationCutoffHours: 0,
					bufferTimeMinutes: 0,
				},
			});
		} else {
			// Reset form data when no initial data (create mode or dialog closed)
			setFormData({
				name: '',
				duration: 0,
				maxAttendees: 1,
				rules: {
					requireAdvanceBooking: false,
					minAdvanceHours: 0,
					enableCancellationWindow: false,
					cancellationCutoffHours: 0,
					bufferTimeMinutes: 0,
				},
			});
		}
	}, [initialData, mode]);

	const qc = useQueryClient();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!organizationId) {
			setError('User must be part of an organization');
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			// Step 1: Create or update the service category
			let categoryId: string;
			if (mode === 'edit' && initialData?.id) {
				await client.serviceCategories.update({
					organizationId,
					id: initialData.id,
					name: formData.name,
					description: null,
					displayOrder: 0,
					isActive: true,
				});
				categoryId = initialData.id;
			} else {
				const categoryResult = await client.serviceCategories.create({
					organizationId,
					name: formData.name,
					description: null,
					displayOrder: 0,
					isActive: true,
				});
				categoryId = (categoryResult as any).id;
			}

			// Step 2: Upsert category-level config (rules only)
			await client.serviceCategoryConfig.upsert({
				organizationId,
				categoryId,
				defaultDuration: formData.duration,
				defaultMaxAttendees: formData.maxAttendees ?? 1,
				requireAdvanceBooking: formData.rules?.requireAdvanceBooking ?? false,
				minAdvanceHours: formData.rules?.requireAdvanceBooking
					? formData.rules.minAdvanceHours ?? null
					: null,
				enableCancellationWindow: formData.rules?.enableCancellationWindow ?? false,
				cancellationCutoffHours: formData.rules?.enableCancellationWindow
					? formData.rules.cancellationCutoffHours ?? null
					: null,
				bufferTimeMinutes: formData.rules?.bufferTimeMinutes ?? 0,
			});

			// Invalidate relevant queries
			qc.invalidateQueries({ queryKey: orpc.serviceCategories.list.key() });

			toast.success(`Service category ${mode === 'create' ? 'created' : 'updated'} successfully`);

			// Call the onSubmit callback for parent component to refresh data
			await onSubmit(formData, categoryId);
			onClose();
		} catch (err: any) {
			const errorMessage = err?.message || err?.detail || 'An error occurred while saving';
			setError(errorMessage);
			toast.error(errorMessage);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
		const { name, value, type } = e.target;

		setFormData(prev => {
			// Handle nested object paths (e.g., 'rules.requireAdvanceBooking')
			const path = name.split('.');
			const newData = { ...prev };

			// Handle top-level fields that don't have dots
			if (path.length === 1) {
				const fieldName = path[0];
				if (fieldName === 'maxAttendees') {
					newData.maxAttendees = value === '' ? undefined : (type === 'number' ? parseFloat(value) || undefined : undefined);
					return newData;
				}
			}

			let current: any = newData;
			for (let i = 0; i < path.length - 1; i++) {
				if (!(path[i] in current)) {
					current[path[i]] = {};
				}
				current = current[path[i]];
			}

			const lastKey = path[path.length - 1];
			current[lastKey] = type === 'number' ? parseFloat(value) || 0 : value;

			return newData;
		});
	};

	return (
		<Fragment>
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
							<Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
								<Dialog.Title
									as="h1"
									className="text-lg font-medium leading-6 text-brand-primary-1 mb-4"
								>
									{mode === 'create' ? 'Add New Service Category' : 'Edit Service Category'}
								</Dialog.Title>

								{error && (
									<div className="mb-4 p-2 text-red-700 bg-red-100 rounded">
										{error}
									</div>
								)}

								<form onSubmit={handleSubmit} className="space-y-4">

									<div>
										<label htmlFor="name" className="block text-sm font-medium text-brand-primary-1">
											Service Category Name *
										</label>
										<input
											type="text"
											name="name"
											id="name"
											required
											placeholder="e.g., Personal Training (1-on-1)"
											value={formData.name}
											onChange={handleChange}
											className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
										/>
									</div>

									<div className="grid grid-cols-2 gap-4">
										<div>
											<label htmlFor="duration" className="block text-sm font-medium text-brand-primary-1">
												Duration (minutes) *
											</label>
											<input
												type="number"
												name="duration"
												id="duration"
												required
												min="0"
												value={formData.duration}
												onChange={handleChange}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											/>
										</div>
										<div>
											<label htmlFor="maxAttendees" className="block text-sm font-medium text-brand-primary-1">
												Maximum Attendees/Customers
											</label>
											<input
												type="number"
												name="maxAttendees"
												id="maxAttendees"
												min="1"
												placeholder="No limit"
												value={formData.maxAttendees || ''}
												onChange={handleChange}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											/>
											<p className="text-xs text-brand-secondary-1 mt-1">
												Leave empty for unlimited attendees
											</p>
										</div>
									</div>

									{/* Booking & Cancellation Rules */}
									<div className="bg-white border border-brand-secondary-3 rounded-md p-4">
										<h5 className="text-sm font-medium text-brand-primary-1 mb-3">Booking & Cancellation Rules</h5>
										<div className="grid grid-cols-2 gap-4">
											<div className="flex items-center gap-2">
												<input
													type="checkbox"
													id="requireAdvanceBooking"
													name="rules.requireAdvanceBooking"
													checked={formData.rules?.requireAdvanceBooking || false}
													onChange={(e) => handleChange({
														...e,
														target: { ...e.target, name: 'rules.requireAdvanceBooking', value: (e.target as HTMLInputElement).checked, type: 'checkbox' }
													} as any)}
													className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3 rounded"
												/>
												<label htmlFor="requireAdvanceBooking" className="text-sm text-brand-primary-1">Require advance booking</label>
											</div>
											<div className="flex items-center gap-2">
												<input
													type="checkbox"
													id="enableCancellationWindow"
													name="rules.enableCancellationWindow"
													checked={formData.rules?.enableCancellationWindow || false}
													onChange={(e) => handleChange({
														...e,
														target: { ...e.target, name: 'rules.enableCancellationWindow', value: (e.target as HTMLInputElement).checked, type: 'checkbox' }
													} as any)}
													className="h-4 w-4 text-black focus:ring-black border-brand-secondary-3 rounded"
												/>
												<label htmlFor="enableCancellationWindow" className="text-sm text-brand-primary-1">Enable cancellation window</label>
											</div>
										</div>
										<div className="grid grid-cols-2 gap-4 mt-3">
											<div>
												<label htmlFor="minAdvanceHours" className="block text-sm font-medium text-brand-primary-1">
													Min advance booking (hours)
												</label>
												<input
													type="number"
													id="minAdvanceHours"
													name="rules.minAdvanceHours"
													min="0"
													value={formData.rules?.minAdvanceHours ?? 0}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:bg-brand-secondary-3 disabled:cursor-not-allowed"
													disabled={!formData.rules?.requireAdvanceBooking}
													placeholder={formData.rules?.requireAdvanceBooking ? undefined : "Not required"}
												/>
											</div>
											<div>
												<label htmlFor="cancellationCutoffHours" className="block text-sm font-medium text-brand-primary-1">
													Cancellation cutoff (hours)
												</label>
												<input
													type="number"
													id="cancellationCutoffHours"
													name="rules.cancellationCutoffHours"
													min="0"
													value={formData.rules?.cancellationCutoffHours ?? 0}
													onChange={handleChange}
													className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm disabled:bg-brand-secondary-3 disabled:cursor-not-allowed"
													disabled={!formData.rules?.enableCancellationWindow}
													placeholder={formData.rules?.enableCancellationWindow ? undefined : "Not required"}
												/>
											</div>
										</div>
										<div className="mt-3">
											<label htmlFor="bufferTimeMinutes" className="block text-sm font-medium text-brand-primary-1">
												Buffer Time (minutes)
											</label>
											<input
												type="number"
												id="bufferTimeMinutes"
												name="rules.bufferTimeMinutes"
												min="0"
												max="480"
												value={formData.rules?.bufferTimeMinutes ?? 0}
												onChange={handleChange}
												className="mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm"
											/>
											<p className="text-xs text-brand-secondary-1 mt-1">
												Minutes required between consecutive bookings for services in this category
											</p>
										</div>
									</div>

									<div className="mt-6 flex justify-between space-x-3">
										<button
											type="button"
											onClick={onClose}
											className="inline-flex justify-center rounded-md border border-brand-secondary-3 bg-white px-4 py-2 text-sm font-medium text-brand-primary-1 shadow-sm hover:bg-brand-secondary-3/50 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2"
										>
											Cancel
										</button>
										<button
											type="submit"
											disabled={isSubmitting}
											className="inline-flex justify-center rounded-md border border-transparent bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-black/90 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isSubmitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : (mode === 'create' ? 'Create Service Category' : 'Save Changes')}
										</button>
									</div>
								</form>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
		</Fragment>
	);
}
