/**
 * Canonical form shape (TanStack Form):
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
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
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const categoryFormSchema = z.object({
	name: z
		.string()
		.min(1, "Category name is required")
		.max(100, "Name must be 100 characters or fewer"),
	externalCode: z.string().optional(),
});

type CategoryFormValues = z.infer<typeof categoryFormSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-rose-600">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

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
	const mutation = useApiMutation({
		mutationFn: (values: CategoryFormValues) =>
			mode === "create"
				? client.productCategories.create({ organizationId, ...values })
				: client.productCategories.update({
						organizationId,
						id: initialData!.id!,
						...values,
					}),
		successMessage: mode === "create" ? "Category created" : "Category updated",
		errorMessage: (err) => err.message || "Failed to save category",
		invalidate: [orpc.productCategories.list.key()],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: {
			name: initialData?.name ?? "",
			externalCode: initialData?.externalCode ?? "",
		} as CategoryFormValues,
		validators: { onSubmit: categoryFormSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen)
			form.reset({
				name: initialData?.name ?? "",
				externalCode: initialData?.externalCode ?? "",
			});
	}, [isOpen, initialData, form]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
				hideCloseButton
			>
				<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
					<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
						PRODUCT CATALOG
					</p>
					<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
						{mode === "create" ? "Add Category" : "Edit Category"}
					</DialogTitle>
					<DialogDescription className="text-sm text-[#737373]">
						{mode === "create"
							? "Create a new category for your product catalog."
							: "Update the category details."}
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="px-6 pt-4 pb-2 space-y-4">
						<form.Field name="name">
							{(field) => (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={field.name}>
										Category Name <span className="text-rose-600">*</span>
									</Label>
									<Input
										id={field.name}
										placeholder="Enter category name"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="externalCode">
							{(field) => (
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={field.name}>External Code</Label>
									<Input
										id={field.name}
										placeholder="Enter external code (optional)"
										value={field.state.value ?? ""}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</div>

					<DialogFooter className="px-6 py-4 border-t border-[#e5e5e5] bg-[#fafafa] flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={mutation.isPending}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							disabled={mutation.isPending}
							className="bg-[#0a0a0a] text-white hover:bg-[#262626]"
						>
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
			</DialogContent>
		</Dialog>
	);
}
