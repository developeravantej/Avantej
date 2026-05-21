/**
 * Canonical form shape (TanStack Form):
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Email/URL use z.union([z.string().email/url(), z.literal("")]).optional() for empty-string compat
 * - Error display: inline field errors + toast on mutation error
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	SupplierContactSection,
	SupplierDetailsSection,
	type SupplierFormApi,
} from "./supplier-form-sections";

const supplierFormSchema = z.object({
	name: z
		.string()
		.min(1, "Supplier name is required")
		.max(100, "Name must be 100 characters or fewer"),
	description: z.string().optional(),
	accountNumber: z.string().optional(),
	paymentTerms: z.string().optional(),
	contactPerson: z.string().optional(),
	contactPhone: z.string().optional(),
	officePhone: z.string().optional(),
	email: z
		.union([z.string().email("Invalid email address"), z.literal("")])
		.optional(),
	website: z
		.union([z.string().url("Invalid URL (include https://)"), z.literal("")])
		.optional(),
	barcode: z.string().optional(),
	isActive: z.boolean(),
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

interface SupplierFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: {
		id?: string;
		name?: string;
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
	};
}

export function SupplierFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
}: SupplierFormDialogProps) {
	const mutation = useApiMutation({
		mutationFn: (values: SupplierFormValues) =>
			mode === "create"
				? client.suppliers.create({ organizationId, ...values })
				: client.suppliers.update({
						organizationId,
						id: initialData!.id!,
						...values,
					}),
		successMessage:
			mode === "create" ? "Supplier created" : "Supplier updated",
		errorMessage: (err) => err.message || "Failed to save supplier",
		invalidate: [orpc.suppliers.list.key()],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: {
			name: initialData?.name ?? "",
			description: initialData?.description ?? "",
			accountNumber: initialData?.accountNumber ?? "",
			paymentTerms: initialData?.paymentTerms ?? "",
			contactPerson: initialData?.contactPerson ?? "",
			contactPhone: initialData?.contactPhone ?? "",
			officePhone: initialData?.officePhone ?? "",
			email: initialData?.email ?? "",
			website: initialData?.website ?? "",
			barcode: initialData?.barcode ?? "",
			isActive: initialData?.isActive ?? true,
		} as SupplierFormValues,
		validators: { onSubmit: supplierFormSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) {
			form.reset({
				name: initialData?.name ?? "",
				description: initialData?.description ?? "",
				accountNumber: initialData?.accountNumber ?? "",
				paymentTerms: initialData?.paymentTerms ?? "",
				contactPerson: initialData?.contactPerson ?? "",
				contactPhone: initialData?.contactPhone ?? "",
				officePhone: initialData?.officePhone ?? "",
				email: initialData?.email ?? "",
				website: initialData?.website ?? "",
				barcode: initialData?.barcode ?? "",
				isActive: initialData?.isActive ?? true,
			});
		}
	}, [isOpen, initialData, form]);

	const inputClass =
		"mt-1 block w-full p-2 rounded-md border-brand-secondary-3 shadow-sm focus:border-black focus:ring-black sm:text-sm";

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add Supplier" : "Edit Supplier"}
					</DialogTitle>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<SupplierDetailsSection
						form={form as unknown as SupplierFormApi}
						inputClass={inputClass}
					/>

					<SupplierContactSection
						form={form as unknown as SupplierFormApi}
						inputClass={inputClass}
					/>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending
								? mode === "create"
									? "Adding..."
									: "Saving..."
								: mode === "create"
									? "Add Supplier"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
