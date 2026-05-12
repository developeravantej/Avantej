/**
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 * - Error display: inline <FormMessage> + toast on mutation error
 * - timePresetConfig is persisted on the service row as a jsonb column when schedulingType = "class_slot"
 * - schedulingType maps: UI "appointment-based" → wire "appointment"; UI "time-preset" → wire "class_slot"
 * - initialData.price comes in as dollars (data-table pre-divides by 100); zod transform converts to cents on submit
 */

import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { TimePresetEditor } from "@/features/services/components/TimePresetEditor";
import { client, orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
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
	name: z.string().min(1, "Service name is required").max(200, "Name must be 200 characters or fewer"),
	categoryId: z.string().uuid("Category is required"),
	sessionDurationMinutes: z.number().int().min(1, "Duration must be at least 1 minute"),
	maxAttendees: z.number().int().min(1, "Must have at least 1 attendee"),
	price: z
		.number({ message: "Price is required" })
		.min(0, "Price must be 0 or more")
		.transform((v) => rmToCents(v)), // dollars → cents at submit
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

// For react-hook-form we need the INPUT type (before transforms)
type ServiceFormInput = z.input<typeof serviceFormSchema>;
// Output type (after transforms — what mutationFn receives)
type ServiceFormValues = z.output<typeof serviceFormSchema>;

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
			price: initialData.price, // already in dollars
			sessions: initialData.sessions,
			taxable: initialData.taxable,
			taxPercentage: initialData.taxPercentage ?? 6,
			expirable: initialData.expirable,
			duration: initialData.duration ?? 1,
			duration_unit: (initialData.duration_unit as "day" | "week" | "month" | "year") ?? "day",
			availablePaymentPlans: initialData.availablePaymentPlans ?? [],
			installmentIntervalDays: initialData.installmentIntervalDays ?? 30,
			gracePeriodDays: initialData.gracePeriodDays ?? null,
		};
		if (initialData.schedulingType === "time-preset") {
			return {
				...base,
				schedulingType: "time-preset" as const,
				timePresetConfig: initialData.timePresetConfig ?? { recurringDays: [], timeSlotsPerDay: {} },
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

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
export function ServiceFormDialog({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	// Dependent queries — keep identical to original
	const { data: serviceCategories = [], isLoading: isLoadingCategories } = useQuery({
		...orpc.serviceCategories.list.queryOptions({ input: { organizationId, isActive: true } }),
		enabled: isOpen && !!organizationId,
	});

	const { data: activePlans = [] } = useQuery({
		queryKey: ["installmentPlans", organizationId, "active"],
		queryFn: () => client.installmentPlans.list({ organizationId, activeOnly: true }),
		enabled: isOpen && !!organizationId,
	});

	const plansMap = useMemo(
		() => new Map(activePlans.map((p) => [p.code, p])),
		[activePlans],
	);

	// Form instance
	const form = useForm<ServiceFormInput>({
		resolver: zodResolver(serviceFormSchema),
		defaultValues: buildDefaultValues(initialData),
	});

	// Reset on dialog re-open with fresh initialData
	// react-doctor-disable-next-line react-doctor/no-effect-event-handler -- prop-driven reset: isOpen toggles externally, not a user event
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// Watch reactive fields
	const schedulingType = form.watch("schedulingType");
	const expirable = form.watch("expirable");
	const taxable = form.watch("taxable");
	const price = form.watch("price") ?? 0;
	const sessions = form.watch("sessions") ?? 0;
	const taxPercentage = form.watch("taxPercentage") ?? 0;
	const availablePaymentPlans = form.watch("availablePaymentPlans") ?? [];
	// timePresetConfig — only defined when schedulingType === "time-preset"
	const timePresetConfig =
		schedulingType === "time-preset"
			? (form.watch("timePresetConfig" as keyof ServiceFormInput) as { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> } | undefined)
			: undefined;

	const hasInstallmentPlan = availablePaymentPlans.some(
		(code) => (plansMap.get(code)?.numInstallments ?? 1) > 1,
	);

	// Derived display values (price is still in dollars at watch-time; zod transform hasn't run)
	const taxAmount = (price * taxPercentage) / 100;
	const totalWithTax = price + taxAmount;
	const creditPerSession = sessions > 0 ? price / sessions : 0;

	// Single mutation branching on mode
	const mutation = useApiMutation({
		mutationFn: (values: ServiceFormValues) => {
			// Map UI schedulingType → wire schedulingType
			const wireSchedulingType =
				values.schedulingType === "time-preset" ? "class_slot" as const : "appointment" as const;

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
				// price is already in cents (zod transform ran)
				price: values.price != null ? values.price : null,
				taxable: values.taxable,
				taxPercentage: values.taxable ? Math.round(values.taxPercentage ?? 0) : 0,
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

	const onSubmit = (values: ServiceFormValues) => mutation.mutate(values);

	// ---------------------------------------------------------------------------
	// Time-preset helpers — update via form.setValue (not useState)
	// ---------------------------------------------------------------------------

	function getTimePresetConfig() {
		return (form.getValues("timePresetConfig" as keyof ServiceFormInput) ?? {
			recurringDays: [],
			timeSlotsPerDay: {},
		}) as { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> };
	}

	function handleSchedulingTypeChange(type: "appointment-based" | "time-preset") {
		form.setValue("schedulingType", type, { shouldDirty: true });
		if (type === "appointment-based") {
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-ignore — clearing time-preset field across discriminated union branches
			form.setValue("timePresetConfig", undefined);
		} else {
			form.setValue("timePresetConfig", { recurringDays: [], timeSlotsPerDay: {} });
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

		form.setValue("timePresetConfig", { recurringDays: newDays, timeSlotsPerDay: newTimeSlotsPerDay }, { shouldDirty: true, shouldValidate: true });
	}

	function addTimeSlot(day: string) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (!newTimeSlotsPerDay[day]) newTimeSlotsPerDay[day] = [];
		newTimeSlotsPerDay[day] = [...newTimeSlotsPerDay[day], "09:00"];
		form.setValue("timePresetConfig", { ...config, timeSlotsPerDay: newTimeSlotsPerDay }, { shouldDirty: true });
	}

	function removeTimeSlot(day: string, index: number) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (newTimeSlotsPerDay[day]) {
			newTimeSlotsPerDay[day] = newTimeSlotsPerDay[day].filter((_, i) => i !== index);
		}
		form.setValue("timePresetConfig", { ...config, timeSlotsPerDay: newTimeSlotsPerDay }, { shouldDirty: true });
	}

	function updateTimeSlot(day: string, index: number, time: string) {
		const config = getTimePresetConfig();
		const newTimeSlotsPerDay = { ...config.timeSlotsPerDay };
		if (newTimeSlotsPerDay[day]) {
			const slots = [...newTimeSlotsPerDay[day]];
			slots[index] = time;
			newTimeSlotsPerDay[day] = slots;
		}
		form.setValue("timePresetConfig", { ...config, timeSlotsPerDay: newTimeSlotsPerDay }, { shouldDirty: true });
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="font-heading text-2xl">
						{mode === "create" ? "Add New Service" : "Edit Service"}
					</DialogTitle>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
						{/* Service Name */}
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Service Name <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<Input className="bg-white" placeholder="Enter service name" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Service Category */}
						<FormField
							control={form.control}
							name="categoryId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>
										Service Category <span className="text-destructive">*</span>
									</FormLabel>
									<FormControl>
										<select
											{...field}
											disabled={isLoadingCategories}
											className="mt-1 block w-full px-3 py-2 rounded-md border border-input bg-white shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<option value="">
												{isLoadingCategories ? "Loading categories..." : "Select a category"}
											</option>
											{serviceCategories.map((category: any) => (
												<option key={category.id} value={category.id}>
													{category.name}
												</option>
											))}
										</select>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						{/* Session Duration + Max Attendees */}
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="sessionDurationMinutes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Session Duration (minutes) <span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
												onWheel={(e) => e.currentTarget.blur()}
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="maxAttendees"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Max Attendees <span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												{...field}
												onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
												onWheel={(e) => e.currentTarget.blur()}
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Expirable */}
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="expirable"
								render={({ field }) => (
									<FormItem className="flex items-center gap-2 space-y-0">
										<FormControl>
											<Checkbox
												className="bg-white"
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<FormLabel className="!mt-0">Expirable</FormLabel>
									</FormItem>
								)}
							/>

							{expirable && (
								<FormItem>
									<FormLabel>
										Duration <span className="text-destructive">*</span>
									</FormLabel>
									<div className="flex gap-2">
										<FormField
											control={form.control}
											name="duration"
											render={({ field }) => (
												<FormControl>
													<Input
														type="number"
														min={1}
														placeholder="1"
														{...field}
														onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
														onWheel={(e) => e.currentTarget.blur()}
														className="flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
												</FormControl>
											)}
										/>
										<FormField
											control={form.control}
											name="duration_unit"
											render={({ field }) => (
												<FormControl>
													<select
														{...field}
														className="flex-1 p-2 rounded-md border border-input bg-background shadow-sm focus:border-ring sm:text-sm"
													>
														<option value="day">Day(s)</option>
														<option value="week">Week(s)</option>
														<option value="month">Month(s)</option>
														<option value="year">Year(s)</option>
													</select>
												</FormControl>
											)}
										/>
									</div>
									<FormMessage />
								</FormItem>
							)}
						</div>

						{/* Price + Sessions */}
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="price"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Price <span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={0}
												step={0.01}
												{...field}
												onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
												onWheel={(e) => e.currentTarget.blur()}
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="sessions"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											Sessions <span className="text-destructive">*</span>
										</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={0}
												step={1}
												{...field}
												onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
												onWheel={(e) => e.currentTarget.blur()}
												className="bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{/* Credit per session summary */}
						<div>
							<div className="mt-2 flex items-center">
								<span className="text-sm font-medium text-foreground">
									Credit per Session: RM {sessions > 0 ? creditPerSession.toFixed(2) : "0.00"}
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

						{/* Taxable */}
						<div>
							<FormField
								control={form.control}
								name="taxable"
								render={({ field }) => (
									<FormItem className="flex items-center gap-2 space-y-0 mt-2">
										<FormControl>
											<Checkbox
												className="bg-white"
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<FormLabel className="!mt-0">Taxable</FormLabel>
									</FormItem>
								)}
							/>

							{taxable && (
								<>
									<FormField
										control={form.control}
										name="taxPercentage"
										render={({ field }) => (
											<FormItem className="mt-3">
												<FormLabel>Tax Percentage (%)</FormLabel>
												<FormControl>
													<Input
														type="number"
														min={0}
														max={100}
														step={1}
														{...field}
														value={field.value ?? ""}
														onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
														onWheel={(e) => e.currentTarget.blur()}
														className="bg-white w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<div className="mt-3 p-4 bg-white rounded-md border border-brand-secondary-3">
										<div className="text-sm text-muted-foreground">
											<div className="flex justify-between">
												<span>Base Price:</span>
												<span>RM {price.toFixed(2)}</span>
											</div>
											<div className="flex justify-between">
												<span>Tax ({taxPercentage}%):</span>
												<span>RM {taxAmount.toFixed(2)}</span>
											</div>
											<div className="flex justify-between font-medium border-t pt-1 mt-1">
												<span>Total:</span>
												<span>RM {totalWithTax.toFixed(2)}</span>
											</div>
										</div>
									</div>
								</>
							)}
						</div>

						{/* Payment Plans */}
						<div className="border-t border-brand-secondary-3 pt-6 mt-2">
							<h3 className="font-subheading text-base text-foreground mb-4">Payment Plans</h3>
							<div className="space-y-2">
								{activePlans.map((plan) => (
									<div key={plan.code} className="flex items-center gap-2">
										<Checkbox
											className="bg-white"
											id={`plan-${plan.code}`}
											checked={availablePaymentPlans.includes(plan.code)}
											disabled={mutation.isPending}
											onCheckedChange={(checked) => {
												const next = checked
													? [...availablePaymentPlans, plan.code]
													: availablePaymentPlans.filter((p) => p !== plan.code);
												form.setValue("availablePaymentPlans", next, { shouldDirty: true });
											}}
										/>
										<label htmlFor={`plan-${plan.code}`} className="text-sm text-foreground">
											{plan.name}
										</label>
									</div>
								))}
								{activePlans.length === 0 && (
									<p className="text-sm text-muted-foreground italic">
										No payment plans configured. Add plans under Settings &rarr; Installment Plans.
									</p>
								)}
							</div>

							{hasInstallmentPlan && (
								<>
									<FormField
										control={form.control}
										name="installmentIntervalDays"
										render={({ field }) => (
											<FormItem className="mt-3">
												<FormLabel>Installment interval (days)</FormLabel>
												<FormControl>
													<Input
														type="number"
														min={1}
														{...field}
														value={field.value ?? ""}
														onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
														onWheel={(e) => e.currentTarget.blur()}
														className="bg-white w-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
									<FormField
										control={form.control}
										name="gracePeriodDays"
										render={({ field }) => (
											<FormItem className="mt-3">
												<FormLabel>Grace period (days)</FormLabel>
												<FormControl>
													<Input
														type="number"
														min={0}
														max={90}
														placeholder="Default: 7"
														{...field}
														value={field.value ?? ""}
														onChange={(e) => {
															const val = e.target.value;
															field.onChange(val === "" ? null : parseInt(val, 10));
														}}
														onWheel={(e) => e.currentTarget.blur()}
														className="bg-white w-40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
													/>
												</FormControl>
												<p className="mt-1 text-xs text-muted-foreground">
													How many days after an overdue installment before the package locks. Leave blank to use the default of 7 days.
												</p>
												<FormMessage />
											</FormItem>
										)}
									/>
								</>
							)}
						</div>

						{/* Scheduling Type */}
						<div className="border-t border-brand-secondary-3 pt-6 mt-2">
							<h3 className="font-subheading text-base text-foreground mb-4">Scheduling Configuration</h3>

							<div className="space-y-4">
								<div>
									<span className="block text-sm font-medium text-foreground mb-2">
										Scheduling Type <span className="text-destructive">*</span>
									</span>
									<div className="flex gap-4">
										<div className="flex items-center">
											<input
												type="radio"
												id="scheduling-appointment-based"
												name="schedulingType"
												value="appointment-based"
												checked={schedulingType === "appointment-based"}
												onChange={() => handleSchedulingTypeChange("appointment-based")}
												disabled={mutation.isPending}
												className="size-4 accent-primary text-primary focus:ring-ring border-brand-secondary-3"
											/>
											<label htmlFor="scheduling-appointment-based" className="ml-2 block text-sm text-foreground">
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
												onChange={() => handleSchedulingTypeChange("time-preset")}
												disabled={mutation.isPending}
												className="size-4 accent-primary text-primary focus:ring-ring border-brand-secondary-3"
											/>
											<label htmlFor="scheduling-time-preset" className="ml-2 block text-sm text-foreground">
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

								{/* Time-Preset Configuration */}
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
				</Form>
			</DialogContent>
		</Dialog>
	);
}
