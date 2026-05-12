import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Service } from "@/types/appointments";
import type { ClassSlotOption } from "@/hooks/useAppointmentFormState";

type ServicePickerProps = {
	services: Service[];
	selectedServiceIds: string[];
	purchasedServiceIds: Set<string>;
	isLoadingPackages: boolean;
	/** The class_slot service currently selected (if any) */
	selectedClassSlotService: Service | null;
	classSlotOptions: ClassSlotOption[];
	selectedClassSlotId: string | null;
	onAddService: (serviceId: string) => void;
	onRemoveService: (serviceId: string) => void;
	onSelectClassSlot: (slotId: string, dateStr: string, startTime: string) => void;
	/** Show only class_slot services when true (blocked timing ignores package constraint) */
	isBlockedTiming: boolean;
	clientId: string;
};

export function ServicePicker({
	services,
	selectedServiceIds,
	purchasedServiceIds,
	isLoadingPackages,
	selectedClassSlotService,
	classSlotOptions,
	selectedClassSlotId,
	onAddService,
	onRemoveService,
	onSelectClassSlot,
	isBlockedTiming,
	clientId,
}: ServicePickerProps) {
	const [isDialogOpen, setIsDialogOpen] = useState(false);

	const availableServices = services.filter((svc) => {
		if (!isBlockedTiming && svc.schedulingType !== "class_slot" && !purchasedServiceIds.has(svc.id)) return false;
		return !selectedServiceIds.includes(svc.id);
	});

	function handleServiceClick(svcId: string) {
		onAddService(svcId);
		setIsDialogOpen(false);
	}

	return (
		<div className="space-y-2 h-full">
			<div className="flex items-center gap-2">
				<Label className="text-sm font-medium text-brand-primary-1">Services *</Label>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="w-5 h-5 rounded-full bg-brand-secondary-3 text-brand-secondary-1 hover:bg-brand-secondary-2 hover:text-brand-primary-1 flex items-center justify-center text-xs font-medium"
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
							Add services to this appointment. Duration will be calculated automatically.
						</p>
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Add Service Button */}
			<Button
				type="button"
				variant="outline"
				className="border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1 justify-start"
				onClick={() => setIsDialogOpen(true)}
			>
				<Plus className="h-4 w-4 mr-2" />
				Add Service
			</Button>

			{/* Selected Services List */}
			{selectedServiceIds.length > 0 && (
				<div className="space-y-2 mt-3">
					<Label className="text-sm font-medium text-brand-primary-1">Selected Services:</Label>
					<div className="space-y-2">
						{selectedServiceIds.map((serviceId) => {
							const service = services.find((s) => s.id === serviceId);
							return service ? (
								<div
									key={serviceId}
									className="flex items-center justify-between p-3 bg-brand-secondary-3/50 border border-brand-secondary-3 rounded-lg"
								>
									<div className="flex items-center gap-3">
										<div className="w-2 h-2 bg-blue-500 rounded-full" />
										<div>
											<span className="font-medium text-brand-primary-1">{service.name}</span>
											<span className="text-sm text-brand-secondary-1 ml-2">
												({service.durationMinutes} min)
											</span>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => onRemoveService(serviceId)}
										className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
									>
										<X className="h-4 w-4" />
									</Button>
								</div>
							) : null;
						})}
					</div>
				</div>
			)}

			{/* Class slot picker — shown when a class_slot service is selected */}
			{selectedClassSlotService && (
				<div className="mt-4 space-y-2">
					<Label className="text-sm font-medium text-brand-primary-1">Select Class *</Label>
					<Select
						value={selectedClassSlotId ?? ""}
						onValueChange={(slotId) => {
							const slot = classSlotOptions.find((s) => s.id === slotId);
							if (!slot) return;
							const dateStr =
								typeof slot.date === "string"
									? slot.date.split("T")[0]
									: new Date(slot.date).toISOString().split("T")[0];
							onSelectClassSlot(slotId, dateStr ?? "", slot.startTime);
						}}
					>
						<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
							<SelectValue placeholder="Choose a class session…" />
						</SelectTrigger>
						<SelectContent className="z-[10001]">
							{classSlotOptions.length === 0 ? (
								<div className="px-3 py-3 text-center text-brand-secondary-1 text-sm">
									No upcoming sessions available
								</div>
							) : (
								classSlotOptions.map((slot) => {
									const dateStr =
										typeof slot.date === "string"
											? slot.date.split("T")[0]
											: new Date(slot.date).toISOString().split("T")[0];
									return (
										<SelectItem key={slot.id} value={slot.id}>
											{dateStr} · {slot.startTime}–{slot.endTime}{" "}
											{slot.spotsAvailable != null ? `(${slot.spotsAvailable} spots)` : ""}
										</SelectItem>
									);
								})
							)}
						</SelectContent>
					</Select>
				</div>
			)}

			{selectedServiceIds.length === 0 && (
				<div className="text-center py-8 text-brand-secondary-1">
					<div className="text-sm">No services selected</div>
					<div className="text-xs mt-1">Add services using the button above</div>
				</div>
			)}

			{/* Service Selection Dialog (internal state) */}
			{isDialogOpen && (
				<div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10001] p-4">
					<Card className="w-full max-w-md max-h-[80vh] overflow-hidden bg-white shadow-2xl">
						<CardContent className="p-6">
							<div className="flex items-center justify-between mb-4">
								<h3 className="text-lg font-semibold text-brand-primary-1">Select Services</h3>
								<Button
									variant="ghost"
									size="sm"
									onClick={() => setIsDialogOpen(false)}
									className="h-8 w-8 p-0 hover:bg-brand-secondary-3"
								>
									<X className="h-4 w-4" />
								</Button>
							</div>

							<div className="space-y-2 max-h-60 overflow-y-auto">
								{!clientId && !isBlockedTiming ? (
									<div className="text-center py-4 text-brand-secondary-1 text-sm">
										Select a customer first
									</div>
								) : isLoadingPackages ? (
									<div className="text-center py-4 text-brand-secondary-1 text-sm">
										Loading available services…
									</div>
								) : availableServices.length === 0 ? (
									<div className="text-center py-4 text-brand-secondary-1 text-sm">
										All available services have been selected
									</div>
								) : (
									availableServices.map((svc) => (
										<div
											key={svc.id}
											className="flex items-center justify-between p-3 border border-brand-secondary-3 rounded-lg hover:bg-brand-secondary-3/50 cursor-pointer"
											onClick={() => handleServiceClick(svc.id)}
										>
											<div className="flex justify-between w-full">
												<span className="font-medium pr-2">{svc.name}</span>
												<span className="text-sm text-brand-secondary-1">
													{svc.durationMinutes} min
												</span>
											</div>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</div>
	);
}
