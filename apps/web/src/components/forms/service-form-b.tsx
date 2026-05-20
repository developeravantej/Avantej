/**
 * Design B — Step Wizard variant of ServiceFormDialog.
 * Visual layout only — all logic copied verbatim from service-form.tsx.
 * Source: apps/web/src/components/forms/service-form.tsx
 */

import { useEffect, useMemo, useState } from "react";
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
// 4. Step Indicator Component
// ---------------------------------------------------------------------------

const STEPS = [
	{ number: 1, label: "Basics" },
	{ number: 2, label: "Pricing & Expiry" },
	{ number: 3, label: "Plans & Review" },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
	return (
		<div className="flex items-start gap-0">
			{STEPS.map((step, idx) => {
				const isActive = step.number === currentStep;
				const isDone = step.number < currentStep;
				const isLast = idx === STEPS.length - 1;

				return (
					<div key={step.number} className="flex items-start flex-1 min-w-0">
						<div className="flex flex-col items-center">
							{/* Circle */}
							<div
								className={[
									"w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 transition-all",
									isActive
										? "bg-[#0a0a0a] text-white"
										: isDone
											? "bg-[#0a0a0a] text-white"
											: "border-2 border-[#d4d4d4] bg-white text-[#a3a3a3]",
								].join(" ")}
							>
								{isDone ? (
									<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
										<path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
									</svg>
								) : (
									step.number
								)}
							</div>
							{/* Label */}
							<span
								className={[
									"mt-1.5 text-[11px] font-semibold whitespace-nowrap",
									isActive ? "text-[#0a0a0a]" : isDone ? "text-[#0a0a0a]" : "text-[#a3a3a3]",
								].join(" ")}
							>
								{step.label}
							</span>
						</div>
						{/* Connector line */}
						{!isLast && (
							<div className="flex-1 mt-4 mx-2 h-px bg-[#e5e5e5]" />
						)}
					</div>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// 5. Shared input/label style helpers
// ---------------------------------------------------------------------------

const inputCls =
	"border border-[#e5e5e5] rounded-xl px-3 py-2.5 text-[13px] w-full bg-white outline-none focus:ring-2 focus:ring-[#0a0a0a]/10 disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";
const labelCls = "text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-1 block";
const errorCls = "text-[11px] text-red-500 mt-1";

// ---------------------------------------------------------------------------
// 6. Component
// ---------------------------------------------------------------------------

export function ServiceFormDialogB({
	isOpen,
	onClose,
	organizationId,
	mode = "create",
	initialData,
}: ServiceFormDialogProps) {
	const [step, setStep] = useState(1);

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
		if (isOpen) {
			form.reset(buildDefaultValues(initialData));
			setStep(1);
		}
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

	// Step navigation
	async function handleNext() {
		let fieldsToValidate: (keyof ServiceFormInput)[] = [];

		if (step === 1) {
			fieldsToValidate = ["name", "categoryId", "sessionDurationMinutes", "maxAttendees", "schedulingType"];
			if (schedulingType === "time-preset") {
				fieldsToValidate.push("timePresetConfig" as keyof ServiceFormInput);
			}
		} else if (step === 2) {
			fieldsToValidate = ["price", "sessions"];
			if (taxable) fieldsToValidate.push("taxPercentage" as keyof ServiceFormInput);
			if (expirable) fieldsToValidate.push("duration" as keyof ServiceFormInput);
		}

		const valid = await form.trigger(fieldsToValidate);
		if (valid) setStep((s) => s + 1);
	}

	function handleBack() {
		setStep((s) => s - 1);
	}

	// Step meta
	const stepTitles: Record<number, { title: string; subtitle: string }> = {
		1: {
			title: mode === "create" ? "Add New Service" : "Edit Service",
			subtitle: "Set the basics — name, category, duration and scheduling",
		},
		2: {
			title: "Pricing & Expiry",
			subtitle: "Configure price, sessions, tax, and expiry settings",
		},
		3: {
			title: "Payment Plans & Review",
			subtitle: "Choose payment plans and review before submitting",
		},
	};

	const { title, subtitle } = stepTitles[step];

	// ---------------------------------------------------------------------------
	// Render helpers for each step
	// ---------------------------------------------------------------------------

	function renderStep1() {
		const nameError = form.formState.errors.name?.message;
		const categoryError = form.formState.errors.categoryId?.message;
		const durationError = form.formState.errors.sessionDurationMinutes?.message;
		const attendeesError = form.formState.errors.maxAttendees?.message;

		return (
			<div className="space-y-5">
				{/* Service Name */}
				<div>
					<label className={labelCls}>
						Service Name <span className="text-red-500">*</span>
					</label>
					<input
						className={inputCls}
						placeholder="Enter service name"
						{...form.register("name")}
					/>
					{nameError && <p className={errorCls}>{nameError}</p>}
				</div>

				{/* Service Category */}
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
							{isLoadingCategories ? "Loading categories..." : "Select a category"}
						</option>
						{serviceCategories.map((category) => (
							<option key={category.id} value={category.id}>
								{category.name}
							</option>
						))}
					</select>
					{categoryError && <p className={errorCls}>{categoryError}</p>}
				</div>

				{/* Duration + Max Attendees */}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={labelCls}>
							Session Duration (min) <span className="text-red-500">*</span>
						</label>
						<input
							type="number"
							min={1}
							className={inputCls}
							{...form.register("sessionDurationMinutes", {
								valueAsNumber: true,
								onChange: (e) => form.setValue("sessionDurationMinutes", parseInt(e.target.value, 10) || 0),
							})}
							onWheel={(e) => e.currentTarget.blur()}
						/>
						{durationError && <p className={errorCls}>{durationError}</p>}
					</div>
					<div>
						<label className={labelCls}>
							Max Attendees <span className="text-red-500">*</span>
						</label>
						<input
							type="number"
							min={1}
							className={inputCls}
							{...form.register("maxAttendees", {
								valueAsNumber: true,
								onChange: (e) => form.setValue("maxAttendees", parseInt(e.target.value, 10) || 0),
							})}
							onWheel={(e) => e.currentTarget.blur()}
						/>
						{attendeesError && <p className={errorCls}>{attendeesError}</p>}
					</div>
				</div>

				{/* Scheduling Type */}
				<div>
					<label className={labelCls}>
						Scheduling Type <span className="text-red-500">*</span>
					</label>
					<div className="flex gap-6 mt-2">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="schedulingType"
								value="appointment-based"
								checked={schedulingType === "appointment-based"}
								onChange={() => handleSchedulingTypeChange("appointment-based")}
								className="w-4 h-4 accent-[#0a0a0a]"
							/>
							<span className="text-[13px] text-[#0a0a0a]">Appointment-Based</span>
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								name="schedulingType"
								value="time-preset"
								checked={schedulingType === "time-preset"}
								onChange={() => handleSchedulingTypeChange("time-preset")}
								className="w-4 h-4 accent-[#0a0a0a]"
							/>
							<span className="text-[13px] text-[#0a0a0a]">Time-Preset (Fixed Schedule)</span>
						</label>
					</div>
					<p className="text-[12px] text-[#a3a3a3] mt-1.5">
						{schedulingType === "appointment-based"
							? "Sessions are booked flexibly based on coach and client availability"
							: "Sessions occur on predefined recurring time slots (e.g., every Monday 7 PM for classes)"}
					</p>
				</div>

				{/* TimePresetEditor */}
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
	}

	function renderStep2() {
		const priceError = form.formState.errors.price?.message;
		const sessionsError = form.formState.errors.sessions?.message;
		const taxPctError = (form.formState.errors as Record<string, { message?: string }>)["taxPercentage"]?.message;
		const durationError = form.formState.errors.duration?.message;

		return (
			<div className="space-y-5">
				{/* Price + Sessions */}
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className={labelCls}>
							Price (RM) <span className="text-red-500">*</span>
						</label>
						<input
							type="number"
							min={0}
							step={0.01}
							className={inputCls}
							{...form.register("price", {
								valueAsNumber: true,
								onChange: (e) => form.setValue("price", parseFloat(e.target.value) || 0),
							})}
							onWheel={(e) => e.currentTarget.blur()}
						/>
						{priceError && <p className={errorCls}>{priceError}</p>}
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
							{...form.register("sessions", {
								valueAsNumber: true,
								onChange: (e) => form.setValue("sessions", parseInt(e.target.value, 10) || 0),
							})}
							onWheel={(e) => e.currentTarget.blur()}
						/>
						{sessionsError && <p className={errorCls}>{sessionsError}</p>}
					</div>
				</div>

				{/* Credit per session summary card */}
				{sessions > 0 && price > 0 && (
					<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
						<p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-2">Credit per Session</p>
						<div className="space-y-1">
							<div className="flex justify-between text-[13px] text-[#404040]">
								<span>Total Price</span>
								<span>RM {price.toFixed(2)}</span>
							</div>
							<div className="flex justify-between text-[13px] text-[#404040]">
								<span>Sessions</span>
								<span>{sessions}</span>
							</div>
							<div className="flex justify-between text-[13px] font-semibold text-[#0a0a0a] border-t border-[#e5e5e5] pt-1 mt-1">
								<span>Credit per Session</span>
								<span>RM {creditPerSession.toFixed(2)}</span>
							</div>
						</div>
					</div>
				)}

				{/* Taxable */}
				<div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							className="w-4 h-4 accent-[#0a0a0a] rounded"
							{...form.register("taxable")}
						/>
						<span className="text-[13px] text-[#0a0a0a] font-medium">Taxable</span>
					</label>

					{taxable && (
						<div className="mt-3 space-y-3">
							<div>
								<label className={labelCls}>Tax %</label>
								<input
									type="number"
									min={0}
									max={100}
									step={1}
									className={`${inputCls} w-28`}
									{...form.register("taxPercentage", {
										valueAsNumber: true,
										onChange: (e) => form.setValue("taxPercentage", parseInt(e.target.value, 10) || 0),
									})}
									onWheel={(e) => e.currentTarget.blur()}
								/>
								{taxPctError && <p className={errorCls}>{taxPctError}</p>}
							</div>
							<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
								<p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-2">Tax Summary</p>
								<div className="space-y-1">
									<div className="flex justify-between text-[13px] text-[#404040]">
										<span>Base Price</span>
										<span>RM {price.toFixed(2)}</span>
									</div>
									<div className="flex justify-between text-[13px] text-[#404040]">
										<span>Tax ({taxPercentage}%)</span>
										<span>RM {taxAmount.toFixed(2)}</span>
									</div>
									<div className="flex justify-between text-[13px] font-semibold text-[#0a0a0a] border-t border-[#e5e5e5] pt-1 mt-1">
										<span>Total</span>
										<span>RM {totalWithTax.toFixed(2)}</span>
									</div>
								</div>
							</div>
						</div>
					)}
				</div>

				{/* Expirable */}
				<div>
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							className="w-4 h-4 accent-[#0a0a0a] rounded"
							{...form.register("expirable")}
						/>
						<span className="text-[13px] text-[#0a0a0a] font-medium">Expirable</span>
					</label>

					{expirable && (
						<div className="mt-3">
							<label className={labelCls}>
								Duration <span className="text-red-500">*</span>
							</label>
							<div className="flex gap-2">
								<input
									type="number"
									min={1}
									placeholder="1"
									className={`${inputCls} flex-1`}
									{...form.register("duration", {
										valueAsNumber: true,
										onChange: (e) => form.setValue("duration", parseInt(e.target.value, 10) || 1),
									})}
									onWheel={(e) => e.currentTarget.blur()}
								/>
								<select
									{...form.register("duration_unit")}
									className={`${inputCls} flex-1`}
								>
									<option value="day">Day(s)</option>
									<option value="week">Week(s)</option>
									<option value="month">Month(s)</option>
									<option value="year">Year(s)</option>
								</select>
							</div>
							{durationError && <p className={errorCls}>{durationError}</p>}
						</div>
					)}
				</div>
			</div>
		);
	}

	function renderStep3() {
		const intervalError = form.formState.errors.installmentIntervalDays?.message;
		const graceError = form.formState.errors.gracePeriodDays?.message;

		// Review summary values
		const reviewName = form.watch("name");
		const reviewCategory = serviceCategories.find((c) => c.id === form.watch("categoryId"))?.name ?? "—";
		const reviewDuration = form.watch("sessionDurationMinutes");
		const reviewMaxAttendees = form.watch("maxAttendees");
		const reviewPrice = form.watch("price") ?? 0;
		const reviewSessions = form.watch("sessions") ?? 0;
		const reviewTaxable = form.watch("taxable");
		const reviewTaxPct = form.watch("taxPercentage") ?? 0;
		const reviewExpirable = form.watch("expirable");
		const reviewDurationVal = form.watch("duration") ?? 1;
		const reviewDurationUnit = form.watch("duration_unit") ?? "day";
		const reviewScheduling = form.watch("schedulingType");

		return (
			<div className="space-y-5">
				{/* Payment Plans */}
				<div>
					<label className={labelCls}>Payment Plans</label>
					<div className="space-y-2">
						{activePlans.map((plan) => (
							<label key={plan.code} className="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									className="w-4 h-4 accent-[#0a0a0a] rounded"
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
						{activePlans.length === 0 && (
							<p className="text-[12px] text-[#a3a3a3] italic">
								No payment plans configured. Add plans under Settings → Installment Plans.
							</p>
						)}
					</div>
				</div>

				{hasInstallmentPlan && (
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label className={labelCls}>Installment interval (days)</label>
							<input
								type="number"
								min={1}
								className={inputCls}
								{...form.register("installmentIntervalDays", {
									valueAsNumber: true,
									onChange: (e) => form.setValue("installmentIntervalDays", parseInt(e.target.value, 10) || 1),
								})}
								onWheel={(e) => e.currentTarget.blur()}
							/>
							{intervalError && <p className={errorCls}>{intervalError}</p>}
						</div>
						<div>
							<label className={labelCls}>Grace period (days)</label>
							<input
								type="number"
								min={0}
								max={90}
								placeholder="Default: 7"
								className={inputCls}
								{...form.register("gracePeriodDays", {
									setValueAs: (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
								})}
								onWheel={(e) => e.currentTarget.blur()}
							/>
							<p className="text-[11px] text-[#a3a3a3] mt-1">
								How many days after an overdue installment before the package locks. Leave blank for 7-day default.
							</p>
							{graceError && <p className={errorCls}>{graceError}</p>}
						</div>
					</div>
				)}

				{/* Review Summary */}
				<div className="rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-4">
					<p className="text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-3">Review</p>
					<div className="space-y-2">
						{[
							["Name", reviewName || "—"],
							["Category", reviewCategory],
							["Duration", `${reviewDuration} min`],
							["Max Attendees", String(reviewMaxAttendees)],
							["Price", `RM ${reviewPrice.toFixed(2)}`],
							["Sessions", String(reviewSessions)],
							["Tax", reviewTaxable ? `Yes (${reviewTaxPct}%)` : "No"],
							["Expiry", reviewExpirable ? `${reviewDurationVal} ${reviewDurationUnit}(s)` : "No"],
							["Scheduling", reviewScheduling === "time-preset" ? "Time-Preset" : "Appointment-Based"],
						].map(([label, value]) => (
							<div key={label} className="flex justify-between items-center py-1 border-b border-[#e5e5e5] last:border-0">
								<span className="text-[11px] font-semibold uppercase tracking-widest text-[#737373]">{label}</span>
								<span className="text-[13px] text-[#0a0a0a] font-medium">{value}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	// ---------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
				{/* Header — non-scrolling */}
				<div className="px-8 pt-8 pb-6 border-b border-[#e5e5e5] shrink-0">
					<StepIndicator currentStep={step} />
					<div className="mt-6">
						<h2 className="text-[20px] font-extrabold tracking-tight text-[#0a0a0a] leading-tight">{title}</h2>
						<p className="text-[13px] text-[#737373] mt-1">{subtitle}</p>
					</div>
				</div>

				{/* Scrollable body */}
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="flex flex-col flex-1 min-h-0"
				>
					<div className="px-8 py-6 min-h-[340px] overflow-y-auto flex-1">
						{step === 1 && renderStep1()}
						{step === 2 && renderStep2()}
						{step === 3 && renderStep3()}
					</div>

					{/* Footer — non-scrolling */}
					<div className="px-8 py-5 border-t border-[#e5e5e5] flex items-center justify-between shrink-0 bg-white">
						<span className="text-[11px] text-[#a3a3a3]">Step {step} of 3</span>
						<div className="flex items-center gap-2">
							{step > 1 && (
								<button
									type="button"
									onClick={handleBack}
									disabled={mutation.isPending}
									className="border border-[#e5e5e5] bg-white px-4 py-2.5 rounded-[10px] text-[13px] font-medium text-[#404040] hover:bg-[#f3f3f3] disabled:opacity-50 transition-colors"
								>
									Back
								</button>
							)}
							{step < 3 ? (
								<button
									type="button"
									onClick={handleNext}
									className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] transition-colors"
								>
									Next
								</button>
							) : (
								<button
									type="submit"
									disabled={mutation.isPending}
									className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-[10px] text-[13px] font-semibold hover:bg-[#262626] disabled:opacity-50 transition-colors"
								>
									{mutation.isPending
										? mode === "create"
											? "Adding..."
											: "Saving..."
										: mode === "create"
											? "Add Service"
											: "Save Changes"}
								</button>
							)}
						</div>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}
