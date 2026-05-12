/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Email/URL use z.union([z.string().email/url(), z.literal("")]).optional() for empty-string compat
 * - Error display: inline <FormMessage> + toast on mutation error
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Form } from "@/components/ui/form";
import {
	SupplierContactSection,
	SupplierDetailsSection,
} from "./supplier-form-sections";

// 1. Schema — colocated, defines UI shape + validation. Server validates separately.
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

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
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
	// 3. Form instance
	const form = useForm<SupplierFormValues>({
		resolver: zodResolver(supplierFormSchema),
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
		},
	});

	// 4. Reset on dialog re-open with fresh initialData
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

	// 5. Mutation — isPending drives submit state
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

	// 6. Submit handler
	const onSubmit = (values: SupplierFormValues) => mutation.mutate(values);

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

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<SupplierDetailsSection form={form} inputClass={inputClass} />

						<SupplierContactSection form={form} inputClass={inputClass} />

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
				</Form>
			</DialogContent>
		</Dialog>
	);
}
