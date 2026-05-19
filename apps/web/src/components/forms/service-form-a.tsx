/**
 * Design A variant of ServiceFormDialog — two-column modal layout.
 * All logic (queries, mutations, form state, validation) is copied verbatim
 * from service-form.tsx. Only the visual layout and component primitives differ.
 *
 * Canonical form shape. See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3.
 * - Zod schema colocated (top of file)
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 * - Error display: inline error text + toast on mutation error
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
import {
	Dialog,
	DialogContent,
} from "@/components/ui/dialog";
import { rmToCents } from "@/lib/money";

// ---------------------------------------------------------------------------
// 1. Schemas (verbatim from service-form.tsx)
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
// 2. Props (verbatim from service-form.tsx)
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
// 3. Helpers (verbatim from service-form.tsx)
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
// 4. Design-A shared style tokens
// ---------------------------------------------------------------------------

const labelCls = "block text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-1";
const inputCls =
	"w-full border border-input rounded-md px-3 py-2 text-sm bg-transparent shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const selectCls =
	"w-full border border-input rounded-md px-3 py-2 text-sm bg-transparent shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring";
const errorCls = "mt-1 text-[11px] text-red-500";

function SectionDivider({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-3 mb-4">
			<span className="text-[10px] uppercase tracking-widest font-bold text-[#737373] whitespace-nowrap">
				{label}
			</span>
			<div className="flex-1 border-t border-[#e5e5e5]" />
		</div>
	);
}

// ---------------------------------------------------------------------------
// 5. Component
// ---------------------------------------------------------------------------

export function ServiceFormDialogA({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	// Dependent queries — verbatim from service-form.tsx
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

	// Form instance — verbatim
	const form = useForm<ServiceFormInput>({
		resolver: zodResolver(serviceFormSchema),
		defaultValues: buildDefaultValues(initialData),
	});

	// Reset on dialog re-open — verbatim
	useEffect(() => {
		if (isOpen) form.reset(buildDefaultValues(initialData));
	}, [isOpen, initialData, form]);

	// Watch reactive fields — verbatim
	const schedulingType = form.watch("schedulingType");
	const expirable = form.watch("expirable");
	const taxable = form.watch("taxable");
	const price = form.watch("price") ?? 0;
	const sessions = form.watch("sessions") ?? 0;
	const taxPercentage = form.watch("taxPercentage") ?? 0;
	const availablePaymentPlans = form.watch("availablePaymentPlans") ?? [];
	const timePresetConfig =
		schedulingType === "time-preset"
			? (form.watch("timePresetConfig" as keyof ServiceFormInput) as { recurringDays: string[]; timeSlotsPerDay: Record<string, string[]> } | undefined)
			: undefined;

	const hasInstallmentPlan = availablePaymentPlans.some(
		(code) => (plansMap.get(code)?.numInstallments ?? 1) > 1,
	);

	// Derived display values — verbatim
	const taxAmount = (price * taxPercentage) / 100;
	const totalWithTax = price + taxAmount;
	const creditPerSession = sessions > 0 ? price / sessions : 0;

	// Mutation — verbatim
	const mutation = useApiMutation({
		mutationFn: (values: ServiceFormValues) => {
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

	// Time-preset helpers — verbatim
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
	// Render — Design A two-column layout
	// ---------------------------------------------------------------------------

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="!w-[70vw] !max-w-[70vw] max-h-[90vh] flex flex-col p-0 bg-white">
				{/* ── Header ── */}
				<div className="shrink-0 px-5 pt-5 pb-4 border-b border-[#e5e5e5]">
					<h2 className="text-[22px] font-extrabold tracking-tight text-[#0a0a0a]">
						{mode === "create" ? "Add New Service" : "Edit Service"}
					</h2>
					<p className="text-[13px] text-[#737373] mt-1">
						{mode === "create"
							? "Configure a new service for your catalog"
							: "Update service details and configuration"}
					</p>
				</div>

				{/* ── Two-column body ── */}
				<form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
					<div className="overflow-y-auto flex-1">
					<div className="grid grid-cols-[2fr_3fr] divide-x divide-[#e5e5e5]">

						{/* ── LEFT COLUMN: Basics + Scheduling ── */}
						<div className="px-5 py-4 space-y-4">
							<div>
								<SectionDivider label="Basics" />

								{/* Name */}
								<div className="mb-4">
									<label className={labelCls}>
										Service Name <span className="text-red-500">*</span>
									</label>
									<input
										type="text"
										placeholder="Enter service name"
										className={inputCls}
										{...form.register("name")}
									/>
									{form.formState.errors.name && (
										<p className={errorCls}>{form.formState.errors.name.message}</p>
									)}
								</div>

								{/* Category */}
								<div className="mb-4">
									<label className={labelCls}>
										Category <span className="text-red-500">*</span>
									</label>
									<select
										disabled={isLoadingCategories}
										className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}
										{...form.register("categoryId")}
									>
										<option value="">
											{isLoadingCategories ? "Loading categories..." : "Select a category"}
										</option>
										{serviceCategories.map((category) => (
											<option key={category.id} value={category.id}>
												{category.name}
											</option>
										))}
									</select>
									{form.formState.errors.categoryId && (
										<p className={errorCls}>{form.formState.errors.categoryId.message}</p>
									)}
								</div>

								{/* Session Duration */}
								<div className="mb-4">
									<label className={labelCls}>
										Session Duration (min) <span className="text-red-500">*</span>
									</label>
									<input
										type="number"
										min={1}
										className={inputCls}
										onWheel={(e) => e.currentTarget.blur()}
										{...form.register("sessionDurationMinutes", {
											setValueAs: (v) => parseInt(v, 10) || 0,
										})}
									/>
									{form.formState.errors.sessionDurationMinutes && (
										<p className={errorCls}>{form.formState.errors.sessionDurationMinutes.message}</p>
									)}
								</div>

								{/* Max Attendees */}
								<div>
									<label className={labelCls}>
										Max Attendees <span className="text-red-500">*</span>
									</label>
									<input
										type="number"
										min={1}
										className={inputCls}
										onWheel={(e) => e.currentTarget.blur()}
										{...form.register("maxAttendees", {
											setValueAs: (v) => parseInt(v, 10) || 0,
										})}
									/>
									{form.formState.errors.maxAttendees && (
										<p className={errorCls}>{form.formState.errors.maxAttendees.message}</p>
									)}
								</div>
							</div>

							{/* Scheduling */}
							<div>
								<SectionDivider label="Scheduling" />

								<div className="space-y-2 mb-3">
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="radio"
											name="schedulingType"
											value="appointment-based"
											checked={schedulingType === "appointment-based"}
											onChange={() => handleSchedulingTypeChange("appointment-based")}
											disabled={mutation.isPending}
											className="h-4 w-4 accent-[#0a0a0a]"
										/>
										<span className="text-[13px] text-[#0a0a0a]">Appointment-based</span>
									</label>
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="radio"
											name="schedulingType"
											value="time-preset"
											checked={schedulingType === "time-preset"}
											onChange={() => handleSchedulingTypeChange("time-preset")}
											disabled={mutation.isPending}
											className="h-4 w-4 accent-[#0a0a0a]"
										/>
										<span className="text-[13px] text-[#0a0a0a]">Time-preset (Fixed Schedule)</span>
									</label>
								</div>

								<p className="text-[11px] text-[#737373]">
									{schedulingType === "appointment-based"
										? "Sessions are booked flexibly based on coach and client availability"
										: "Sessions occur on predefined recurring time slots (e.g., every Monday 7 PM)"}
								</p>

								{schedulingType === "time-preset" && timePresetConfig && (
									<div className="mt-4">
										<TimePresetEditor
											config={timePresetConfig}
											isPending={mutation.isPending}
											onDayToggle={handleRecurringDayToggle}
											onAddSlot={addTimeSlot}
											onRemoveSlot={removeTimeSlot}
											onUpdateSlot={updateTimeSlot}
										/>
									</div>
								)}
							</div>
						</div>

						{/* ── RIGHT COLUMN: Pricing, Expiry, Payment Plans ── */}
						<div className="px-5 py-4 space-y-4">
							<div>
								<SectionDivider label="Pricing & Sessions" />

								{/* Price + Sessions row */}
								<div className="grid grid-cols-2 gap-4 mb-3">
									<div>
										<label className={labelCls}>
											Price (RM) <span className="text-red-500">*</span>
										</label>
										<input
											type="number"
											min={0}
											step={0.01}
											className={inputCls}
											onWheel={(e) => e.currentTarget.blur()}
											{...form.register("price", {
												setValueAs: (v) => parseFloat(v) || 0,
											})}
										/>
										{form.formState.errors.price && (
											<p className={errorCls}>{form.formState.errors.price.message}</p>
										)}
									</div>
									<div>
										<label className={labelCls}>
											Sessions <span className="text-red-500">*</span>
										</label>
										<input
											type="number"
											min={0}
											step={1}
											className={inputCls}
											onWheel={(e) => e.currentTarget.blur()}
											{...form.register("sessions", {
												setValueAs: (v) => parseInt(v, 10) || 0,
											})}
										/>
										{form.formState.errors.sessions && (
											<p className={errorCls}>{form.formState.errors.sessions.message}</p>
										)}
									</div>
								</div>

								{/* Credit per session */}
								<p className="text-[12px] text-[#737373] mb-3">
									Credit per session:{" "}
									<span className="font-semibold text-[#0a0a0a]">
										RM {sessions > 0 ? creditPerSession.toFixed(2) : "—"}
									</span>
								</p>

								{/* Taxable */}
								<div className="mb-2">
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
											checked={taxable}
											onChange={(e) => form.setValue("taxable", e.target.checked, { shouldDirty: true })}
										/>
										<span className="text-[13px] text-[#0a0a0a] font-medium">Taxable</span>
									</label>
								</div>

								{taxable && (
									<div className="pl-6 space-y-3">
										<div>
											<label className={labelCls}>Tax %</label>
											<input
												type="number"
												min={0}
												max={100}
												step={1}
												className={`${inputCls} w-24`}
												onWheel={(e) => e.currentTarget.blur()}
												{...form.register("taxPercentage", {
													setValueAs: (v) => parseInt(v, 10) || 0,
												})}
											/>
											{form.formState.errors.taxPercentage && (
												<p className={errorCls}>{form.formState.errors.taxPercentage.message}</p>
											)}
										</div>
										<p className="text-[12px] text-[#737373]">
											Base{" "}
											<span className="text-[#0a0a0a] font-semibold">
												RM {price.toFixed(2)}
											</span>{" "}
											· Tax{" "}
											<span className="text-[#0a0a0a] font-semibold">
												RM {taxAmount.toFixed(2)}
											</span>{" "}
											· Total{" "}
											<span className="text-[#0a0a0a] font-semibold">
												RM {totalWithTax.toFixed(2)}
											</span>
										</p>
									</div>
								)}
							</div>

							{/* Expiry */}
							<div>
								<SectionDivider label="Expiry" />

								<div className="mb-2">
									<label className="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
											checked={expirable}
											onChange={(e) => form.setValue("expirable", e.target.checked, { shouldDirty: true })}
										/>
										<span className="text-[13px] text-[#0a0a0a] font-medium">Expirable</span>
									</label>
								</div>

								{expirable && (
									<div className="pl-6 mt-2">
										<label className={labelCls}>Duration</label>
										<div className="flex gap-2">
											<input
												type="number"
												min={1}
												placeholder="1"
												className={`${inputCls} flex-1`}
												onWheel={(e) => e.currentTarget.blur()}
												{...form.register("duration", {
													setValueAs: (v) => parseInt(v, 10) || 1,
												})}
											/>
											<select
												className={`${selectCls} flex-1`}
												{...form.register("duration_unit")}
											>
												<option value="day">Day(s)</option>
												<option value="week">Week(s)</option>
												<option value="month">Month(s)</option>
												<option value="year">Year(s)</option>
											</select>
										</div>
										{form.formState.errors.duration && (
											<p className={errorCls}>{form.formState.errors.duration.message}</p>
										)}
									</div>
								)}
							</div>

							{/* Payment Plans */}
							<div>
								<SectionDivider label="Payment Plans" />

								{activePlans.length === 0 ? (
									<p className="text-[12px] text-[#737373] italic">
										No payment plans configured. Add plans under Settings → Installment Plans.
									</p>
								) : (
									<div className="space-y-2 mb-3">
										{activePlans.map((plan) => (
											<label key={plan.code} className="flex items-center gap-2 cursor-pointer">
												<input
													type="checkbox"
													className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
													id={`plan-a-${plan.code}`}
													checked={availablePaymentPlans.includes(plan.code)}
													disabled={mutation.isPending}
													onChange={(e) => {
														const next = e.target.checked
															? [...availablePaymentPlans, plan.code]
															: availablePaymentPlans.filter((p) => p !== plan.code);
														form.setValue("availablePaymentPlans", next, { shouldDirty: true });
													}}
												/>
												<span className="text-[13px] text-[#0a0a0a]">{plan.name}</span>
											</label>
										))}
									</div>
								)}

								{hasInstallmentPlan && (
									<div className="pl-6 space-y-3">
										<div>
											<label className={labelCls}>Installment interval (days)</label>
											<input
												type="number"
												min={1}
												className={`${inputCls} w-40`}
												onWheel={(e) => e.currentTarget.blur()}
												{...form.register("installmentIntervalDays", {
													setValueAs: (v) => parseInt(v, 10) || 1,
												})}
											/>
											{form.formState.errors.installmentIntervalDays && (
												<p className={errorCls}>{form.formState.errors.installmentIntervalDays.message}</p>
											)}
										</div>
										<div>
											<label className={labelCls}>Grace period (days)</label>
											<input
												type="number"
												min={0}
												max={90}
												placeholder="Default: 7"
												className={`${inputCls} w-40`}
												onWheel={(e) => e.currentTarget.blur()}
												{...form.register("gracePeriodDays", {
													setValueAs: (v) => (v === "" ? null : parseInt(v, 10)),
												})}
											/>
											<p className="mt-1 text-[11px] text-[#737373]">
												Days after overdue installment before package locks. Blank = 7 days.
											</p>
											{form.formState.errors.gracePeriodDays && (
												<p className={errorCls}>{form.formState.errors.gracePeriodDays.message}</p>
											)}
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
					</div>{/* end scroll wrapper */}

					{/* ── Footer ── */}
					<div className="shrink-0 px-5 py-3 border-t border-[#e5e5e5] flex items-center justify-end gap-3">
						<button
							type="button"
							onClick={onClose}
							disabled={mutation.isPending}
							className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold disabled:opacity-50"
						>
							{mutation.isPending
								? mode === "create"
									? "Adding..."
									: "Saving..."
								: mode === "create"
									? "Add Service"
									: "Save Changes"}
						</button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
