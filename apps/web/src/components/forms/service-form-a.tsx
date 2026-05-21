/**
 * Design A variant of ServiceFormDialog — two-column modal layout.
 * Same logic as service-form.tsx; only visual layout differs.
 * - Zod schema colocated
 * - organizationId is a prop, never a form field
 * - Prices use z.number().transform((v) => Math.round(v * 100))
 * - timePresetConfig is persisted as a jsonb column when schedulingType = "class_slot"
 * - schedulingType maps: UI "appointment-based" → wire "appointment"; UI "time-preset" → wire "class_slot"
 */

import { useEffect, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import * as z from "zod";

import { useApiMutation } from "@/hooks/useApiMutation";
import { TimePresetEditor } from "@/features/services/components/TimePresetEditor";
import { client, orpc } from "@/utils/orpc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
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
// 4. Design-A shared style tokens
// ---------------------------------------------------------------------------

const labelCls =
	"block text-[11px] font-semibold uppercase tracking-widest text-[#737373] mb-1";
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

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	const first = errors[0];
	const msg =
		typeof first === "string"
			? first
			: (first as { message?: string })?.message || "Invalid value";
	return <p className={errorCls}>{msg}</p>;
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

	function getTimePresetConfig() {
		const values = form.state.values as ServiceFormInput & {
			timePresetConfig?: {
				recurringDays: string[];
				timeSlotsPerDay: Record<string, string[]>;
			};
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
			form.setFieldValue("timePresetConfig" as never, undefined as never);
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

				{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="flex flex-col flex-1 min-h-0"
				>
					<div className="overflow-y-auto flex-1">
						<div className="grid grid-cols-[2fr_3fr] divide-x divide-[#e5e5e5]">
							{/* ── LEFT COLUMN: Basics + Scheduling ── */}
							<div className="px-5 py-4 space-y-4">
								<div>
									<SectionDivider label="Basics" />

									{/* Name */}
									<form.Field name="name">
										{(field) => (
											<div className="mb-4">
												<label htmlFor={field.name} className={labelCls}>
													Service Name <span className="text-red-500">*</span>
												</label>
												<input
													id={field.name}
													type="text"
													placeholder="Enter service name"
													className={inputCls}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									{/* Category */}
									<form.Field name="categoryId">
										{(field) => (
											<div className="mb-4">
												<label htmlFor={field.name} className={labelCls}>
													Category <span className="text-red-500">*</span>
												</label>
												<select
													id={field.name}
													value={field.state.value}
													onChange={(e) => field.handleChange(e.target.value)}
													onBlur={field.handleBlur}
													disabled={isLoadingCategories}
													className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}
												>
													<option value="">
														{isLoadingCategories
															? "Loading categories..."
															: "Select a category"}
													</option>
													{serviceCategories.map((category) => (
														<option key={category.id} value={category.id}>
															{category.name}
														</option>
													))}
												</select>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									{/* Session Duration */}
									<form.Field name="sessionDurationMinutes">
										{(field) => (
											<div className="mb-4">
												<label htmlFor={field.name} className={labelCls}>
													Session Duration (min){" "}
													<span className="text-red-500">*</span>
												</label>
												<input
													id={field.name}
													type="number"
													min={1}
													className={inputCls}
													onWheel={(e) => e.currentTarget.blur()}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(
															parseInt(e.target.value, 10) || 0,
														)
													}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									{/* Max Attendees */}
									<form.Field name="maxAttendees">
										{(field) => (
											<div>
												<label htmlFor={field.name} className={labelCls}>
													Max Attendees <span className="text-red-500">*</span>
												</label>
												<input
													id={field.name}
													type="number"
													min={1}
													className={inputCls}
													onWheel={(e) => e.currentTarget.blur()}
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(
															parseInt(e.target.value, 10) || 0,
														)
													}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>
								</div>

								{/* Scheduling */}
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
											<div>
												<SectionDivider label="Scheduling" />

												<div className="space-y-2 mb-3">
													<label className="flex items-center gap-2 cursor-pointer">
														<input
															type="radio"
															name="schedulingType"
															value="appointment-based"
															checked={schedulingType === "appointment-based"}
															onChange={() =>
																handleSchedulingTypeChange("appointment-based")
															}
															disabled={mutation.isPending}
															className="h-4 w-4 accent-[#0a0a0a]"
														/>
														<span className="text-[13px] text-[#0a0a0a]">
															Appointment-based
														</span>
													</label>
													<label className="flex items-center gap-2 cursor-pointer">
														<input
															type="radio"
															name="schedulingType"
															value="time-preset"
															checked={schedulingType === "time-preset"}
															onChange={() =>
																handleSchedulingTypeChange("time-preset")
															}
															disabled={mutation.isPending}
															className="h-4 w-4 accent-[#0a0a0a]"
														/>
														<span className="text-[13px] text-[#0a0a0a]">
															Time-preset (Fixed Schedule)
														</span>
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
										);
									}}
								</form.Subscribe>
							</div>

							{/* ── RIGHT COLUMN: Pricing, Expiry, Payment Plans ── */}
							<div className="px-5 py-4 space-y-4">
								<div>
									<SectionDivider label="Pricing & Sessions" />

									{/* Price + Sessions row */}
									<div className="grid grid-cols-2 gap-4 mb-3">
										<form.Field name="price">
											{(field) => (
												<div>
													<label htmlFor={field.name} className={labelCls}>
														Price (RM) <span className="text-red-500">*</span>
													</label>
													<input
														id={field.name}
														type="number"
														min={0}
														step={0.01}
														className={inputCls}
														onWheel={(e) => e.currentTarget.blur()}
														value={field.state.value ?? 0}
														onBlur={field.handleBlur}
														onChange={(e) =>
															field.handleChange(parseFloat(e.target.value) || 0)
														}
													/>
													<FieldError errors={field.state.meta.errors} />
												</div>
											)}
										</form.Field>
										<form.Field name="sessions">
											{(field) => (
												<div>
													<label htmlFor={field.name} className={labelCls}>
														Sessions <span className="text-red-500">*</span>
													</label>
													<input
														id={field.name}
														type="number"
														min={0}
														step={1}
														className={inputCls}
														onWheel={(e) => e.currentTarget.blur()}
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) =>
															field.handleChange(
																parseInt(e.target.value, 10) || 0,
															)
														}
													/>
													<FieldError errors={field.state.meta.errors} />
												</div>
											)}
										</form.Field>
									</div>

									{/* Credit per session */}
									<form.Subscribe
										selector={(s) => ({
											price: s.values.price ?? 0,
											sessions: s.values.sessions ?? 0,
										})}
									>
										{({ price, sessions }) => {
											const creditPerSession =
												sessions > 0 ? price / sessions : 0;
											return (
												<p className="text-[12px] text-[#737373] mb-3">
													Credit per session:{" "}
													<span className="font-semibold text-[#0a0a0a]">
														RM{" "}
														{sessions > 0 ? creditPerSession.toFixed(2) : "—"}
													</span>
												</p>
											);
										}}
									</form.Subscribe>

									{/* Taxable */}
									<form.Field name="taxable">
										{(field) => (
											<div className="mb-2">
												<label className="flex items-center gap-2 cursor-pointer">
													<input
														type="checkbox"
														className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
														checked={field.state.value}
														onChange={(e) => field.handleChange(e.target.checked)}
													/>
													<span className="text-[13px] text-[#0a0a0a] font-medium">
														Taxable
													</span>
												</label>
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
												<div className="pl-6 space-y-3">
													<form.Field name="taxPercentage">
														{(field) => (
															<div>
																<label htmlFor={field.name} className={labelCls}>
																	Tax %
																</label>
																<input
																	id={field.name}
																	type="number"
																	min={0}
																	max={100}
																	step={1}
																	className={`${inputCls} w-24`}
																	onWheel={(e) => e.currentTarget.blur()}
																	value={field.state.value ?? ""}
																	onBlur={field.handleBlur}
																	onChange={(e) =>
																		field.handleChange(
																			parseInt(e.target.value, 10) || 0,
																		)
																	}
																/>
																<FieldError errors={field.state.meta.errors} />
															</div>
														)}
													</form.Field>
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
											) : null;
										}}
									</form.Subscribe>
								</div>

								{/* Expiry */}
								<form.Subscribe selector={(s) => s.values.expirable}>
									{(expirable) => (
										<div>
											<SectionDivider label="Expiry" />

											<form.Field name="expirable">
												{(field) => (
													<div className="mb-2">
														<label className="flex items-center gap-2 cursor-pointer">
															<input
																type="checkbox"
																className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
																checked={field.state.value}
																onChange={(e) =>
																	field.handleChange(e.target.checked)
																}
															/>
															<span className="text-[13px] text-[#0a0a0a] font-medium">
																Expirable
															</span>
														</label>
													</div>
												)}
											</form.Field>

											{expirable && (
												<div className="pl-6 mt-2">
													<label className={labelCls}>Duration</label>
													<div className="flex gap-2">
														<form.Field name="duration">
															{(field) => (
																<input
																	type="number"
																	min={1}
																	placeholder="1"
																	className={`${inputCls} flex-1`}
																	onWheel={(e) => e.currentTarget.blur()}
																	value={field.state.value ?? 1}
																	onBlur={field.handleBlur}
																	onChange={(e) =>
																		field.handleChange(
																			parseInt(e.target.value, 10) || 1,
																		)
																	}
																/>
															)}
														</form.Field>
														<form.Field name="duration_unit">
															{(field) => (
																<select
																	className={`${selectCls} flex-1`}
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

								{/* Payment Plans */}
								<div>
									<SectionDivider label="Payment Plans" />

									<form.Subscribe
										selector={(s) => s.values.availablePaymentPlans ?? []}
									>
										{(availablePaymentPlans) => {
											const hasInstallmentPlan = availablePaymentPlans.some(
												(code) =>
													(plansMap.get(code)?.numInstallments ?? 1) > 1,
											);
											return (
												<>
													{activePlans.length === 0 ? (
														<p className="text-[12px] text-[#737373] italic">
															No payment plans configured. Add plans under
															Settings → Installment Plans.
														</p>
													) : (
														<div className="space-y-2 mb-3">
															{activePlans.map((plan) => (
																<label
																	key={plan.code}
																	className="flex items-center gap-2 cursor-pointer"
																>
																	<input
																		type="checkbox"
																		className="h-4 w-4 accent-[#0a0a0a] cursor-pointer"
																		id={`plan-a-${plan.code}`}
																		checked={availablePaymentPlans.includes(
																			plan.code,
																		)}
																		disabled={mutation.isPending}
																		onChange={(e) => {
																			const next = e.target.checked
																				? [
																						...availablePaymentPlans,
																						plan.code,
																					]
																				: availablePaymentPlans.filter(
																						(p) => p !== plan.code,
																					);
																			form.setFieldValue(
																				"availablePaymentPlans",
																				next,
																			);
																		}}
																	/>
																	<span className="text-[13px] text-[#0a0a0a]">
																		{plan.name}
																	</span>
																</label>
															))}
														</div>
													)}

													{hasInstallmentPlan && (
														<div className="pl-6 space-y-3">
															<form.Field name="installmentIntervalDays">
																{(field) => (
																	<div>
																		<label
																			htmlFor={field.name}
																			className={labelCls}
																		>
																			Installment interval (days)
																		</label>
																		<input
																			id={field.name}
																			type="number"
																			min={1}
																			className={`${inputCls} w-40`}
																			onWheel={(e) => e.currentTarget.blur()}
																			value={field.state.value ?? ""}
																			onBlur={field.handleBlur}
																			onChange={(e) =>
																				field.handleChange(
																					parseInt(e.target.value, 10) || 1,
																				)
																			}
																		/>
																		<FieldError
																			errors={field.state.meta.errors}
																		/>
																	</div>
																)}
															</form.Field>
															<form.Field name="gracePeriodDays">
																{(field) => (
																	<div>
																		<label
																			htmlFor={field.name}
																			className={labelCls}
																		>
																			Grace period (days)
																		</label>
																		<input
																			id={field.name}
																			type="number"
																			min={0}
																			max={90}
																			placeholder="Default: 7"
																			className={`${inputCls} w-40`}
																			onWheel={(e) => e.currentTarget.blur()}
																			value={field.state.value ?? ""}
																			onBlur={field.handleBlur}
																			onChange={(e) => {
																				const val = e.target.value;
																				field.handleChange(
																					val === "" ? null : parseInt(val, 10),
																				);
																			}}
																		/>
																		<p className="mt-1 text-[11px] text-[#737373]">
																			Days after overdue installment before
																			package locks. Blank = 7 days.
																		</p>
																		<FieldError
																			errors={field.state.meta.errors}
																		/>
																	</div>
																)}
															</form.Field>
														</div>
													)}
												</>
											);
										}}
									</form.Subscribe>
								</div>
							</div>
						</div>
					</div>

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
