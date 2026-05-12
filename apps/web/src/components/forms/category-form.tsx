/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
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
const categoryFormSchema = z.object({
	name: z
		.string()
		.min(1, "Category name is required")
		.max(100, "Name must be 100 characters or fewer"),
	externalCode: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
interface CategoryFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: { id?: string; name?: string; externalCode?: string };
}

export function CategoryFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
}: CategoryFormDialogProps) {
	// 3. Form instance
	const form = useForm<CategoryFormValues>({
		resolver: zodResolver(categoryFormSchema),
		defaultValues: {
			name: initialData?.name ?? "",
			externalCode: initialData?.externalCode ?? "",
		},
	});

	// 4. Reset on dialog re-open with fresh initialData
	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen)
			form.reset({
				name: initialData?.name ?? "",
				externalCode: initialData?.externalCode ?? "",
			});
	}, [isOpen, initialData, form]);

	// 5. Mutation — isPending drives submit state
	const mutation = useApiMutation({
		mutationFn: (values: CategoryFormValues) =>
			mode === "create"
				? client.productCategories.create({ organizationId, ...values })
				: client.productCategories.update({
						organizationId,
						id: initialData!.id!,
						...values,
					}),
		successMessage:
			mode === "create" ? "Category created" : "Category updated",
		errorMessage: (err) => err.message || "Failed to save category",
		invalidate: [orpc.productCategories.list.key()],
		onSuccess: () => onClose(),
	});

	// 6. Submit handler
	const onSubmit = (values: CategoryFormValues) => mutation.mutate(values);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add Category" : "Edit Category"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new category for your product catalog."
							: "Update the category details."}
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
										Category Name{" "}
										<span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input placeholder="Enter category name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="externalCode"
							render={({ field }) => (
								<FormItem>
									<FormLabel>External Code</FormLabel>
									<FormControl>
										<Input
											placeholder="Enter external code (optional)"
											{...field}
											value={field.value ?? ""}
										/>
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
										? "Add Category"
										: "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
