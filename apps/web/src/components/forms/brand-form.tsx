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

const brandFormSchema = z.object({
	name: z
		.string()
		.min(1, "Brand name is required")
		.max(100, "Name must be 100 characters or fewer"),
});

type BrandFormValues = z.infer<typeof brandFormSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

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

	const form = useForm({
		defaultValues: { name: initialData?.name ?? "" } as BrandFormValues,
		validators: { onSubmit: brandFormSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset (isOpen toggles externally), not a user event
	useEffect(() => {
		if (isOpen) form.reset({ name: initialData?.name ?? "" });
	}, [isOpen, initialData, form]);

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

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Brand Name <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									placeholder="Enter brand name"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

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
			</DialogContent>
		</Dialog>
	);
}
