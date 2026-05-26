/**
 * Canonical form shape (TanStack Form):
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 * - timePresetConfig is persisted on the service row as a jsonb column when schedulingType = "class_slot"
 * - schedulingType maps: UI "appointment-based" → wire "appointment"; UI "time-preset" → wire "class_slot"
 * - initialData.price comes in as dollars (data-table pre-divides by 100); zod transform converts to cents on submit
 */

import { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { TimePresetEditor } from "@/features/services/components/TimePresetEditor";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { rmToCents } from "@/lib/money";

// ---------------------------------------------------------------------------
// 1. Schemas
// ---------------------------------------------------------------------------

const timePresetConfigSchema = z.object({
	recurringDays: z.array(z.string()).min(1, "Pick at least one day"),
	timeSlotsPerDay: z.record(z.string(), z.array(z.string()).min(1)),
});

const baseServiceFields = z.object({
	name: z
		.string()
		.min(1, "Service name is required")
		.max(200, "Name must be 200 characters or fewer"),
	categoryId: z.string().uuid("Category is required"),
	sessionDurationMinutes: z
		.number()
		.int()
		.min(1, "Duration must be at least 1 minute"),
	maxAttendees: z.number().int().min(1, "Must have at least 1 attendee"),
	price: z
		.number({ message: "Price is required" })
		.min(0, "Price must be 0 or more")
		.transform((v) => rmToCents(v)),
	sessions: z.number().int().min(0, "Sessions cannot be negative"),
	taxable: z.boolean(),
	taxPercentage: z.number().int().min(0).max(100).optional(),
	expirable: z.boolean(),
	duration: z.number().int().min(1).optional(),
	duration_unit: z.enum(["day", "week", "month", "year"]).optional(),
	availablePaymentPlans: z.array(z.string()),
	installmentIntervalDays: z.number().int().min(1).optional(),
	gracePeriodDays: z.number().int().min(0).max(90).nullable().optional(),
});

const serviceFormSchema = baseServiceFields.and(
	z.discriminatedUnion("schedulingType", [
		z.object({ schedulingType: z.literal("appointment-based") }),
		z.object({
			schedulingType: z.literal("time-preset"),
			timePresetConfig: timePresetConfigSchema,
		}),
	]),
);

type ServiceFormInput = z.input<typeof serviceFormSchema>;
type ServiceFormOutput = z.output<typeof serviceFormSchema>;

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

// ---------------------------------------------------------------------------
// 2. Props
// ---------------------------------------------------------------------------

interface ServiceInitialData {
	id: string;
	name: string;
	categoryId: string;
	sessionDurationMinutes: number;
	maxAttendees: number;
	/** Price in dollars (data-table pre-divides by 100) */
	price: number;
	sessions: number;
	taxable: boolean;
	taxPercentage: number;
	expirable: boolean;
	duration: number;
	duration_unit: string;
	schedulingType: "appointment-based" | "time-preset";
	availablePaymentPlans: string[];
	installmentIntervalDays: number;
	gracePeriodDays: number | null;
	timePresetConfig?: {
		recurringDays: string[];
		timeSlotsPerDay: Record<string, string[]>;
	};
}

interface ServiceFormDialogProps {
	isOpen: boolean;
	onClose: () => void;
	organizationId: string;
	mode?: "create" | "edit";
	initialData?: ServiceInitialData;
}

// ---------------------------------------------------------------------------
// 3. Helpers
// ---------------------------------------------------------------------------

function toExpiryDays(duration: number, unit: string): number {
	if (unit === "year") return duration * 365;
	if (unit === "month") return duration * 30;
	if (unit === "week") return duration * 7;
	return duration;
}

function buildDefaultValues(initialData?: ServiceInitialData): ServiceFormInput {
	if (initialData) {
		const base = {
			name: initialData.name,
			categoryId: initialData.categoryId,
			sessionDurationMinutes: initialData.sessionDurationMinutes,
			maxAttendees: initialData.maxAttendees,
			price: initialData.price,
			sessions: initialData.sessions,
			taxable: initialData.taxable,
			taxPercentage: initialData.taxPercentage ?? 6,
			expirable: initialData.expirable,
			duration: initialData.duration ?? 1,
			duration_unit:
				(initialData.duration_unit as "day" | "week" | "month" | "year") ??
				"day",
			availablePaymentPlans: initialData.availablePaymentPlans ?? [],
			installmentIntervalDays: initialData.installmentIntervalDays ?? 30,
			gracePeriodDays: initialData.gracePeriodDays ?? null,
		};
		if (initialData.schedulingType === "time-preset") {
			return {
				...base,
				schedulingType: "time-preset" as const,
				timePresetConfig: initialData.timePresetConfig ?? {
					recurringDays: [],
					timeSlotsPerDay: {},
				},
			};
		}
		return { ...base, schedulingType: "appointment-based" as const };
	}
	return {
		name: "",
		categoryId: "",
		sessionDurationMinutes: 60,
		maxAttendees: 1,
		price: 0,
		sessions: 0,
		taxable: false,
		taxPercentage: 6,
		expirable: false,
		duration: 1,
		duration_unit: "day",
		schedulingType: "appointment-based",
		availablePaymentPlans: [],
		installmentIntervalDays: 30,
		gracePeriodDays: null,
	};
}

// ---------------------------------------------------------------------------
// 4. Component
// ---------------------------------------------------------------------------

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies; extraction deferred
export function ServiceFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	const { data: serviceCategories = [], isLoading: isLoadingCategories } =
		useQuery({
			...orpc.serviceCategories.list.queryOptions({
				input: { organizationId, isActive: true },
			}),
			enabled: isOpen && !!organizationId,
		});

	const { data: activePlans = [] } = useQuery({
		queryKey: ["installmentPlans", organizationId, "active"],
		queryFn: () =>
			client.installmentPlans.list({ organizationId, activeOnly: true }),
		enabled: isOpen && !!organizationId,
	});

	const plansMap = useMemo(
		() => new Map(activePlans.map((p) => [p.code, p])),
		[activePlans],
	);

	const mutation = useApiMutation({
		mutationFn: (values: ServiceFormOutput) => {
			const wireSchedulingType =
				values.schedulingType === "time-preset"
					? ("class_slot" as const)
					: ("appointment" as const);

			const hasInstallmentPlan = values.availablePaymentPlans.some(
				(code) => (plansMap.get(code)?.numInstallments ?? 1) > 1,
			);

			const commonFields = {
				organizationId,
				name: values.name,
				categoryId: values.categoryId || null,
				duration: values.sessionDurationMinutes,
				durationUnitType: "minutes" as const,
				maxAttendees: values.maxAttendees ?? 1,
				attendanceThreshold: null,
				branchId: null,
				isActive: true,
				price: values.price != null ? values.price : null,
				taxable: values.taxable,
				taxPercentage: values.taxable
					? Math.round(values.taxPercentage ?? 0)
					: 0,
				schedulingType: wireSchedulingType,
				sessionCount: values.sessions > 0 ? values.sessions : null,
				expirable: values.expirable,
				expiryDays:
					values.expirable && values.duration
						? toExpiryDays(values.duration, values.duration_unit ?? "day")
						: null,
				availablePaymentPlans:
					values.availablePaymentPlans.length > 0
						? values.availablePaymentPlans
						: undefined,
				installmentIntervalDays: hasInstallmentPlan
					? values.installmentIntervalDays
					: undefined,
				gracePeriodDays: hasInstallmentPlan ? values.gracePeriodDays : null,
				timePresetConfig:
					values.schedulingType === "time-preset" && values.timePresetConfig
						? values.timePresetConfig
						: null,
			};

			if (mode === "edit") {
				return client.services.update({
					...commonFields,
					id: initialData!.id,
				});
			}
			return client.services.create(commonFields);
		},
		successMessage:
			mode === "create"
				? "Service created successfully"
				: "Service updated successfully",
		errorMessage: (err) => err?.message || "Failed to save service",
		invalidate: [orpc.services.list.key()],
		onSuccess: () => onClose(),
	});

	const form = useForm({
		defaultValues: buildDefaultValues(initialData),
		validators: { onSubmit: serviceFormSchema },
		onSubmit: async ({ value }) => {
			const parsed = serviceFormSchema.parse(value);
			await mutation.mutateAsync(parsed);
		},
	});

	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// Time-preset helpers
	function getTimePresetConfig() {
		const values = form.state.values as ServiceFormInput & {
			timePresetConfig?: { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> };
		};
		return (
			values.timePresetConfig ?? { recurringDays: [], timeSlotsPerDay: {} }
		);
	}

	function handleSchedulingTypeChange(
		type: "appointment-based" | "time-preset",
	) {
		form.setFieldValue("schedulingType", type);
		if (type === "appointment-based") {
			form.setFieldValue(
				"timePresetConfig" as never,
				undefined as never,
			);
		} else {
			form.setFieldValue(
				"timePresetConfig" as never,
				{ recurringDays: [], timeSlotsPerDay: {} } as never,
			);
		}
	}

	function handleRecurringDayToggle(day: string) {
		const config = getTimePresetConfig();
		const isSelected = config.recurringDays.includes(day);
		const newDays = isSelected
			? config.recurringDays.filter((d) => d !== day)
			: [...config.recurringDays, day];

		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (!isSelected && !newTimeSlotsPerDay[day]) {
			newTimeSlotsPerDay[day] = ["09:00"];
		} else if (isSelected) {
			delete newTimeSlotsPerDay[day];
		}

		form.setFieldValue(
			"timePresetConfig" as never,
			{ recurringDays: newDays, timeSlotsPerDay: newTimeSlotsPerDay } as never,
		);
	}

	function addTimeSlot(day: string) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (!newTimeSlotsPerDay[day]) newTimeSlotsPerDay[day] = [];
		newTimeSlotsPerDay[day] = [...newTimeSlotsPerDay[day], "09:00"];
		form.setFieldValue(
			"timePresetConfig" as never,
			{ ...config, timeSlotsPerDay: newTimeSlotsPerDay } as never,
		);
	}

	function removeTimeSlot(day: string, index: number) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (newTimeSlotsPerDay[day]) {
			newTimeSlotsPerDay[day] = newTimeSlotsPerDay[day].filter(
				(_, i) => i !== index,
			);
		}
		form.setFieldValue(
			"timePresetConfig" as never,
			{ ...config, timeSlotsPerDay: newTimeSlotsPerDay } as never,
		);
	}

	function updateTimeSlot(day: string, index: number, time: string) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (newTimeSlotsPerDay[day]) {
			const slots = [...newTimeSlotsPerDay[day]];
			slots[index] = time;
			newTimeSlotsPerDay[day] = slots;
		}
		form.setFieldValue(
			"timePresetConfig" as never,
			{ ...config, timeSlotsPerDay: newTimeSlotsPerDay } as never,
		);
	}

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-heading text-2xl">
						{mode === "create" ? "Add New Service" : "Edit Service"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create" ? "Fill in the details to create a new service." : "Update the details for this service."}
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
					{/* Service Name */}
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Service Name <span className="text-destructive">*</span>
								</Label>
								<Input
									id={field.name}
									className="bg-white"
									placeholder="Enter service name"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					{/* Service Category */}
					<form.Field name="categoryId">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>
									Service Category <span className="text-destructive">*</span>
								</Label>
								<select
									id={field.name}
									value={field.state.value}
									onChange={(e) => field.handleChange(e.target.value)}
									onBlur={field.handleBlur}
									disabled={isLoadingCategories}
									className="mt-1 block w-full px-3 py-2 rounded-md border border-input bg-white shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
								>
									<option value="">
										{isLoadingCategories
											? "Loading categories..."
											: "Select a category"}
									</option>
									{serviceCategories.map((category: { id: string; name: string }) => (
										<option key={category.id} value={category.id}>
											{category.name}
										</option>
									))}
								</select>
								<FieldError errors={field.state.meta.errors} />
							</div>
						)}
					</form.Field>

					{/* Session Duration + Max Attendees */}
					<div className="grid grid-cols-2 gap-4">
						<form.Field name="sessionDurationMinutes">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Session Duration (minutes){" "}
										<span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										type="number"
										min={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(parseInt(e.target.value, 10) || 0)
										}
										onWheel={(e) => e.currentTarget.blur()}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>

						<form.Field name="maxAttendees">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Max Attendees <span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										type="number"
										min={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(parseInt(e.target.value, 10) || 0)
										}
										onWheel={(e) => e.currentTarget.blur()}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</div>

					{/* Expirable */}
					<form.Subscribe selector={(s) => s.values.expirable}>
						{(expirable) => (
							<div className="grid grid-cols-2 gap-4">
								<form.Field name="expirable">
									{(field) => (
										<div className="flex items-center gap-2">
											<Checkbox
												id={field.name}
												className="bg-white"
												checked={field.state.value}
												onCheckedChange={(v) => field.handleChange(v === true)}
											/>
											<Label htmlFor={field.name}>Expirable</Label>
										</div>
									)}
								</form.Field>

								{expirable && (
									<div className="space-y-2">
										<Label>
											Duration <span className="text-destructive">*</span>
										</Label>
										<div className="flex gap-2">
											<form.Field name="duration">
												{(field) => (
													<Input
														type="number"
														min={1}
														placeholder="1"
														value={field.state.value ?? 1}
														onBlur={field.handleBlur}
														onChange={(e) =>
															field.handleChange(
																parseInt(e.target.value, 10) || 1,
															)
														}
														onWheel={(e) => e.currentTarget.blur()}
														className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
												)}
											</form.Field>
											<form.Field name="duration_unit">
												{(field) => (
													<select
														value={field.state.value ?? "day"}
														onChange={(e) =>
															field.handleChange(
																e.target.value as
																	| "day"
																	| "week"
																	| "month"
																	| "year",
															)
														}
														onBlur={field.handleBlur}
														className="flex-1 p-2 rounded-md border border-input bg-background shadow-sm focus:border-ring sm:text-sm"
													>
														<option value="day">Day(s)</option>
														<option value="week">Week(s)</option>
														<option value="month">Month(s)</option>
														<option value="year">Year(s)</option>
													</select>
												)}
											</form.Field>
										</div>
									</div>
								)}
							</div>
						)}
					</form.Subscribe>

					{/* Price + Sessions */}
					<div className="grid grid-cols-2 gap-4">
						<form.Field name="price">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Price <span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										type="number"
										min={0}
										step={0.01}
										value={field.state.value ?? 0}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(parseFloat(e.target.value) || 0)
										}
										onWheel={(e) => e.currentTarget.blur()}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
						<form.Field name="sessions">
							{(field) => (
								<div className="space-y-2">
									<Label htmlFor={field.name}>
										Sessions <span className="text-destructive">*</span>
									</Label>
									<Input
										id={field.name}
										type="number"
										min={0}
										step={1}
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) =>
											field.handleChange(parseInt(e.target.value, 10) || 0)
										}
										onWheel={(e) => e.currentTarget.blur()}
										className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
									/>
									<FieldError errors={field.state.meta.errors} />
								</div>
							)}
						</form.Field>
					</div>

					{/* Credit per session summary */}
					<form.Subscribe
						selector={(s) => ({
							price: s.values.price ?? 0,
							sessions: s.values.sessions ?? 0,
						})}
					>
						{({ price, sessions }) => {
							const creditPerSession = sessions > 0 ? price / sessions : 0;
							return (
								<div>
									<div className="mt-2 flex items-center">
										<span className="text-sm font-medium text-foreground">
											Credit per Session: RM{" "}
											{sessions > 0 ? creditPerSession.toFixed(2) : "0.00"}
										</span>
									</div>
									{sessions > 0 && price > 0 && (
										<div className="mt-3 p-4 bg-white rounded-md border border-brand-secondary-3">
											<div className="text-sm text-muted-foreground">
												<div className="flex justify-between">
													<span>Total Price:</span>
													<span>RM {price.toFixed(2)}</span>
												</div>
												<div className="flex justify-between">
													<span>Number of Sessions:</span>
													<span>{sessions}</span>
												</div>
												<div className="flex justify-between font-medium border-t pt-1 mt-1">
													<span>Credit per Session:</span>
													<span>RM {creditPerSession.toFixed(2)}</span>
												</div>
											</div>
										</div>
									)}
								</div>
							);
						}}
					</form.Subscribe>

					{/* Taxable */}
					<div>
						<form.Field name="taxable">
							{(field) => (
								<div className="flex items-center gap-2 mt-2">
									<Checkbox
										id={field.name}
										className="bg-white"
										checked={field.state.value}
										onCheckedChange={(v) => field.handleChange(v === true)}
									/>
									<Label htmlFor={field.name}>Taxable</Label>
								</div>
							)}
						</form.Field>

						<form.Subscribe
							selector={(s) => ({
								taxable: s.values.taxable,
								price: s.values.price ?? 0,
								taxPct: s.values.taxPercentage ?? 0,
							})}
						>
							{({ taxable, price, taxPct }) => {
								const taxAmount = (price * taxPct) / 100;
								const totalWithTax = price + taxAmount;
								return taxable ? (
									<>
										<form.Field name="taxPercentage">
											{(field) => (
												<div className="space-y-2 mt-3">
													<Label htmlFor={field.name}>
														Tax Percentage (%)
													</Label>
													<Input
														id={field.name}
														type="number"
														min={0}
														max={100}
														step={1}
														value={field.state.value ?? ""}
														onBlur={field.handleBlur}
														onChange={(e) =>
															field.handleChange(
																parseInt(e.target.value, 10) || 0,
															)
														}
														onWheel={(e) => e.currentTarget.blur()}
														className="bg-white w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
													<FieldError errors={field.state.meta.errors} />
												</div>
											)}
										</form.Field>
										<div className="mt-3 p-4 bg-white rounded-md border border-brand-secondary-3">
											<div className="text-sm text-muted-foreground">
												<div className="flex justify-between">
													<span>Base Price:</span>
													<span>RM {price.toFixed(2)}</span>
												</div>
												<div className="flex justify-between">
													<span>Tax ({taxPct}%):</span>
													<span>RM {taxAmount.toFixed(2)}</span>
												</div>
												<div className="flex justify-between font-medium border-t pt-1 mt-1">
													<span>Total:</span>
													<span>RM {totalWithTax.toFixed(2)}</span>
												</div>
											</div>
										</div>
									</>
								) : null;
							}}
						</form.Subscribe>
					</div>

					{/* Payment Plans */}
					<div className="border-t border-brand-secondary-3 pt-6 mt-2">
						<h3 className="font-subheading text-base text-foreground mb-4">
							Payment Plans
						</h3>
						<form.Subscribe
							selector={(s) => s.values.availablePaymentPlans ?? []}
						>
							{(availablePaymentPlans) => {
								const hasInstallmentPlan = availablePaymentPlans.some(
									(code) => (plansMap.get(code)?.numInstallments ?? 1) > 1,
								);
								return (
									<>
										<div className="space-y-2">
											{activePlans.map((plan) => (
												<div
													key={plan.code}
													className="flex items-center gap-2"
												>
													<Checkbox
														className="bg-white"
														id={`plan-${plan.code}`}
														checked={availablePaymentPlans.includes(plan.code)}
														disabled={mutation.isPending}
														onCheckedChange={(checked) => {
															const next = checked
																? [...availablePaymentPlans, plan.code]
																: availablePaymentPlans.filter(
																		(p) => p !== plan.code,
																	);
															form.setFieldValue("availablePaymentPlans", next);
														}}
													/>
													<label
														htmlFor={`plan-${plan.code}`}
														className="text-sm text-foreground"
													>
														{plan.name}
													</label>
												</div>
											))}
											{activePlans.length === 0 && (
												<p className="text-sm text-muted-foreground italic">
													No payment plans configured. Add plans under Settings
													&rarr; Installment Plans.
												</p>
											)}
										</div>

										{hasInstallmentPlan && (
											<>
												<form.Field name="installmentIntervalDays">
													{(field) => (
														<div className="space-y-2 mt-3">
															<Label htmlFor={field.name}>
																Installment interval (days)
															</Label>
															<Input
																id={field.name}
																type="number"
																min={1}
																value={field.state.value ?? ""}
																onBlur={field.handleBlur}
																onChange={(e) =>
																	field.handleChange(
																		parseInt(e.target.value, 10) || 1,
																	)
																}
																onWheel={(e) => e.currentTarget.blur()}
																className="bg-white w-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
															/>
															<FieldError errors={field.state.meta.errors} />
														</div>
													)}
												</form.Field>
												<form.Field name="gracePeriodDays">
													{(field) => (
														<div className="space-y-2 mt-3">
															<Label htmlFor={field.name}>
																Grace period (days)
															</Label>
															<Input
																id={field.name}
																type="number"
																min={0}
																max={90}
																placeholder="Default: 7"
																value={field.state.value ?? ""}
																onBlur={field.handleBlur}
																onChange={(e) => {
																	const val = e.target.value;
																	field.handleChange(
																		val === "" ? null : parseInt(val, 10),
																	);
																}}
																onWheel={(e) => e.currentTarget.blur()}
																className="bg-white w-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
															/>
															<p className="mt-1 text-xs text-muted-foreground">
																How many days after an overdue installment
																before the package locks. Leave blank to use the
																default of 7 days.
															</p>
															<FieldError errors={field.state.meta.errors} />
														</div>
													)}
												</form.Field>
											</>
										)}
									</>
								);
							}}
						</form.Subscribe>
					</div>

					{/* Scheduling Type */}
					<div className="border-t border-brand-secondary-3 pt-6 mt-2">
						<h3 className="font-subheading text-base text-foreground mb-4">
							Scheduling Configuration
						</h3>

						<form.Subscribe selector={(s) => s.values.schedulingType}>
							{(schedulingType) => {
								const timePresetConfig =
									schedulingType === "time-preset"
										? ((form.state.values as ServiceFormInput & {
												timePresetConfig?: {
													recurringDays: string[];
													timeSlotsPerDay: Record<string, string[]>;
												};
											}).timePresetConfig ?? {
												recurringDays: [],
												timeSlotsPerDay: {},
											})
										: undefined;
								return (
									<div className="space-y-4">
										<div>
											<span className="block text-sm font-medium text-foreground mb-2">
												Scheduling Type{" "}
												<span className="text-destructive">*</span>
											</span>
											<div className="flex gap-4">
												<div className="flex items-center">
													<input
														type="radio"
														id="scheduling-appointment-based"
														name="schedulingType"
														value="appointment-based"
														checked={schedulingType === "appointment-based"}
														onChange={() =>
															handleSchedulingTypeChange("appointment-based")
														}
														disabled={mutation.isPending}
														className="size-4 accent-primary text-primary focus:ring-ring border-brand-secondary-3"
													/>
													<label
														htmlFor="scheduling-appointment-based"
														className="ml-2 block text-sm text-foreground"
													>
														Appointment-Based
													</label>
												</div>
												<div className="flex items-center">
													<input
														type="radio"
														id="scheduling-time-preset"
														name="schedulingType"
														value="time-preset"
														checked={schedulingType === "time-preset"}
														onChange={() =>
															handleSchedulingTypeChange("time-preset")
														}
														disabled={mutation.isPending}
														className="size-4 accent-primary text-primary focus:ring-ring border-brand-secondary-3"
													/>
													<label
														htmlFor="scheduling-time-preset"
														className="ml-2 block text-sm text-foreground"
													>
														Time-Preset (Fixed Schedule)
													</label>
												</div>
											</div>
											<p className="text-sm text-muted-foreground mt-1">
												{schedulingType === "appointment-based"
													? "Sessions are booked flexibly based on coach and client availability"
													: "Sessions occur on predefined recurring time slots (e.g., every Monday 7 PM for classes)"}
											</p>
										</div>

										{schedulingType === "time-preset" && timePresetConfig && (
											<TimePresetEditor
												config={timePresetConfig}
												isPending={mutation.isPending}
												onDayToggle={handleRecurringDayToggle}
												onAddSlot={addTimeSlot}
												onRemoveSlot={removeTimeSlot}
												onUpdateSlot={updateTimeSlot}
											/>
										)}
									</div>
								);
							}}
						</form.Subscribe>
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
									? "Add Service"
									: "Save Changes"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
