/**
 * Design C variant of ServiceFormDialog — slide-out sheet from the right.
 * All logic is copied verbatim from service-form.tsx; only the visual layout changes.
 * See: zplan/Done_04-24_14-00_form-standardization/plan/plan.md §3 for form conventions.
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
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
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
			price: initialData.price,
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
// 4. Design-C token helpers
// ---------------------------------------------------------------------------

const labelCls = "text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-1 block";
const inputCls =
	"border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-[13px] w-full bg-white outline-none focus:ring-2 focus:ring-[#0a0a0a]/10";
const sectionHeaderCls =
	"text-[10px] font-bold uppercase tracking-widest text-[#737373] pb-2 mb-4 border-b border-[#e5e5e5]";

// ---------------------------------------------------------------------------
// 5. Component
// ---------------------------------------------------------------------------

export function ServiceFormDialogC({
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

	const form = useForm<ServiceFormInput>({
		resolver: zodResolver(serviceFormSchema),
		defaultValues: buildDefaultValues(initialData),
	});

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

	const taxAmount = (price * taxPercentage) / 100;
	const totalWithTax = price + taxAmount;
	const creditPerSession = sessions > 0 ? price / sessions : 0;

	// Mutation — verbatim from service-form.tsx
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

	// Time-preset helpers — verbatim from service-form.tsx
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

	// Errors helper
	const e = form.formState.errors as Record<string, { message?: string } | undefined>;

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<Sheet open={isOpen} onOpenChange={(v) => !v && onClose()}>
			<SheetContent
				side="right"
				className="w-full sm:max-w-[560px] overflow-y-auto flex flex-col p-0"
			>
				{/* Header */}
				<SheetHeader className="px-8 pt-8 pb-6 border-b border-[#e5e5e5] shrink-0">
					<SheetTitle className="text-[20px] font-extrabold tracking-tight text-[#0a0a0a]">
						{mode === "create" ? "Add New Service" : "Edit Service"}
					</SheetTitle>
					<p className="text-[13px] text-[#737373]">
						{mode === "create"
							? "Fill in the details to add a new service."
							: "Update the service details below."}
					</p>
				</SheetHeader>

				{/* Body */}
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col flex-1 min-h-0"
				>
					<div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
						{/* ── BASICS ─────────────────────────────────────────── */}
						<p className={sectionHeaderCls}>Basics</p>

						{/* Name */}
						<div>
							<label className={labelCls}>
								Service Name <span className="text-red-500">*</span>
							</label>
							<input
								{...form.register("name")}
								placeholder="Enter service name"
								className={inputCls}
							/>
							{e.name && (
								<p className="mt-1 text-[11px] text-red-500">{e.name.message}</p>
							)}
						</div>

						{/* Category */}
						<div>
							<label className={labelCls}>
								Service Category <span className="text-red-500">*</span>
							</label>
							<select
								{...form.register("categoryId")}
								disabled={isLoadingCategories}
								className={inputCls}
							>
								<option value="">
									{isLoadingCategories ? "Loading categories…" : "Select a category"}
								</option>
								{serviceCategories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))}
							</select>
							{e.categoryId && (
								<p className="mt-1 text-[11px] text-red-500">{e.categoryId.message}</p>
							)}
						</div>

						{/* Session Duration */}
						<div>
							<label className={labelCls}>
								Session Duration (minutes) <span className="text-red-500">*</span>
							</label>
							<input
								type="number"
								min={1}
								{...form.register("sessionDurationMinutes", {
									setValueAs: (v) => parseInt(v, 10) || 0,
								})}
								onWheel={(e) => e.currentTarget.blur()}
								className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
							/>
							{e.sessionDurationMinutes && (
								<p className="mt-1 text-[11px] text-red-500">{e.sessionDurationMinutes.message}</p>
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
								{...form.register("maxAttendees", {
									setValueAs: (v) => parseInt(v, 10) || 0,
								})}
								onWheel={(e) => e.currentTarget.blur()}
								className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
							/>
							{e.maxAttendees && (
								<p className="mt-1 text-[11px] text-red-500">{e.maxAttendees.message}</p>
							)}
						</div>

						{/* ── SCHEDULING ─────────────────────────────────────── */}
						<p className={sectionHeaderCls}>Scheduling</p>

						<div>
							<label className={labelCls}>
								Scheduling Type <span className="text-red-500">*</span>
							</label>
							<div className="flex flex-col gap-2">
								<label className="flex items-center gap-2.5 cursor-pointer">
									<input
										type="radio"
										name="schedulingType"
										value="appointment-based"
										checked={schedulingType === "appointment-based"}
										onChange={() => handleSchedulingTypeChange("appointment-based")}
										disabled={mutation.isPending}
										className="h-4 w-4 accent-[#0a0a0a]"
									/>
									<span className="text-[13px] text-[#0a0a0a]">Appointment-Based</span>
								</label>
								<label className="flex items-center gap-2.5 cursor-pointer">
									<input
										type="radio"
										name="schedulingType"
										value="time-preset"
										checked={schedulingType === "time-preset"}
										onChange={() => handleSchedulingTypeChange("time-preset")}
										disabled={mutation.isPending}
										className="h-4 w-4 accent-[#0a0a0a]"
									/>
									<span className="text-[13px] text-[#0a0a0a]">Time-Preset (Fixed Schedule)</span>
								</label>
							</div>
							<p className="mt-2 text-[12px] text-[#737373]">
								{schedulingType === "appointment-based"
									? "Sessions are booked flexibly based on coach and client availability."
									: "Sessions occur on predefined recurring time slots (e.g., every Monday 7 PM for classes)."}
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

						{/* ── EXPIRY ─────────────────────────────────────────── */}
						<p className={sectionHeaderCls}>Expiry</p>

						<label className="flex items-center gap-2.5 cursor-pointer">
							<input
								type="checkbox"
								checked={expirable}
								onChange={(e) => form.setValue("expirable", e.target.checked, { shouldDirty: true })}
								className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
							/>
							<span className="text-[13px] text-[#0a0a0a] font-medium">Expirable</span>
						</label>

						{expirable && (
							<div>
								<label className={labelCls}>
									Duration <span className="text-red-500">*</span>
								</label>
								<div className="flex gap-2">
									<input
										type="number"
										min={1}
										placeholder="1"
										{...form.register("duration", {
											setValueAs: (v) => parseInt(v, 10) || 1,
										})}
										onWheel={(e) => e.currentTarget.blur()}
										className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
									/>
									<select
										{...form.register("duration_unit")}
										className={inputCls}
									>
										<option value="day">Day(s)</option>
										<option value="week">Week(s)</option>
										<option value="month">Month(s)</option>
										<option value="year">Year(s)</option>
									</select>
								</div>
								{e.duration && (
									<p className="mt-1 text-[11px] text-red-500">{e.duration.message}</p>
								)}
							</div>
						)}

						{/* ── PRICING ────────────────────────────────────────── */}
						<p className={sectionHeaderCls}>Pricing</p>

						<div>
							<label className={labelCls}>
								Price (RM) <span className="text-red-500">*</span>
							</label>
							<input
								type="number"
								min={0}
								step={0.01}
								{...form.register("price", {
									setValueAs: (v) => parseFloat(v) || 0,
								})}
								onWheel={(e) => e.currentTarget.blur()}
								className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
							/>
							{e.price && (
								<p className="mt-1 text-[11px] text-red-500">{e.price.message}</p>
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
								{...form.register("sessions", {
									setValueAs: (v) => parseInt(v, 10) || 0,
								})}
								onWheel={(e) => e.currentTarget.blur()}
								className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
							/>
							{e.sessions && (
								<p className="mt-1 text-[11px] text-red-500">{e.sessions.message}</p>
							)}
						</div>

						{/* Credit per session summary */}
						{sessions > 0 && price > 0 && (
							<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3 text-[13px] space-y-1">
								<div className="flex justify-between">
									<span className="text-[#737373]">Total Price</span>
									<span className="text-[#0a0a0a] font-medium">RM {price.toFixed(2)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-[#737373]">Sessions</span>
									<span className="text-[#0a0a0a] font-medium">{sessions}</span>
								</div>
								<div className="flex justify-between border-t border-[#e5e5e5] pt-1">
									<span className="text-[#737373] font-semibold">Credit / Session</span>
									<span className="text-[#0a0a0a] font-bold">RM {creditPerSession.toFixed(2)}</span>
								</div>
							</div>
						)}

						{/* Taxable */}
						<label className="flex items-center gap-2.5 cursor-pointer">
							<input
								type="checkbox"
								checked={taxable}
								onChange={(e) => form.setValue("taxable", e.target.checked, { shouldDirty: true })}
								className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
							/>
							<span className="text-[13px] text-[#0a0a0a] font-medium">Taxable</span>
						</label>

						{taxable && (
							<>
								<div>
									<label className={labelCls}>Tax Percentage (%)</label>
									<input
										type="number"
										min={0}
										max={100}
										step={1}
										{...form.register("taxPercentage", {
											setValueAs: (v) => parseInt(v, 10) || 0,
										})}
										onWheel={(e) => e.currentTarget.blur()}
										className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
									/>
									{e.taxPercentage && (
										<p className="mt-1 text-[11px] text-red-500">{e.taxPercentage.message}</p>
									)}
								</div>

								<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] px-4 py-3 text-[13px] space-y-1">
									<div className="flex justify-between">
										<span className="text-[#737373]">Base Price</span>
										<span className="text-[#0a0a0a] font-medium">RM {price.toFixed(2)}</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#737373]">Tax ({taxPercentage}%)</span>
										<span className="text-[#0a0a0a] font-medium">RM {taxAmount.toFixed(2)}</span>
									</div>
									<div className="flex justify-between border-t border-[#e5e5e5] pt-1">
										<span className="text-[#737373] font-semibold">Total</span>
										<span className="text-[#0a0a0a] font-bold">RM {totalWithTax.toFixed(2)}</span>
									</div>
								</div>
							</>
						)}

						{/* ── PAYMENT PLANS ──────────────────────────────────── */}
						<p className={sectionHeaderCls}>Payment Plans</p>

						<div className="space-y-2">
							{activePlans.map((plan) => (
								<label key={plan.code} className="flex items-center gap-2.5 cursor-pointer">
									<input
										type="checkbox"
										checked={availablePaymentPlans.includes(plan.code)}
										disabled={mutation.isPending}
										onChange={(ev) => {
											const next = ev.target.checked
												? [...availablePaymentPlans, plan.code]
												: availablePaymentPlans.filter((p) => p !== plan.code);
											form.setValue("availablePaymentPlans", next, { shouldDirty: true });
										}}
										className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
									/>
									<span className="text-[13px] text-[#0a0a0a]">{plan.name}</span>
								</label>
							))}
							{activePlans.length === 0 && (
								<p className="text-[13px] text-[#737373] italic">
									No payment plans configured. Add plans under Settings &rarr; Installment Plans.
								</p>
							)}
						</div>

						{hasInstallmentPlan && (
							<>
								<div>
									<label className={labelCls}>Installment Interval (days)</label>
									<input
										type="number"
										min={1}
										{...form.register("installmentIntervalDays", {
											setValueAs: (v) => parseInt(v, 10) || 1,
										})}
										onWheel={(e) => e.currentTarget.blur()}
										className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
									/>
									{e.installmentIntervalDays && (
										<p className="mt-1 text-[11px] text-red-500">{e.installmentIntervalDays.message}</p>
									)}
								</div>

								<div>
									<label className={labelCls}>Grace Period (days)</label>
									<input
										type="number"
										min={0}
										max={90}
										placeholder="Default: 7"
										{...form.register("gracePeriodDays", {
											setValueAs: (v) => (v === "" ? null : parseInt(v, 10)),
										})}
										onWheel={(e) => e.currentTarget.blur()}
										className={inputCls + " [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"}
									/>
									<p className="mt-1 text-[11px] text-[#737373]">
										How many days after an overdue installment before the package locks. Leave blank for the default of 7 days.
									</p>
									{e.gracePeriodDays && (
										<p className="mt-1 text-[11px] text-red-500">{e.gracePeriodDays.message}</p>
									)}
								</div>
							</>
						)}
					</div>

					{/* Footer */}
					<div className="px-8 py-5 border-t border-[#e5e5e5] flex items-center justify-end gap-3 shrink-0">
						<button
							type="button"
							onClick={onClose}
							disabled={mutation.isPending}
							className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] disabled:opacity-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={mutation.isPending}
							className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] disabled:opacity-50"
						>
							{mutation.isPending
								? mode === "create"
									? "Adding…"
									: "Saving…"
								: mode === "create"
									? "Add Service"
									: "Save Changes"}
						</button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}
