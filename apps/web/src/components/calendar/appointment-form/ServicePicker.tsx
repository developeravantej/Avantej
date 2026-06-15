import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/tooltip";
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
	onSelectClassSlot: (
		slotId: string,
		dateStr: string,
		startTime: string,
	) => void;
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
		if (
			!isBlockedTiming &&
			svc.schedulingType !== "class_slot" &&
			!purchasedServiceIds.has(svc.id)
		)
			return false;
		return !selectedServiceIds.includes(svc.id);
	});

	function handleServiceClick(svcId: string) {
		onAddService(svcId);
		setIsDialogOpen(false);
	}

	return (
		<div className="space-y-2 h-full">
			<div className="flex items-center gap-2">
				<Label className="text-sm font-medium text-[#0a0a0a]">Services *</Label>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							className="size-5 rounded-full bg-[#f3f3f3] text-[#737373] hover:bg-[#a3a3a3] hover:text-[#0a0a0a] flex items-center justify-center text-xs font-medium"
						>
							?
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						align="start"
						className="z-[10002] bg-[#f3f3f3] text-[#0a0a0a] font-medium [&>svg]:hidden [&>svg]:!hidden [&>svg]:opacity-0 [&>svg]:pointer-events-none"
					>
						<p className="text-black font-medium">
							Add services to this appointment. Duration will be calculated
							automatically.
						</p>
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Add Service Button */}
			<Button
				type="button"
				variant="outline"
				className="border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a] justify-start"
				onClick={() => setIsDialogOpen(true)}
			>
				<Plus className="size-4 mr-2" />
				Add Service
			</Button>

			{/* Selected Services List */}
			{selectedServiceIds.length > 0 && (
				<div className="space-y-2 mt-3">
					<Label className="text-sm font-medium text-[#0a0a0a]">
						Selected Services:
					</Label>
					<div className="space-y-2">
						{selectedServiceIds.map((serviceId) => {
							const service = services.find((s) => s.id === serviceId);
							return service ? (
								<div
									key={serviceId}
									className="flex items-center justify-between p-3 bg-[#f3f3f3]/50 border border-[#e5e5e5] rounded-lg"
								>
									<div className="flex items-center gap-3">
										<div className="size-2 bg-blue-500 rounded-full" />
										<div>
											<span className="font-medium text-[#0a0a0a]">
												{service.name}
											</span>
											<span className="text-sm text-[#737373] ml-2">
												({service.durationMinutes} min)
											</span>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => onRemoveService(serviceId)}
										className="size-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
									>
										<X className="size-4" />
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
					<Label className="text-sm font-medium text-[#0a0a0a]">
						Select Class *
					</Label>
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
						<SelectTrigger className="w-full border-[#e5e5e5] focus:border-[#0a0a0a] focus:ring-[#0a0a0a]">
							<SelectValue placeholder="Choose a class session…" />
						</SelectTrigger>
						<SelectContent className="z-[10001]">
							{classSlotOptions.length === 0 ? (
								<div className="p-3 text-center text-[#737373] text-sm">
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
											{slot.spotsAvailable != null
												? `(${slot.spotsAvailable} spots)`
												: ""}
										</SelectItem>
									);
								})
							)}
						</SelectContent>
					</Select>
				</div>
			)}

			{selectedServiceIds.length === 0 && (
				<div className="text-center py-8 text-[#737373]">
					<div className="text-sm">No services selected</div>
					<div className="text-xs mt-1">
						Add services using the button above
					</div>
				</div>
			)}

			{/* Service Selection Dialog (internal state) */}
			<Dialog
				open={isDialogOpen}
				onOpenChange={(o) => {
					if (!o) setIsDialogOpen(false);
				}}
			>
				<DialogContent
					className="sm:max-w-md p-0 gap-0 rounded-2xl bg-white border border-[#e5e5e5] overflow-hidden"
					hideCloseButton
				>
					<DialogHeader className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
						<p className="text-[10px] font-bold tracking-widest uppercase text-[#737373] mb-1">
							SERVICE CATALOG
						</p>
						<DialogTitle className="text-lg font-bold text-[#0a0a0a]">
							Select Services
						</DialogTitle>
						<DialogDescription className="text-sm text-[#737373]">
							Choose services to add to this appointment.
						</DialogDescription>
					</DialogHeader>

					<div className="px-6 pt-4 pb-2 overflow-y-auto">
						<div className="space-y-2 max-h-60 overflow-y-auto">
							{!clientId && !isBlockedTiming ? (
								<div className="text-center py-4 text-[#737373] text-sm">
									Select a customer first
								</div>
							) : isLoadingPackages ? (
								<div className="text-center py-4 text-[#737373] text-sm">
									Loading available services…
								</div>
							) : availableServices.length === 0 ? (
								<div className="text-center py-4 text-[#737373] text-sm">
									All available services have been selected
								</div>
							) : (
								availableServices.map((svc) => (
									<button
										key={svc.id}
										type="button"
										className="flex items-center justify-between p-3 border border-[#e5e5e5] rounded-lg hover:bg-[#f3f3f3]/50 cursor-pointer w-full bg-transparent text-left"
										onClick={() => handleServiceClick(svc.id)}
									>
										<div className="flex justify-between w-full">
											<span className="font-medium pr-2">{svc.name}</span>
											<span className="text-sm text-[#737373]">
												{svc.durationMinutes} min
											</span>
										</div>
									</button>
								))
							)}
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
