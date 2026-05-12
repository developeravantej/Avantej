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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

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
						{/* Supplier Details Section */}
						<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
							<h4 className="text-md font-medium text-brand-primary-1 mb-2">
								Supplier Details
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Supplier Name{" "}
												<span className="text-destructive">*</span>
											</FormLabel>
											<FormControl>
												<Input
													placeholder="EG: THE BODY SHOP"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="description"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Supplier Description
											</FormLabel>
											<FormControl>
												<Input
													placeholder="EG: SUPPLY LOTION"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="accountNumber"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Account Number
											</FormLabel>
											<FormControl>
												<Input
													placeholder="888888888888 (BANK)"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="paymentTerms"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Payment Terms
											</FormLabel>
											<FormControl>
												<Input
													placeholder="EG: 30 days"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="barcode"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Barcode
											</FormLabel>
											<FormControl>
												<Input
													placeholder="EG: 1234567890"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="isActive"
									render={({ field }) => (
										<FormItem className="flex items-center gap-2 pt-2">
											<FormControl>
												<Checkbox
													checked={field.value}
													onCheckedChange={field.onChange}
													id="isActive"
												/>
											</FormControl>
											<FormLabel
												htmlFor="isActive"
												className="ml-2 block text-sm text-brand-primary-1 !mt-0 cursor-pointer"
											>
												Active
											</FormLabel>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>

						{/* Contact Information Section */}
						<div className="bg-brand-secondary-3/50 p-4 rounded-lg">
							<h4 className="text-md font-medium text-brand-primary-1 mb-2">
								Contact Information
							</h4>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="contactPerson"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Contact Person
											</FormLabel>
											<FormControl>
												<Input
													placeholder="EG: JONATHAN MORRISON"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="contactPhone"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Mobile Number
											</FormLabel>
											<FormControl>
												<Input
													type="tel"
													placeholder="+60 12-345 6789"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="officePhone"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Office Phone
											</FormLabel>
											<FormControl>
												<Input
													type="tel"
													placeholder="+60 3-1234 5678"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="email"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												E-Mail
											</FormLabel>
											<FormControl>
												<Input
													type="email"
													placeholder="EG: SUPPLIER@EXAMPLE.COM"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="website"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="block text-sm font-medium text-brand-primary-1">
												Website
											</FormLabel>
											<FormControl>
												<Input
													type="url"
													placeholder="EG: https://www.example.com"
													className={inputClass}
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>

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
