import React, { useState } from "react";
import { UserPlus, X, ThumbsDown, Calendar, Plus, Minus } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
	TooltipProvider,
} from "@/components/ui/tooltip";
import { type TestAppointmentData } from "./test-appointment.types";
import { ClientPicker } from "./ClientPicker";
import { ServicePicker } from "./ServicePicker";
import { DateTimePicker } from "./DateTimePicker";
import { RepeatRuleSection } from "./RepeatRuleSection";
import { RoomPicker } from "./RoomPicker";
import { StaffPicker, type CommissionSlot } from "./StaffPicker";
import type {
	TeamMember,
	Client,
	Service,
	AppointmentSlot,
	NewAppointment,
	OnSubmitPayload,
} from "@/types/appointments";
import type { ClassSlotOption } from "@/hooks/useAppointmentFormState";

type AppointmentFormContentProps = {
	// Data
	clients: Client[];
	services: Service[];
	rooms: { id: string; name: string; capacity?: number | null; type: string }[];
	trainers: { id: string; name: string; role: string; department: string }[];
	teamMembers: TeamMember[];
	onSubmit: (payload: OnSubmitPayload) => void;
	onClose: () => void;
	// State
	newAppointment: NewAppointment;
	isServiceDialogOpen: boolean;
	setIsServiceDialogOpen: (v: boolean) => void;
	isMultiAppointment: boolean;
	setIsMultiAppointment: (v: boolean) => void;
	isBlockedTiming: boolean;
	setIsBlockedTiming: (v: boolean) => void;
	appointmentSlots: AppointmentSlot[];
	setAppointmentSlots: React.Dispatch<React.SetStateAction<AppointmentSlot[]>>;
	selectedAppointmentId: string | null;
	setSelectedAppointmentId: (v: string | null) => void;
	isTestDialogOpen: boolean;
	setIsTestDialogOpen: (v: boolean) => void;
	testAppointmentData: TestAppointmentData | null;
	setTestAppointmentData: (v: TestAppointmentData | null) => void;
	selectedClassSlotId: string | null;
	setSelectedClassSlotId: (v: string | null) => void;
	additionalSlotTrainers: string[];
	setAdditionalSlotTrainers: React.Dispatch<React.SetStateAction<string[]>>;
	// Derived
	derivedTrainers: {
		id: string;
		name: string;
		role: string;
		department: string;
	}[];
	trainerFilterActive: boolean;
	trainerFilterFallback: boolean;
	isLoadingPackages: boolean;
	purchasedServiceIds: Set<string>;
	selectedClassSlotService: Service | null;
	commissionSlots: CommissionSlot[];
	classSlotOptions: ClassSlotOption[];
	trainerPlaceholder: string;
	// Utility
	getWeekPosition: (date: Date) => string;
	formatDuration: (minutes: number) => string;
	// Handlers
	handleClientChange: (clientId: string) => void;
	handleInputChange: (field: string, value: string | number) => void;
	addService: (serviceId: string) => void;
	removeService: (serviceId: string) => void;
	adjustDuration: (increment: number) => void;
	handleCustomRecurrenceChange: (field: string, value: unknown) => void;
	toggleDay: (day: string) => void;
	addNewAppointmentSlot: () => void;
	removeAppointmentSlot: (slotId: string) => void;
	selectAppointmentSlot: (slotId: string) => void;
	updateAppointmentSlot: (
		slotId: string,
		field: string,
		value: unknown,
	) => void;
	addServiceToSlot: (slotId: string, serviceId: string) => void;
	removeServiceFromSlot: (slotId: string, serviceId: string) => void;
	handleMultiAppointmentToggle: () => void;
	handleBlockedTimingToggle: () => void;
	resetForm: () => void;
	clearAllForm: () => void;
	handleClose: () => void;
	handleSubmit: () => void;
};

// react-doctor-disable-next-line react-doctor/no-many-boolean-props -- TODO: refactor to discriminated union (deeply coupled to surrounding multi-step appointment workflow state)
// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
export function AppointmentFormContent({
	clients,
	services,
	rooms,
	trainers,
	teamMembers: _teamMembers,
	onSubmit,
	onClose,
	newAppointment,
	isServiceDialogOpen: _isServiceDialogOpen,
	setIsServiceDialogOpen: _setIsServiceDialogOpen,
	isMultiAppointment,
	setIsMultiAppointment,
	isBlockedTiming,
	setIsBlockedTiming,
	appointmentSlots,
	setAppointmentSlots,
	selectedAppointmentId,
	setSelectedAppointmentId,
	isTestDialogOpen,
	setIsTestDialogOpen,
	testAppointmentData,
	setTestAppointmentData,
	selectedClassSlotId,
	setSelectedClassSlotId,
	additionalSlotTrainers,
	setAdditionalSlotTrainers,
	derivedTrainers,
	trainerFilterActive,
	trainerFilterFallback,
	isLoadingPackages,
	purchasedServiceIds,
	selectedClassSlotService,
	commissionSlots,
	classSlotOptions,
	trainerPlaceholder,
	getWeekPosition,
	formatDuration,
	handleClientChange,
	handleInputChange,
	addService,
	removeService,
	adjustDuration: _adjustDuration,
	handleCustomRecurrenceChange,
	toggleDay,
	addNewAppointmentSlot,
	removeAppointmentSlot,
	selectAppointmentSlot,
	updateAppointmentSlot,
	addServiceToSlot,
	removeServiceFromSlot,
	handleMultiAppointmentToggle,
	handleBlockedTimingToggle,
	resetForm,
	clearAllForm,
	handleClose,
	handleSubmit,
}: AppointmentFormContentProps) {
	// Multi-slot service dialog state (separate from ServicePicker's internal dialog)
	const [multiSlotDialogOpen, setMultiSlotDialogOpen] = useState(false);

	const selectedSlot = appointmentSlots.find(
		(s) => s.id === selectedAppointmentId,
	);

	return (
		<Dialog
			open
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent
				hideCloseButton
				className="!max-w-[860px] w-full max-h-[90vh] p-0 overflow-hidden bg-white border border-[#e5e5e5] rounded-2xl"
			>
				<DialogHeader className="sr-only">
					<DialogTitle>Add Appointment</DialogTitle>
					<DialogDescription>
						Create a new appointment by selecting a customer, services, date,
						and trainer.
					</DialogDescription>
				</DialogHeader>
				<div className="overflow-y-auto w-full px-0">
					<TooltipProvider>
						<div className="flex min-h-0">
							{/* Profile sidebar */}
							<div className="w-[200px] shrink-0 bg-[#f3f3f3] border-r border-[#e5e5e5] rounded-l-2xl p-6 flex flex-col gap-y-4">
								<div className="size-16 bg-[#d6cdb1] rounded-full flex items-center justify-center">
									<UserPlus className="size-8 text-[#0a0a0a]" />
								</div>
								<div className="space-y-1">
									<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
										Customer
									</p>
									<h3 className="text-base font-bold text-[#0a0a0a] leading-tight">
										{newAppointment.clientId
											? (clients.find((c) => c.id === newAppointment.clientId)
													?.name ?? "Select Customer")
											: "Select Customer"}
									</h3>
									{newAppointment.clientId && (
										<div className="flex gap-1.5 text-xs text-[#737373] items-center mt-1">
											<div className="size-5 bg-rose-100 rounded-full flex items-center justify-center">
												<ThumbsDown className="size-3 text-rose-600" />
											</div>
											<span>0 No-shows</span>
										</div>
									)}
								</div>
								<div className="w-full h-px bg-[#e5e5e5]" />
								<div className="space-y-4 w-full">
									<div className="text-left">
										<div className="flex flex-col gap-0.5 text-sm">
											<span className="text-[10px] font-bold tracking-widest uppercase text-[#737373]">
												Branch
											</span>
											<span className="font-semibold text-[#0a0a0a] text-sm">
												Move Private Fitness
											</span>
											<div className="flex gap-1.5 items-center mt-0.5">
												<Calendar className="size-3.5 text-[#737373]" />
												<span className="text-xs font-mono tabular-nums text-[#737373]">
													{new Date().toLocaleDateString("en-US", {
														month: "2-digit",
														day: "2-digit",
														year: "numeric",
													})}
												</span>
											</div>
										</div>
									</div>
									{newAppointment.clientId && (
										<div className="space-y-2">
											<div className="flex items-center gap-2">
												<Label className="text-sm font-medium text-[#0a0a0a]">
													Multi-Appointment
												</Label>
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															className="size-5 rounded-full bg-[#e5e5e5] text-[#737373] hover:bg-[#d6cdb1] hover:text-[#0a0a0a] flex items-center justify-center text-xs font-medium"
														>
															?
														</button>
													</TooltipTrigger>
													<TooltipContent
														side="top"
														align="start"
														className="z-[10002] bg-white border border-[#e5e5e5] text-[#0a0a0a] font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
													>
														<p className="text-[#0a0a0a] font-medium">
															Enable to create multiple appointments for the
															same customer with different time slots.
														</p>
													</TooltipContent>
												</Tooltip>
											</div>
											<div className="flex items-center gap-x-3">
												<button
													type="button"
													onClick={handleMultiAppointmentToggle}
													className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
														isMultiAppointment ? "bg-[#0a0a0a]" : "bg-[#e5e5e5]"
													}`}
												>
													<span
														className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
															isMultiAppointment
																? "translate-x-6"
																: "translate-x-1"
														}`}
													/>
												</button>
												<span className="text-sm text-[#737373]">
													{isMultiAppointment ? "Enabled" : "Disabled"}
												</span>
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Form area */}
							<div className="flex-1 min-w-0 rounded-r-2xl py-2 flex flex-col items-center font-semibold">
								<div className="w-full px-6 pt-4 pb-5 border-b border-[#e5e5e5]">
									<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-0.5">
										APPOINTMENTS
									</p>
									<h1 className="text-[22px] font-extrabold tracking-tight leading-tight text-[#0a0a0a]">
										New Booking
									</h1>
								</div>

								{/* Client picker — shown when no client and not blocked timing */}
								{!newAppointment.clientId && !isBlockedTiming && (
									<ClientPicker
										clients={clients}
										clientId={newAppointment.clientId}
										onClientChange={handleClientChange}
										onBlockedTimingToggle={handleBlockedTimingToggle}
									/>
								)}

								{/* Blocked Timing Form */}
								{isBlockedTiming && (
									<div className="w-full px-6">
										<div className="space-y-6">
											<DateTimePicker
												startDate={newAppointment.startDate}
												startTime={newAppointment.startTime}
												duration={newAppointment.duration}
												formatDuration={formatDuration}
												onChangePatch={(patch) => {
													if (patch.startDate !== undefined)
														handleInputChange("startDate", patch.startDate);
													if (patch.startTime !== undefined)
														handleInputChange("startTime", patch.startTime);
													if (patch.duration !== undefined)
														handleInputChange("duration", patch.duration);
												}}
												required
											/>
											<RepeatRuleSection
												recurrence={newAppointment.recurrence}
												customRecurrence={newAppointment.customRecurrence}
												startDate={newAppointment.startDate}
												getWeekPosition={getWeekPosition}
												onChangeRecurrence={(v) =>
													handleInputChange("recurrence", v)
												}
												onChangeCustomRecurrence={handleCustomRecurrenceChange}
												onToggleDay={toggleDay}
												tooltipText="Set how often this blocked time repeats."
											/>
											{/* Trainer for blocked time */}
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<Label
														htmlFor="employeeId"
														className="text-sm font-medium text-[#0a0a0a]"
													>
														Trainer
													</Label>
													<Tooltip>
														<TooltipTrigger asChild>
															<button
																type="button"
																className="size-5 rounded-full bg-[#e5e5e5] text-[#737373] hover:bg-brand-secondary-2 hover:text-[#0a0a0a] flex items-center justify-center text-xs font-medium"
															>
																?
															</button>
														</TooltipTrigger>
														<TooltipContent
															side="top"
															align="start"
															className="z-[10002] bg-[#e5e5e5] text-[#0a0a0a] font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
														>
															<p className="text-black font-medium">
																Select the trainer for this blocked time.
															</p>
														</TooltipContent>
													</Tooltip>
												</div>
												<Select
													value={newAppointment.employeeId}
													onValueChange={(v) =>
														handleInputChange("employeeId", v)
													}
												>
													<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
														<SelectValue placeholder="Select trainer (optional)" />
													</SelectTrigger>
													<SelectContent className="z-[10001]">
														{trainers.map((t) => (
															<SelectItem key={t.id} value={t.id}>
																{t.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<div className="space-y-2">
												<Label
													htmlFor="remarks"
													className="text-sm font-medium text-[#0a0a0a]"
												>
													Remarks
												</Label>
												<Textarea
													id="remarks"
													value={newAppointment.remarks}
													onChange={(e) =>
														handleInputChange("remarks", e.target.value)
													}
													placeholder="Enter reason for blocked time..."
													rows={3}
													className="border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]"
												/>
											</div>
											<div className="flex gap-x-3 pt-4">
												<Button
													variant="outline"
													onClick={() => {
														setIsBlockedTiming(false);
														resetForm();
													}}
													className="flex-1 border border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#f3f3f3]"
												>
													Cancel
												</Button>
												<Button
													onClick={handleSubmit}
													className="flex-1 bg-red-600 hover:bg-red-700 text-white"
													disabled={
														!newAppointment.startDate ||
														!newAppointment.startTime ||
														newAppointment.duration === 0
													}
												>
													Create Blocked Time
												</Button>
											</div>
										</div>
									</div>
								)}

								{/* Main appointment form — shown after a client is selected */}
								{newAppointment.clientId && (
									<div className="grid grid-cols-6 grid-rows-5 w-full">
										{/* Left column: client, slots/services */}
										<div className="col-span-3 row-span-5 border-r border-[#e5e5e5] p-2 flex flex-col gap-y-4">
											{/* Customer row (shown again once selected) */}
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<Label
														htmlFor="clientId"
														className="text-sm font-medium text-[#0a0a0a]"
													>
														Customer *
													</Label>
												</div>
												<div className="flex gap-2">
													<Select
														value={newAppointment.clientId}
														onValueChange={handleClientChange}
													>
														<SelectTrigger className="flex-1 border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
															<SelectValue placeholder="Search Customer by Name" />
														</SelectTrigger>
														<SelectContent className="z-[10001]">
															{clients.map((client) => (
																<SelectItem key={client.id} value={client.id}>
																	<div className="flex items-center justify-between w-full">
																		<span className="font-medium pr-2">
																			{client.name}
																		</span>
																		<span className="text-sm text-[#737373]">
																			{client.email}
																		</span>
																	</div>
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<Button
														type="button"
														variant="outline"
														size="default"
														className="px-5 border-[#e5e5e5] hover:bg-[#f3f3f3]"
														onClick={() => {
															/* Add your plus button functionality here */
														}}
													>
														<UserPlus className="size-5" />
													</Button>
												</div>
											</div>

											{/* Multi-slot: add button + slot cards */}
											{isMultiAppointment && (
												<div className="space-y-2">
													<Button
														type="button"
														variant="outline"
														className="w-full border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#f3f3f3] justify-start"
														onClick={addNewAppointmentSlot}
														disabled={appointmentSlots.length >= 5}
													>
														<Plus className="size-4 mr-2" />
														Add New Appointment{" "}
														{appointmentSlots.length >= 5 ? "(Max 5)" : ""}
													</Button>

													{appointmentSlots.length > 0 && (
														<div className="space-y-2">
															<Label className="text-sm font-medium text-[#0a0a0a]">
																Appointments:
															</Label>
															<div className="space-y-2 max-h-[475px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-brand-secondary-2 [&::-webkit-scrollbar-thumb]:rounded-full">
																{appointmentSlots.map((slot, index) => (
																	<Card
																		key={slot.id}
																		className={`cursor-pointer transition-colors ${
																			selectedAppointmentId === slot.id
																				? "border-[#0a0a0a] bg-[#f3f3f3]"
																				: "border-[#e5e5e5] hover:border-[#e5e5e5]"
																		}`}
																		onClick={() =>
																			selectAppointmentSlot(slot.id)
																		}
																	>
																		<CardContent className="p-3">
																			<div className="flex items-center justify-between mb-3">
																				<div className="flex items-center gap-2">
																					<div
																						className={`size-3 rounded-full ${selectedAppointmentId === slot.id ? "bg-blue-500" : "bg-brand-secondary-2"}`}
																					/>
																					<div>
																						<div className="text-sm font-medium text-[#0a0a0a]">
																							Appointment {index + 1}
																						</div>
																						<div className="text-xs text-[#737373]">
																							{slot.startDate} at{" "}
																							{slot.startTime}
																							{slot.endTime &&
																								` → ${slot.endTime}`}
																							{slot.duration > 0 &&
																								` • ${formatDuration(slot.duration)}`}
																						</div>
																					</div>
																				</div>
																				<Button
																					type="button"
																					variant="ghost"
																					size="sm"
																					onClick={(e) => {
																						e.stopPropagation();
																						removeAppointmentSlot(slot.id);
																					}}
																					className="size-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
																				>
																					<X className="size-3" />
																				</Button>
																			</div>
																			{/* Service list for this slot */}
																			<div className="space-y-2">
																				<div className="flex items-center gap-2">
																					<Label className="text-xs font-medium text-[#737373]">
																						Services:
																					</Label>
																					<Button
																						type="button"
																						variant="outline"
																						size="sm"
																						className="h-6 px-2 text-xs border-[#e5e5e5] hover:bg-[#f3f3f3]"
																						onClick={(e) => {
																							e.stopPropagation();
																							setSelectedAppointmentId(slot.id);
																							setMultiSlotDialogOpen(true);
																						}}
																					>
																						<Plus className="size-3 mr-1" />
																						Add
																					</Button>
																				</div>
																				{slot.selectedServices.length > 0 ? (
																					<div className="space-y-1">
																						{slot.selectedServices.map(
																							(serviceId) => {
																								const svc = services.find(
																									(s) => s.id === serviceId,
																								);
																								return svc ? (
																									<div
																										key={serviceId}
																										className="flex items-center justify-between p-2 bg-white border border-[#e5e5e5] rounded text-xs"
																									>
																										<div className="flex items-center gap-2">
																											<div className="size-1.5 bg-green-500 rounded-full" />
																											<span className="font-medium text-[#0a0a0a]">
																												{svc.name}
																											</span>
																											<span className="text-[#737373]">
																												({svc.durationMinutes}m)
																											</span>
																										</div>
																										<Button
																											type="button"
																											variant="ghost"
																											size="sm"
																											onClick={(e) => {
																												e.stopPropagation();
																												removeServiceFromSlot(
																													slot.id,
																													serviceId,
																												);
																											}}
																											className="size-4 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
																										>
																											<X className="size-2.5" />
																										</Button>
																									</div>
																								) : null;
																							},
																						)}
																					</div>
																				) : (
																					<div className="text-center py-2 text-brand-secondary-2 text-xs">
																						No services selected
																					</div>
																				)}
																			</div>
																		</CardContent>
																	</Card>
																))}
															</div>
														</div>
													)}
												</div>
											)}

											{/* Single mode: ServicePicker */}
											{!isMultiAppointment && (
												<ServicePicker
													services={services}
													selectedServiceIds={newAppointment.selectedServices}
													purchasedServiceIds={purchasedServiceIds}
													isLoadingPackages={isLoadingPackages}
													selectedClassSlotService={selectedClassSlotService}
													classSlotOptions={classSlotOptions}
													selectedClassSlotId={selectedClassSlotId}
													onAddService={addService}
													onRemoveService={removeService}
													onSelectClassSlot={(slotId, dateStr, startTime) => {
														setSelectedClassSlotId(slotId);
														handleInputChange("startDate", dateStr);
														handleInputChange("startTime", startTime);
													}}
													isBlockedTiming={isBlockedTiming}
													clientId={newAppointment.clientId}
												/>
											)}
										</div>

										{/* Multi-slot service dialog */}
										<Dialog
											open={multiSlotDialogOpen && !!selectedAppointmentId}
											onOpenChange={(o) => {
												if (!o) setMultiSlotDialogOpen(false);
											}}
										>
											<DialogContent className="sm:max-w-md">
												<DialogHeader>
													<DialogTitle>Select Services</DialogTitle>
													<DialogDescription>
														Choose services to add to this appointment slot.
													</DialogDescription>
												</DialogHeader>
												{selectedAppointmentId && (
													<div className="space-y-2 max-h-60 overflow-y-auto">
														{(() => {
															const currentSlot = appointmentSlots.find(
																(s) => s.id === selectedAppointmentId,
															);
															const available = services.filter((svc) => {
																if (
																	svc.schedulingType !== "class_slot" &&
																	!purchasedServiceIds.has(svc.id)
																)
																	return false;
																return !currentSlot?.selectedServices.includes(
																	svc.id,
																);
															});
															if (available.length === 0) {
																return (
																	<div className="text-center py-4 text-[#737373] text-sm">
																		All available services have been selected
																	</div>
																);
															}
															return available.map((svc) => (
																<button
																	key={svc.id}
																	type="button"
																	className="flex items-center justify-between p-3 border border-[#e5e5e5] rounded-lg hover:bg-[#f3f3f3] cursor-pointer w-full bg-transparent text-left"
																	onClick={() => {
																		addServiceToSlot(
																			selectedAppointmentId,
																			svc.id,
																		);
																		setMultiSlotDialogOpen(false);
																	}}
																>
																	<div className="flex justify-between w-full">
																		<span className="font-medium pr-2">
																			{svc.name}
																		</span>
																		<span className="text-sm text-[#737373]">
																			{svc.durationMinutes} min
																		</span>
																	</div>
																</button>
															));
														})()}
													</div>
												)}
											</DialogContent>
										</Dialog>

										{/* Right column: slot editor / single appointment form */}
										<div className="col-span-3 row-span-5 p-2 flex flex-col gap-y-4">
											{/* Multi-slot selected slot editor */}
											{isMultiAppointment &&
												selectedAppointmentId &&
												selectedSlot && (
													<>
														<div className="mb-4 p-3 bg-[#f3f3f3] border border-[#e5e5e5] rounded-xl">
															<div className="flex items-center gap-2">
																<div className="size-2 bg-[#0a0a0a] rounded-full" />
																<h3 className="text-sm font-semibold text-[#0a0a0a]">
																	Editing: Appointment{" "}
																	{appointmentSlots.findIndex(
																		(s) => s.id === selectedAppointmentId,
																	) + 1}
																</h3>
															</div>
															<div className="text-xs text-[#737373] mt-1">
																{selectedSlot.startDate} at{" "}
																{selectedSlot.startTime} •{" "}
																{formatDuration(selectedSlot.duration)}
																{selectedSlot.endTime && (
																	<span className="ml-2">
																		→ {selectedSlot.endTime}
																	</span>
																)}
															</div>
														</div>

														<div className="space-y-4 mb-6 p-4 bg-[#f3f3f3] rounded-lg border">
															<h4 className="text-sm font-semibold text-[#0a0a0a]">
																Edit Appointment Details
															</h4>
															{/* Date and Time */}
															<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
																<div className="space-y-2">
																	<Label className="text-sm font-medium text-[#0a0a0a]">
																		Date
																	</Label>
																	<Input
																		type="date"
																		value={selectedSlot.startDate}
																		onChange={(e) =>
																			updateAppointmentSlot(
																				selectedSlot.id,
																				"startDate",
																				e.target.value,
																			)
																		}
																		className="border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]"
																	/>
																</div>
																<div className="space-y-2">
																	<Label className="text-sm font-medium text-[#0a0a0a]">
																		Start Time
																	</Label>
																	<div className="flex gap-2">
																		<div className="flex-1">
																			<Select
																				value={
																					selectedSlot.startTime
																						? selectedSlot.startTime.split(
																								":",
																							)[0]
																						: ""
																				}
																				onValueChange={(hour) => {
																					const currentMinute =
																						selectedSlot.startTime?.split(
																							":",
																						)[1] ?? "00";
																					updateAppointmentSlot(
																						selectedSlot.id,
																						"startTime",
																						`${hour.padStart(2, "0")}:${currentMinute}`,
																					);
																				}}
																			>
																				<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
																					<SelectValue placeholder="Hour" />
																				</SelectTrigger>
																				<SelectContent className="z-[10001]">
																					{Array.from(
																						{ length: 24 },
																						(_, h) => {
																							const h12 =
																								h === 0
																									? 12
																									: h > 12
																										? h - 12
																										: h;
																							const ap = h < 12 ? "AM" : "PM";
																							return (
																								<SelectItem
																									key={h}
																									value={h
																										.toString()
																										.padStart(2, "0")}
																								>
																									{h12} {ap}
																								</SelectItem>
																							);
																						},
																					)}
																				</SelectContent>
																			</Select>
																		</div>
																		<div className="flex-1">
																			<Select
																				value={
																					selectedSlot.startTime
																						? selectedSlot.startTime.split(
																								":",
																							)[1]
																						: ""
																				}
																				onValueChange={(minute) => {
																					const currentHour =
																						selectedSlot.startTime?.split(
																							":",
																						)[0] ?? "00";
																					updateAppointmentSlot(
																						selectedSlot.id,
																						"startTime",
																						`${currentHour}:${minute}`,
																					);
																				}}
																			>
																				<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
																					<SelectValue placeholder="Minute" />
																				</SelectTrigger>
																				<SelectContent className="z-[10001]">
																					{["00", "15", "30", "45"].map((m) => (
																						<SelectItem key={m} value={m}>
																							{m}
																						</SelectItem>
																					))}
																				</SelectContent>
																			</Select>
																		</div>
																	</div>
																</div>
															</div>
															{/* Room and Employee */}
															<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
																<div className="space-y-2">
																	<Label className="text-sm font-medium text-[#0a0a0a]">
																		Area
																	</Label>
																	<Select
																		value={selectedSlot.roomId}
																		onValueChange={(v) =>
																			updateAppointmentSlot(
																				selectedSlot.id,
																				"roomId",
																				v,
																			)
																		}
																	>
																		<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
																			<SelectValue placeholder="Please Choose..." />
																		</SelectTrigger>
																		<SelectContent className="z-[10001]">
																			{rooms.map((room) => (
																				<SelectItem
																					key={room.id}
																					value={room.id}
																				>
																					{room.name}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</div>
																<div className="space-y-2">
																	<Label className="text-sm font-medium text-[#0a0a0a]">
																		Trainer
																	</Label>
																	<Select
																		value={selectedSlot.employeeId}
																		onValueChange={(v) =>
																			updateAppointmentSlot(
																				selectedSlot.id,
																				"employeeId",
																				v,
																			)
																		}
																	>
																		<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
																			<SelectValue placeholder="Select a trainer" />
																		</SelectTrigger>
																		<SelectContent className="z-[10001]">
																			{trainers.map((t) => (
																				<SelectItem key={t.id} value={t.id}>
																					{t.name}
																				</SelectItem>
																			))}
																		</SelectContent>
																	</Select>
																</div>
															</div>
															{/* Duration */}
															<div className="space-y-2">
																<Label className="text-sm font-medium text-[#0a0a0a]">
																	Duration
																</Label>
																<div className="flex items-center gap-2">
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		onClick={() =>
																			updateAppointmentSlot(
																				selectedSlot.id,
																				"duration",
																				Math.max(5, selectedSlot.duration - 5),
																			)
																		}
																		className="size-10 p-0 border-[#e5e5e5] hover:bg-[#f3f3f3]"
																		disabled={selectedSlot.duration <= 5}
																	>
																		<Minus className="size-4" />
																	</Button>
																	<div className="flex-1 text-center py-2 px-3 bg-white border border-[#e5e5e5] rounded-md">
																		<span className="text-sm font-medium text-[#0a0a0a]">
																			{formatDuration(selectedSlot.duration)}
																		</span>
																	</div>
																	<Button
																		type="button"
																		variant="outline"
																		size="sm"
																		onClick={() =>
																			updateAppointmentSlot(
																				selectedSlot.id,
																				"duration",
																				selectedSlot.duration + 5,
																			)
																		}
																		className="size-10 p-0 border-[#e5e5e5] hover:bg-[#f3f3f3]"
																	>
																		<Plus className="size-4" />
																	</Button>
																</div>
																<div className="text-xs text-[#737373] text-center">
																	START: {selectedSlot.startTime} | END:{" "}
																	{selectedSlot.endTime ||
																		(() => {
																			const parts = selectedSlot.startTime
																				.split(":")
																				.map(Number);
																			const h = parts[0] ?? 0;
																			const m = parts[1] ?? 0;
																			const total =
																				h * 60 + m + selectedSlot.duration;
																			return (
																				`${Math.floor(total / 60) % 24}`.padStart(
																					2,
																					"0",
																				) +
																				":" +
																				`${total % 60}`.padStart(2, "0")
																			);
																		})()}
																</div>
															</div>
															{/* Remarks */}
															<div className="space-y-2">
																<Label className="text-sm font-medium text-[#0a0a0a]">
																	Remarks
																</Label>
																<Textarea
																	value={selectedSlot.remarks}
																	onChange={(e) =>
																		updateAppointmentSlot(
																			selectedSlot.id,
																			"remarks",
																			e.target.value,
																		)
																	}
																	placeholder="Enter any additional remarks for this appointment..."
																	rows={2}
																	className="border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]"
																/>
															</div>
														</div>
													</>
												)}

											{/* Single appointment form */}
											{!isMultiAppointment && (
												<div className="space-y-6">
													<DateTimePicker
														startDate={newAppointment.startDate}
														startTime={newAppointment.startTime}
														duration={newAppointment.duration}
														formatDuration={formatDuration}
														onChangePatch={(patch) => {
															if (patch.startDate !== undefined)
																handleInputChange("startDate", patch.startDate);
															if (patch.startTime !== undefined)
																handleInputChange("startTime", patch.startTime);
															if (patch.duration !== undefined)
																handleInputChange("duration", patch.duration);
														}}
														lockedByClassSlot={!!selectedClassSlotId}
														required
													/>
													<RepeatRuleSection
														recurrence={newAppointment.recurrence}
														customRecurrence={newAppointment.customRecurrence}
														startDate={newAppointment.startDate}
														getWeekPosition={getWeekPosition}
														onChangeRecurrence={(v) =>
															handleInputChange("recurrence", v)
														}
														onChangeCustomRecurrence={
															handleCustomRecurrenceChange
														}
														onToggleDay={toggleDay}
													/>

													<div className="space-y-4">
														<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
															<RoomPicker
																rooms={rooms}
																value={newAppointment.roomId}
																onChange={(v) => handleInputChange("roomId", v)}
																onNavigateAway={onClose}
															/>
															<StaffPicker
																trainers={derivedTrainers}
																commissionSlots={commissionSlots}
																employeeId={newAppointment.employeeId}
																additionalSlotTrainers={additionalSlotTrainers}
																onChangeEmployeeId={(v) =>
																	handleInputChange("employeeId", v)
																}
																onChangeAdditionalTrainer={(idx, v) => {
																	setAdditionalSlotTrainers((prev) => {
																		const next = [...prev];
																		next[idx] = v;
																		return next;
																	});
																}}
																trainerPlaceholder={trainerPlaceholder}
																disableWhenNoRoom
																roomId={newAppointment.roomId}
																trainerFilterActive={trainerFilterActive}
																trainerFilterFallback={trainerFilterFallback}
															/>
														</div>
													</div>

													<div className="space-y-4">
														<div className="space-y-2">
															<Label
																htmlFor="remarks"
																className="text-sm font-medium text-[#0a0a0a]"
															>
																Remarks
															</Label>
															<Textarea
																id="remarks"
																value={newAppointment.remarks}
																onChange={(e) =>
																	handleInputChange("remarks", e.target.value)
																}
																placeholder="Enter any additional remarks..."
																rows={3}
																className="border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]"
															/>
														</div>
													</div>
												</div>
											)}
										</div>
									</div>
								)}

								{/* Action Buttons */}
								{newAppointment.clientId && (
									<div className="px-6 pt-4">
										<div className="flex gap-x-3">
											<Button
												variant="outline"
												onClick={clearAllForm}
												className="flex-1 border border-[#e5e5e5] text-[#0a0a0a] hover:bg-[#f3f3f3]"
											>
												Reset
											</Button>
											<Button
												onClick={handleSubmit}
												className="flex-1 bg-[#0a0a0a] hover:bg-[#262626] text-white"
												disabled={
													isMultiAppointment
														? appointmentSlots.length === 0 ||
															appointmentSlots.some(
																(s) =>
																	!s.selectedServices.length ||
																	!s.startDate ||
																	!s.startTime ||
																	!s.roomId,
															)
														: !newAppointment.startDate ||
															!newAppointment.startTime ||
															(!isBlockedTiming &&
																!isMultiAppointment &&
																newAppointment.selectedServices.length === 0) ||
															(!isBlockedTiming && !newAppointment.roomId)
												}
											>
												{isMultiAppointment
													? `Create ${appointmentSlots.length} Appointment${appointmentSlots.length !== 1 ? "s" : ""}`
													: isBlockedTiming
														? "Create Blocked Time"
														: "Create Appointment"}
											</Button>
										</div>
									</div>
								)}
							</div>
						</div>
					</TooltipProvider>
				</div>
			</DialogContent>

			{/* Auto-submit instead of showing the dev TestDataDialog */}
			{isTestDialogOpen &&
				testAppointmentData &&
				(() => {
					const data = testAppointmentData;
					queueMicrotask(() => {
						if (
							data.type === "SINGLE APPOINTMENT" ||
							data.type === "RECURRING APPOINTMENT"
						) {
							onSubmit(data.appointment);
							resetForm();
							onClose();
						} else if (
							data.type === "BLOCKED TIMING" ||
							data.type === "BLOCKED TIME"
						) {
							onSubmit(data.appointment);
							setIsBlockedTiming(false);
							resetForm();
							onClose();
						} else if (data.type === "MULTIPLE APPOINTMENTS") {
							data.appointments!.forEach((appointment: unknown) => {
								onSubmit(appointment as Parameters<typeof onSubmit>[0]);
							});
							setAppointmentSlots([]);
							setSelectedAppointmentId(null);
							setIsMultiAppointment(false);
							onClose();
						}
						setIsTestDialogOpen(false);
						setTestAppointmentData(null);
					});
					return null;
				})()}
		</Dialog>
	);
}
