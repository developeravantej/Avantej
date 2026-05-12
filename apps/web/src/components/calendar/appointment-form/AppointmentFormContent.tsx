import React, { useState } from "react";
import { UserPlus, X, ThumbsDown, Calendar, Plus, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { type TestAppointmentData } from "./TestDataDialog";
import { ClientPicker } from "./ClientPicker";
import { ServicePicker } from "./ServicePicker";
import { DateTimePicker } from "./DateTimePicker";
import { RepeatRuleSection } from "./RepeatRuleSection";
import { RoomPicker } from "./RoomPicker";
import { StaffPicker, type CommissionSlot } from "./StaffPicker";
import type { TeamMember, Client, Service, AppointmentSlot, NewAppointment, OnSubmitPayload } from "@/types/appointments";
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
	derivedTrainers: { id: string; name: string; role: string; department: string }[];
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
	updateAppointmentSlot: (slotId: string, field: string, value: unknown) => void;
	addServiceToSlot: (slotId: string, serviceId: string) => void;
	removeServiceFromSlot: (slotId: string, serviceId: string) => void;
	handleMultiAppointmentToggle: () => void;
	handleBlockedTimingToggle: () => void;
	resetForm: () => void;
	clearAllForm: () => void;
	handleClose: () => void;
	handleSubmit: () => void;
};

export function AppointmentFormContent({
	clients, services, rooms, trainers, teamMembers: _teamMembers, onSubmit, onClose,
	newAppointment, isServiceDialogOpen: _isServiceDialogOpen, setIsServiceDialogOpen: _setIsServiceDialogOpen,
	isMultiAppointment, setIsMultiAppointment, isBlockedTiming, setIsBlockedTiming,
	appointmentSlots, setAppointmentSlots, selectedAppointmentId, setSelectedAppointmentId,
	isTestDialogOpen, setIsTestDialogOpen, testAppointmentData, setTestAppointmentData,
	selectedClassSlotId, setSelectedClassSlotId, additionalSlotTrainers, setAdditionalSlotTrainers,
	derivedTrainers, trainerFilterActive, trainerFilterFallback,
	isLoadingPackages, purchasedServiceIds, selectedClassSlotService, commissionSlots,
	classSlotOptions, trainerPlaceholder, getWeekPosition, formatDuration,
	handleClientChange, handleInputChange, addService, removeService, adjustDuration: _adjustDuration,
	handleCustomRecurrenceChange, toggleDay, addNewAppointmentSlot, removeAppointmentSlot,
	selectAppointmentSlot, updateAppointmentSlot, addServiceToSlot, removeServiceFromSlot,
	handleMultiAppointmentToggle, handleBlockedTimingToggle, resetForm, clearAllForm,
	handleClose, handleSubmit,
}: AppointmentFormContentProps) {
	// Multi-slot service dialog state (separate from ServicePicker's internal dialog)
	const [multiSlotDialogOpen, setMultiSlotDialogOpen] = useState(false);

	const selectedSlot = appointmentSlots.find((s) => s.id === selectedAppointmentId);

	return (
		<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
			<Card className="w-full max-w-7xl max-h-[90vh] py-0 !important overflow-hidden bg-white shadow-2xl relative">
				<CardContent className="overflow-y-auto relative z-[10000] w-full px-0">
					<TooltipProvider>
						<div className="grid grid-cols-6 grid-rows-5">
							{/* Profile sidebar */}
							<div className="col-span-1 row-span-5 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-lg p-6 flex flex-col space-y-4">
								<div className="size-20 bg-brand-secondary-2 rounded-full flex items-center justify-center">
									<UserPlus className="size-10 text-brand-secondary-1" />
								</div>
								<div className="space-y-2">
									<h3 className="text-lg font-bold text-brand-primary-1">
										{newAppointment.clientId
											? (clients.find((c) => c.id === newAppointment.clientId)?.name ?? "Select Customer")
											: "Select Customer"}
									</h3>
									{newAppointment.clientId && (
										<div className="flex gap-1 text-sm text-brand-secondary-1 items-center">
											<div className="size-6 bg-red-500 rounded-full flex items-center justify-center">
												<ThumbsDown className="size-4 text-white" />
											</div>
											<span>0 No show(s)</span>
										</div>
									)}
								</div>
								<div className="w-full h-1 bg-blue-500" />
								<div className="space-y-4 w-full">
									<div className="text-left">
										<div className="flex flex-col gap-0 text-sm text-brand-primary-1">
											<span className="font-medium">MOVE PRIVATE FITNESS -</span>
											<div className="flex gap-2 items-center">
												<Calendar className="size-4 text-brand-secondary-1" />
												<span className="text-brand-secondary-1">
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
												<Label className="text-sm font-medium text-brand-primary-1">
													Multi-Appointment
												</Label>
												<Tooltip>
													<TooltipTrigger asChild>
														<button
															type="button"
															className="size-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium"
														>
															?
														</button>
													</TooltipTrigger>
													<TooltipContent
														side="top"
														align="start"
														className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
													>
														<p className="text-black font-medium">
															Enable to create multiple appointments for the same customer with different time slots.
														</p>
													</TooltipContent>
												</Tooltip>
											</div>
											<div className="flex items-center space-x-3">
												<button
													type="button"
													onClick={handleMultiAppointmentToggle}
													className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
														isMultiAppointment ? "bg-blue-600" : "bg-brand-secondary-3"
													}`}
												>
													<span
														className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
															isMultiAppointment ? "translate-x-6" : "translate-x-1"
														}`}
													/>
												</button>
												<span className="text-sm text-brand-secondary-1">
													{isMultiAppointment ? "Enabled" : "Disabled"}
												</span>
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Form area */}
							<div className="col-span-5 row-span-5 rounded-lg py-2 flex flex-col items-center font-semibold">
								<div>
									<div className="text-center pb-6">
										<h1 className="text-2xl font-bold text-brand-primary-1">Add New Appointment</h1>
									</div>
									<Button
										variant="ghost"
										size="sm"
										onClick={handleClose}
										className="absolute top-4 right-4 size-8 p-0 hover:bg-brand-secondary-3 z-10"
									>
										<X className="size-4" />
									</Button>
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
													if (patch.startDate !== undefined) handleInputChange("startDate", patch.startDate);
													if (patch.startTime !== undefined) handleInputChange("startTime", patch.startTime);
													if (patch.duration !== undefined) handleInputChange("duration", patch.duration);
												}}
												required
											/>
											<RepeatRuleSection
												recurrence={newAppointment.recurrence}
												customRecurrence={newAppointment.customRecurrence}
												startDate={newAppointment.startDate}
												getWeekPosition={getWeekPosition}
												onChangeRecurrence={(v) => handleInputChange("recurrence", v)}
												onChangeCustomRecurrence={handleCustomRecurrenceChange}
												onToggleDay={toggleDay}
												tooltipText="Set how often this blocked time repeats."
											/>
											{/* Trainer for blocked time */}
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<Label htmlFor="employeeId" className="text-sm font-medium text-brand-primary-1">
														Trainer
													</Label>
													<Tooltip>
														<TooltipTrigger asChild>
															<button
																type="button"
																className="size-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium"
															>
																?
															</button>
														</TooltipTrigger>
														<TooltipContent
															side="top"
															align="start"
															className="z-[10002] bg-brand-secondary-3 text-brand-primary-1 font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
														>
															<p className="text-black font-medium">Select the trainer for this blocked time.</p>
														</TooltipContent>
													</Tooltip>
												</div>
												<Select
													value={newAppointment.employeeId}
													onValueChange={(v) => handleInputChange("employeeId", v)}
												>
													<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
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
												<Label htmlFor="remarks" className="text-sm font-medium text-brand-primary-1">Remarks</Label>
												<Textarea
													id="remarks"
													value={newAppointment.remarks}
													onChange={(e) => handleInputChange("remarks", e.target.value)}
													placeholder="Enter reason for blocked time..."
													rows={3}
													className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
												/>
											</div>
											<div className="flex space-x-3 pt-4">
												<Button
													variant="outline"
													onClick={() => { setIsBlockedTiming(false); resetForm(); }}
													className="flex-1 border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
												>
													Cancel
												</Button>
												<Button
													onClick={handleSubmit}
													className="flex-1 bg-red-600 hover:bg-red-700 text-white"
													disabled={!newAppointment.startDate || !newAppointment.startTime || newAppointment.duration === 0}
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
										<div className="col-span-3 row-span-5 border-r border-brand-secondary-3 p-2 flex flex-col space-y-4">
											{/* Customer row (shown again once selected) */}
											<div className="space-y-2">
												<div className="flex items-center gap-2">
													<Label htmlFor="clientId" className="text-sm font-medium text-brand-primary-1">
														Customer *
													</Label>
												</div>
												<div className="flex gap-2">
													<Select value={newAppointment.clientId} onValueChange={handleClientChange}>
														<SelectTrigger className="flex-1 border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
															<SelectValue placeholder="Search Customer by Name" />
														</SelectTrigger>
														<SelectContent className="z-[10001]">
															{clients.map((client) => (
																<SelectItem key={client.id} value={client.id}>
																	<div className="flex items-center justify-between w-full">
																		<span className="font-medium pr-2">{client.name}</span>
																		<span className="text-sm text-brand-secondary-1">{client.email}</span>
																	</div>
																</SelectItem>
															))}
														</SelectContent>
													</Select>
													<Button
														type="button"
														variant="outline"
														size="default"
														className="px-5 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
														onClick={() => { /* Add your plus button functionality here */ }}
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
														className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 justify-start"
														onClick={addNewAppointmentSlot}
														disabled={appointmentSlots.length >= 5}
													>
														<Plus className="size-4 mr-2" />
														Add New Appointment {appointmentSlots.length >= 5 ? "(Max 5)" : ""}
													</Button>

													{appointmentSlots.length > 0 && (
														<div className="space-y-2">
															<Label className="text-sm font-medium text-brand-primary-1">Appointments:</Label>
															<div className="space-y-2 max-h-[475px] overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-brand-secondary-2 [&::-webkit-scrollbar-thumb]:rounded-full">
																{appointmentSlots.map((slot, index) => (
																	<Card
																		key={slot.id}
																		className={`cursor-pointer transition-colors ${
																			selectedAppointmentId === slot.id
																				? "border-blue-500 bg-blue-50"
																				: "border-brand-secondary-3 hover:border-brand-secondary-3"
																		}`}
																		onClick={() => selectAppointmentSlot(slot.id)}
																	>
																		<CardContent className="p-3">
																			<div className="flex items-center justify-between mb-3">
																				<div className="flex items-center gap-2">
																					<div className={`size-3 rounded-full ${selectedAppointmentId === slot.id ? "bg-blue-500" : "bg-brand-secondary-2"}`} />
																					<div>
																						<div className="text-sm font-medium text-brand-primary-1">
																							Appointment {index + 1}
																						</div>
																						<div className="text-xs text-brand-secondary-1">
																							{slot.startDate} at {slot.startTime}
																							{slot.endTime && ` → ${slot.endTime}`}
																							{slot.duration > 0 && ` • ${formatDuration(slot.duration)}`}
																						</div>
																					</div>
																				</div>
																				<Button
																					type="button"
																					variant="ghost"
																					size="sm"
																					onClick={(e) => { e.stopPropagation(); removeAppointmentSlot(slot.id); }}
																					className="size-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
																				>
																					<X className="size-3" />
																				</Button>
																			</div>
																			{/* Service list for this slot */}
																			<div className="space-y-2">
																				<div className="flex items-center gap-2">
																					<Label className="text-xs font-medium text-brand-secondary-1">Services:</Label>
																					<Button
																						type="button"
																						variant="outline"
																						size="sm"
																						className="h-6 px-2 text-xs border-brand-secondary-3 hover:bg-brand-secondary-3/50"
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
																						{slot.selectedServices.map((serviceId) => {
																							const svc = services.find((s) => s.id === serviceId);
																							return svc ? (
																								<div key={serviceId} className="flex items-center justify-between p-2 bg-white border border-brand-secondary-3 rounded text-xs">
																									<div className="flex items-center gap-2">
																										<div className="size-1.5 bg-green-500 rounded-full" />
																										<span className="font-medium text-brand-primary-1">{svc.name}</span>
																										<span className="text-brand-secondary-1">({svc.durationMinutes}m)</span>
																									</div>
																									<Button
																										type="button"
																										variant="ghost"
																										size="sm"
																										onClick={(e) => { e.stopPropagation(); removeServiceFromSlot(slot.id, serviceId); }}
																										className="size-4 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
																									>
																										<X className="size-2.5" />
																									</Button>
																								</div>
																							) : null;
																						})}
																					</div>
																				) : (
																					<div className="text-center py-2 text-brand-secondary-2 text-xs">No services selected</div>
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
										{multiSlotDialogOpen && selectedAppointmentId && (
											<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
												<Card className="w-full max-w-md max-h-[80vh] overflow-hidden bg-white shadow-2xl">
													<CardContent className="p-6">
														<div className="flex items-center justify-between mb-4">
															<h3 className="text-lg font-semibold text-brand-primary-1">Select Services</h3>
															<Button
																variant="ghost"
																size="sm"
																onClick={() => setMultiSlotDialogOpen(false)}
																className="size-8 p-0 hover:bg-brand-secondary-3"
															>
																<X className="size-4" />
															</Button>
														</div>
														<div className="space-y-2 max-h-60 overflow-y-auto">
															{(() => {
																const currentSlot = appointmentSlots.find((s) => s.id === selectedAppointmentId);
																const available = services.filter((svc) => {
																	if (svc.schedulingType !== "class_slot" && !purchasedServiceIds.has(svc.id)) return false;
																	return !currentSlot?.selectedServices.includes(svc.id);
																});
																if (available.length === 0) {
																	return (
																		<div className="text-center py-4 text-brand-secondary-1 text-sm">
																			All available services have been selected
																		</div>
																	);
																}
																return available.map((svc) => (
																	<div
																		key={svc.id}
																		className="flex items-center justify-between p-3 border border-brand-secondary-3 rounded-lg hover:bg-brand-secondary-3/50 cursor-pointer"
																		onClick={() => {
																			addServiceToSlot(selectedAppointmentId, svc.id);
																			setMultiSlotDialogOpen(false);
																		}}
																	>
																		<div className="flex justify-between w-full">
																			<span className="font-medium pr-2">{svc.name}</span>
																			<span className="text-sm text-brand-secondary-1">{svc.durationMinutes} min</span>
																		</div>
																	</div>
																));
															})()}
														</div>
													</CardContent>
												</Card>
											</div>
										)}

										{/* Right column: slot editor / single appointment form */}
										<div className="col-span-3 row-span-5 p-2 flex flex-col space-y-4">
											{/* Multi-slot selected slot editor */}
											{isMultiAppointment && selectedAppointmentId && selectedSlot && (
												<>
													<div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
														<div className="flex items-center gap-2">
															<div className="size-2 bg-blue-500 rounded-full" />
															<h3 className="text-sm font-semibold text-blue-900">
																Editing: Appointment {appointmentSlots.findIndex((s) => s.id === selectedAppointmentId) + 1}
															</h3>
														</div>
														<div className="text-xs text-blue-700 mt-1">
															{selectedSlot.startDate} at {selectedSlot.startTime} • {formatDuration(selectedSlot.duration)}
															{selectedSlot.endTime && <span className="ml-2">→ {selectedSlot.endTime}</span>}
														</div>
													</div>

													<div className="space-y-4 mb-6 p-4 bg-brand-secondary-3/50 rounded-lg border">
														<h4 className="text-sm font-semibold text-brand-primary-1">Edit Appointment Details</h4>
														{/* Date and Time */}
														<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
															<div className="space-y-2">
																<Label className="text-sm font-medium text-brand-primary-1">Date</Label>
																<Input
																	type="date"
																	value={selectedSlot.startDate}
																	onChange={(e) => updateAppointmentSlot(selectedSlot.id, "startDate", e.target.value)}
																	className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
																/>
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-brand-primary-1">Start Time</Label>
																<div className="flex gap-2">
																	<div className="flex-1">
																		<Select
																			value={selectedSlot.startTime ? selectedSlot.startTime.split(":")[0] : ""}
																			onValueChange={(hour) => {
																				const currentMinute = selectedSlot.startTime?.split(":")[1] ?? "00";
																				updateAppointmentSlot(selectedSlot.id, "startTime", `${hour.padStart(2, "0")}:${currentMinute}`);
																			}}
																		>
																			<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
																				<SelectValue placeholder="Hour" />
																			</SelectTrigger>
																			<SelectContent className="z-[10001]">
																				{Array.from({ length: 24 }, (_, h) => {
																					const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
																					const ap = h < 12 ? "AM" : "PM";
																					return (
																						<SelectItem key={h} value={h.toString().padStart(2, "0")}>
																							{h12} {ap}
																						</SelectItem>
																					);
																				})}
																			</SelectContent>
																		</Select>
																	</div>
																	<div className="flex-1">
																		<Select
																			value={selectedSlot.startTime ? selectedSlot.startTime.split(":")[1] : ""}
																			onValueChange={(minute) => {
																				const currentHour = selectedSlot.startTime?.split(":")[0] ?? "00";
																				updateAppointmentSlot(selectedSlot.id, "startTime", `${currentHour}:${minute}`);
																			}}
																		>
																			<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
																				<SelectValue placeholder="Minute" />
																			</SelectTrigger>
																			<SelectContent className="z-[10001]">
																				{["00", "15", "30", "45"].map((m) => (
																					<SelectItem key={m} value={m}>{m}</SelectItem>
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
																<Label className="text-sm font-medium text-brand-primary-1">Area</Label>
																<Select
																	value={selectedSlot.roomId}
																	onValueChange={(v) => updateAppointmentSlot(selectedSlot.id, "roomId", v)}
																>
																	<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
																		<SelectValue placeholder="Please Choose..." />
																	</SelectTrigger>
																	<SelectContent className="z-[10001]">
																		{rooms.map((room) => (
																			<SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
															<div className="space-y-2">
																<Label className="text-sm font-medium text-brand-primary-1">Trainer</Label>
																<Select
																	value={selectedSlot.employeeId}
																	onValueChange={(v) => updateAppointmentSlot(selectedSlot.id, "employeeId", v)}
																>
																	<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
																		<SelectValue placeholder="Select a trainer" />
																	</SelectTrigger>
																	<SelectContent className="z-[10001]">
																		{trainers.map((t) => (
																			<SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
																		))}
																	</SelectContent>
																</Select>
															</div>
														</div>
														{/* Duration */}
														<div className="space-y-2">
															<Label className="text-sm font-medium text-brand-primary-1">Duration</Label>
															<div className="flex items-center gap-2">
																<Button
																	type="button"
																	variant="outline"
																	size="sm"
																	onClick={() => updateAppointmentSlot(selectedSlot.id, "duration", Math.max(5, selectedSlot.duration - 5))}
																	className="size-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
																	disabled={selectedSlot.duration <= 5}
																>
																	<Minus className="size-4" />
																</Button>
																<div className="flex-1 text-center py-2 px-3 bg-white border border-brand-secondary-3 rounded-md">
																	<span className="text-sm font-medium text-brand-primary-1">{formatDuration(selectedSlot.duration)}</span>
																</div>
																<Button
																	type="button"
																	variant="outline"
																	size="sm"
																	onClick={() => updateAppointmentSlot(selectedSlot.id, "duration", selectedSlot.duration + 5)}
																	className="size-10 p-0 border-brand-secondary-3 hover:bg-brand-secondary-3/50"
																>
																	<Plus className="size-4" />
																</Button>
															</div>
															<div className="text-xs text-brand-secondary-1 text-center">
																START: {selectedSlot.startTime} | END: {
																	selectedSlot.endTime || (() => {
																		const parts = selectedSlot.startTime.split(":").map(Number);
																		const h = parts[0] ?? 0;
																		const m = parts[1] ?? 0;
																		const total = h * 60 + m + selectedSlot.duration;
																		return `${Math.floor(total / 60) % 24}`.padStart(2, "0") + ":" + `${total % 60}`.padStart(2, "0");
																	})()
																}
															</div>
														</div>
														{/* Remarks */}
														<div className="space-y-2">
															<Label className="text-sm font-medium text-brand-primary-1">Remarks</Label>
															<Textarea
																value={selectedSlot.remarks}
																onChange={(e) => updateAppointmentSlot(selectedSlot.id, "remarks", e.target.value)}
																placeholder="Enter any additional remarks for this appointment..."
																rows={2}
																className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
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
															if (patch.startDate !== undefined) handleInputChange("startDate", patch.startDate);
															if (patch.startTime !== undefined) handleInputChange("startTime", patch.startTime);
															if (patch.duration !== undefined) handleInputChange("duration", patch.duration);
														}}
														lockedByClassSlot={!!selectedClassSlotId}
														required
													/>
													<RepeatRuleSection
														recurrence={newAppointment.recurrence}
														customRecurrence={newAppointment.customRecurrence}
														startDate={newAppointment.startDate}
														getWeekPosition={getWeekPosition}
														onChangeRecurrence={(v) => handleInputChange("recurrence", v)}
														onChangeCustomRecurrence={handleCustomRecurrenceChange}
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
																onChangeEmployeeId={(v) => handleInputChange("employeeId", v)}
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
															<Label htmlFor="remarks" className="text-sm font-medium text-brand-primary-1">Remarks</Label>
															<Textarea
																id="remarks"
																value={newAppointment.remarks}
																onChange={(e) => handleInputChange("remarks", e.target.value)}
																placeholder="Enter any additional remarks..."
																rows={3}
																className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1"
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
										<div className="flex space-x-3">
											<Button
												variant="outline"
												onClick={clearAllForm}
												className="flex-1 border-brand-secondary-3 text-brand-primary-1 hover:bg-brand-secondary-3/50"
											>
												Reset
											</Button>
											<Button
												onClick={handleSubmit}
												className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
												disabled={
													isMultiAppointment
														? appointmentSlots.length === 0 ||
														  appointmentSlots.some(
															  (s) => !s.selectedServices.length || !s.startDate || !s.startTime || !s.roomId,
														  )
														: !newAppointment.startDate ||
														  !newAppointment.startTime ||
														  (!isBlockedTiming && !isMultiAppointment && newAppointment.selectedServices.length === 0) ||
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
				</CardContent>
			</Card>

			{/* Auto-submit instead of showing the dev TestDataDialog */}
			{isTestDialogOpen && testAppointmentData && (() => {
				const data = testAppointmentData;
				queueMicrotask(() => {
					if (data.type === "SINGLE APPOINTMENT" || data.type === "RECURRING APPOINTMENT") {
						onSubmit(data.appointment);
						resetForm();
						onClose();
					} else if (data.type === "BLOCKED TIMING" || data.type === "BLOCKED TIME") {
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
		</div>
	);
}
