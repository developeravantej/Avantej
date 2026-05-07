/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Config fields (duration, maxAttendees, rules) submitted alongside basic fields in a single
 *   onSubmit handler that calls serviceCategories.create/update then serviceCategoryConfig.upsert
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

// 1. Schema — colocated, defines UI shape + validation
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

// 2. Props — organizationId is a prop, NOT a form field
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

export function ServiceFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	// 3. Form instance
	const form = useForm<ServiceCategoryFormValues>({
		resolver: zodResolver(serviceCategoryFormSchema),
		defaultValues: buildDefaultValues(initialData),
	});

	const requireAdvanceBooking = form.watch("requireAdvanceBooking");
	const enableCancellationWindow = form.watch("enableCancellationWindow");

	// 4. Reset on dialog re-open with fresh initialData
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// 5. Mutation — calls serviceCategories.create/update then serviceCategoryConfig.upsert
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


	// 6. Submit handler
	const onSubmit = (values: ServiceCategoryFormValues) =>
		mutation.mutate(values);

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

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						{/* Name */}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Service Category Name{" "}
										<span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input
											className="bg-white"
											placeholder="e.g., Personal Training (1-on-1)"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Duration + Max Attendees */}
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="duration"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Duration (minutes){" "}
											<span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
												type="number"
												min={0}
												placeholder="60"
												{...field}
												onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
											/>
										</FormControl>
										<p
											className="text-xs invisible"
											aria-hidden="true"
										>
											spacer
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="maxAttendees"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Maximum Attendees/Customers</FormLabel>
										<FormControl>
											<Input
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
												type="number"
												min={1}
												placeholder="No limit"
												value={field.value ?? ""}
												onChange={(e) =>
													field.onChange(
														e.target.value === ""
															? undefined
															: Number(e.target.value),
													)
												}
											/>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Leave empty for unlimited attendees
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Booking & Cancellation Rules */}
						<div className="rounded-2xl border border-brand-secondary-3 bg-card p-6">
							<h3 className="mb-4 font-subheading text-base text-foreground">
								Booking &amp; Cancellation Rules
							</h3>

							<div className="grid grid-cols-2 gap-4">
								{/* Require advance booking */}
								<FormField
									control={form.control}
									name="requireAdvanceBooking"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center gap-2 space-y-0">
											<FormControl>
												<Checkbox
													className="bg-white"
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
											<FormLabel className="!mt-0 font-normal">
												Require advance booking
											</FormLabel>
										</FormItem>
									)}
								/>

								{/* Enable cancellation window */}
								<FormField
									control={form.control}
									name="enableCancellationWindow"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center gap-2 space-y-0">
											<FormControl>
												<Checkbox
													className="bg-white"
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
											<FormLabel className="!mt-0 font-normal">
												Enable cancellation window
											</FormLabel>
										</FormItem>
									)}
								/>
							</div>

							<div className="mt-3 grid grid-cols-2 gap-4">
								{/* Min advance booking hours */}
								<FormField
									control={form.control}
									name="minAdvanceHours"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Min advance booking (hours)</FormLabel>
											<FormControl>
												<Input
													className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													type="number"
													min={0}
													disabled={!requireAdvanceBooking}
													placeholder={
														requireAdvanceBooking ? undefined : "Not required"
													}
													{...field}
													onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								{/* Cancellation cutoff hours */}
								<FormField
									control={form.control}
									name="cancellationCutoffHours"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Cancellation cutoff (hours)</FormLabel>
											<FormControl>
												<Input
													className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													type="number"
													min={0}
													disabled={!enableCancellationWindow}
													placeholder={
														enableCancellationWindow ? undefined : "Not required"
													}
													{...field}
													onChange={(e) => field.onChange(e.target.valueAsNumber || 0)}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>

							{/* Buffer time */}
							<div className="mt-3">
								<FormField
									control={form.control}
									name="bufferTimeMinutes"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Buffer Time (minutes)</FormLabel>
											<FormControl>
												<Input className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" type="number" min={0} max={480} {...field} onChange={(e) => field.onChange(e.target.valueAsNumber || 0)} />
											</FormControl>
											<p className="text-xs text-muted-foreground">
												Minutes required between consecutive bookings for
												services in this category
											</p>
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
										? "Creating..."
										: "Saving..."
									: mode === "create"
										? "Create Service Category"
										: "Save Changes"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
