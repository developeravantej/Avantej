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
import { Textarea } from "@/components/ui/textarea";

// 1. Schema — colocated, defines UI shape + validation. Server validates separately.
const uomFormSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(100, "Name must be 100 characters or fewer"),
	description: z.string().optional(),
});

type UomFormValues = z.infer<typeof uomFormSchema>;

// 2. Props — organizationId is a prop, NOT a form field
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
	// 3. Form instance
	const form = useForm<UomFormValues>({
		resolver: zodResolver(uomFormSchema),
		defaultValues: {
			name: initialData?.name ?? "",
			description: initialData?.description ?? "",
		},
	});

	// 4. Reset on dialog re-open with fresh initialData
	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) {
			form.reset({
				name: initialData?.name ?? "",
				description: initialData?.description ?? "",
			});
		}
	}, [isOpen, initialData, form]);

	// 5. Mutation — isPending drives submit state
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

	// 6. Submit handler
	const onSubmit = (values: UomFormValues) => mutation.mutate(values);

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

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Name <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input placeholder="e.g., Piece, Kilogram" {...field} />
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
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="Optional description for this UoM"
											rows={3}
											{...field}
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
										? "Add UoM"
										: "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
