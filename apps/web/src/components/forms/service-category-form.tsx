/**
 * Canonical form shape (TanStack Form):
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Config fields (duration, maxAttendees, rules) submitted alongside basic fields in a single
 *   onSubmit handler that calls serviceCategories.create/update then serviceCategoryConfig.upsert
 */

import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	ServiceCategoryRulesSection,
	type ServiceCategoryRulesFormApi,
} from "./service-category-rules-section";
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

const serviceCategoryFormSchema = z.object({
	name: z
		.string()
		.min(1, "Service category name is required")
		.max(100, "Name must be 100 characters or fewer"),
	duration: z
		.number({ message: "Duration must be a number" })
		.min(0, "Duration must be 0 or more"),
	maxAttendees: z
		.number({ message: "Must be a number" })
		.min(1, "Must be at least 1")
		.optional(),
	requireAdvanceBooking: z.boolean(),
	minAdvanceHours: z.number().min(0),
	enableCancellationWindow: z.boolean(),
	cancellationCutoffHours: z.number().min(0),
	bufferTimeMinutes: z.number().min(0).max(480),
});

type ServiceCategoryFormValues = z.infer<typeof serviceCategoryFormSchema>;

interface ServiceFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode?: "create" | "edit";
	initialData?: {
		id: string;
		name: string;
		duration?: number;
		maxAttendees?: number;
		rules?: {
			requireAdvanceBooking: boolean;
			minAdvanceHours: number;
			enableCancellationWindow: boolean;
			cancellationCutoffHours: number;
			bufferTimeMinutes: number;
		};
	};
}

function buildDefaultValues(
	initialData: ServiceFormDialogProps["initialData"],
): ServiceCategoryFormValues {
	return {
		name: initialData?.name ?? "",
		duration: initialData?.duration ?? 0,
		maxAttendees: initialData?.maxAttendees,
		requireAdvanceBooking: initialData?.rules?.requireAdvanceBooking ?? false,
		minAdvanceHours: initialData?.rules?.minAdvanceHours ?? 0,
		enableCancellationWindow:
			initialData?.rules?.enableCancellationWindow ?? false,
		cancellationCutoffHours: initialData?.rules?.cancellationCutoffHours ?? 0,
		bufferTimeMinutes: initialData?.rules?.bufferTimeMinutes ?? 0,
	};
}

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

export function ServiceFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	const mutation = useApiMutation({
		mutationFn: async (values: ServiceCategoryFormValues) => {
			let categoryId: string;

			if (mode === "edit" && initialData?.id) {
				await client.serviceCategories.update({
					organizationId,
					id: initialData.id,
					name: values.name,
				});
				categoryId = initialData.id;
			} else {
				const result = await client.serviceCategories.create({
					organizationId,
					name: values.name,
					description: null,
					displayOrder: 0,
					isActive: true,
				});
				categoryId = (result as { id: string }).id;
			}

			await client.serviceCategoryConfig.upsert({
				organizationId,
				categoryId,
				defaultDuration: values.duration,
				defaultMaxAttendees: values.maxAttendees ?? 1,
				requireAdvanceBooking: values.requireAdvanceBooking,
				minAdvanceHours: values.requireAdvanceBooking
					? values.minAdvanceHours
					: null,
				enableCancellationWindow: values.enableCancellationWindow,
				cancellationCutoffHours: values.enableCancellationWindow
					? values.cancellationCutoffHours
					: null,
				bufferTimeMinutes: values.bufferTimeMinutes,
			});
		},
		successMessage:
			mode === "create"
				? "Service category created"
				: "Service category updated",
		errorMessage: (err) => err.message || "Failed to save service category",
		invalidate: [
			orpc.serviceCategories.list.key(),
			orpc.serviceCategoryConfig.getByCategoryId.key(),
		],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: buildDefaultValues(initialData),
		validators: { onSubmit: serviceCategoryFormSchema },
		onSubmit: async ({ value }) => {
			await mutation.mutateAsync(value);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-heading text-2xl">
						{mode === "create"
							? "Add New Service Category"
							: "Edit Service Category"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Create a new service category with booking and cancellation rules."
							: "Update the service category details and rules."}
					</DialogDescription>
				</DialogHeader>

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-6"
				>
					{/* Name */}
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Service Category Name{" "}
									<span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									className="bg-white"
									placeholder="e.g., Personal Training (1-on-1)"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					{/* Duration + Max Attendees */}
					<div className="grid grid-cols-2 gap-4">
						<form.Field name="duration">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Duration (minutes){" "}
										<span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										type="number"
										min={0}
										placeholder="60"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(e.target.valueAsNumber || 0)
										}
									/>
									<p className="text-xs invisible" aria-hidden="true">
										spacer
									</p>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="maxAttendees">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Maximum Attendees/Customers
									</Label>
									<Input
										id={field.name}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										type="number"
										min={1}
										placeholder="No limit"
										value={field.state.value ?? ""}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(
												e.target.value === ""
													? undefined
													: Number(e.target.value),
											)
										}
									/>
									<p className="text-xs text-muted-foreground">
										Leave empty for unlimited attendees
									</p>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</div>

					<form.Subscribe
						selector={(state) => ({
							require: state.values.requireAdvanceBooking,
							cancel: state.values.enableCancellationWindow,
						})}
					>
						{({ require, cancel }) => (
							<ServiceCategoryRulesSection
								form={form as unknown as ServiceCategoryRulesFormApi}
								requireAdvanceBooking={require}
								enableCancellationWindow={cancel}
							/>
						)}
					</form.Subscribe>

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
									? "Creating..."
									: "Saving..."
								: mode === "create"
									? "Create Service Category"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
