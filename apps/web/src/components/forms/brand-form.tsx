/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
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
	DialogDescription,
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
const brandFormSchema = z.object({
	name: z
		.string()
		.min(1, "Brand name is required")
		.max(100, "Name must be 100 characters or fewer"),
});

type BrandFormValues = z.infer<typeof brandFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
interface BrandFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: { id?: string; name?: string };
}

export function BrandFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
}: BrandFormDialogProps) {
	// 3. Form instance
	const form = useForm<BrandFormValues>({
		resolver: zodResolver(brandFormSchema),
		defaultValues: { name: initialData?.name ?? "" },
	});

	// 4. Reset on dialog re-open with fresh initialData
	useEffect(() => {
		if (isOpen) form.reset({ name: initialData?.name ?? "" });
	}, [isOpen, initialData, form]);

	// 5. Mutation — isPending drives submit state
	const mutation = useApiMutation({
		mutationFn: (values: BrandFormValues) =>
			mode === "create"
				? client.brands.create({ organizationId, ...values })
				: client.brands.update({
						organizationId,
						id: initialData!.id!,
						...values,
					}),
		successMessage: mode === "create" ? "Brand created" : "Brand updated",
		errorMessage: (err) => err.message || "Failed to save brand",
		invalidate: [orpc.brands.list.key()],
		onSuccess: () => onClose(),
	});

	// 6. Submit handler
	const onSubmit = (values: BrandFormValues) => mutation.mutate(values);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add Brand" : "Edit Brand"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new brand for your product catalog."
							: "Update the brand details."}
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Brand Name{" "}
										<span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input placeholder="Enter brand name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
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
										? "Add Brand"
										: "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
