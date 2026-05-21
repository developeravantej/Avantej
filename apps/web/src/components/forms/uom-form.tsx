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
import { Textarea } from "@/components/ui/textarea";

const uomFormSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be 100 characters or fewer"),
	description: z.string().optional(),
});

type UomFormValues = z.infer<typeof uomFormSchema>;

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

interface UomFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: { id?: string; name?: string; description?: string | null };
}

export function UomFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode,
	initialData,
}: UomFormDialogProps) {
	const mutation = useApiMutation({
		mutationFn: (values: UomFormValues) =>
			mode === "create"
				? client.unitsOfMeasure.create({
						organizationId,
						name: values.name,
						description: values.description || undefined,
					})
				: client.unitsOfMeasure.update({
						organizationId,
						id: initialData!.id!,
						name: values.name,
						description: values.description || undefined,
					}),
		successMessage:
			mode === "create" ? "Unit of measure created" : "Unit of measure updated",
		errorMessage: (err) => err.message || "Failed to save unit of measure",
		invalidate: [orpc.unitsOfMeasure.list.key()],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: {
			name: initialData?.name ?? "",
			description: initialData?.description ?? "",
		} as UomFormValues,
		validators: { onSubmit: uomFormSchema },
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
			});
		}
	}, [isOpen, initialData, form]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Add New UoM" : "Edit UoM"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new unit of measure."
							: "Update the unit of measure details."}
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
									Name <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									placeholder="e.g., Piece, Kilogram"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					<form.Field name="description">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Description</Label>
								<Textarea
									id={field.name}
									placeholder="Optional description for this UoM"
									rows={3}
									value={field.state.value ?? ""}
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
									? "Add UoM"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
