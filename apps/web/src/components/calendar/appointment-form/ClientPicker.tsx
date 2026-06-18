import React from "react";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Client } from "@/types/appointments";

type ClientPickerProps = {
	clients: Client[];
	clientId: string;
	onClientChange: (clientId: string) => void;
	onBlockedTimingToggle: () => void;
};

export function ClientPicker({
	clients,
	clientId,
	onClientChange,
	onBlockedTimingToggle,
}: ClientPickerProps) {
	return (
		<div className="space-y-2 w-full px-6">
			<div className="flex items-center gap-2">
				<Label
					htmlFor="clientId"
					className="text-sm font-medium text-[#0a0a0a]"
				>
					Customer *
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
						<p className="text-black font-medium">
							Select the client for this appointment. Their credit balance will
							be checked against the service cost.
						</p>
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex gap-2">
				<Select value={clientId} onValueChange={onClientChange}>
					<SelectTrigger className="flex-1 border-[#e5e5e5] focus:border-brand-primary-1 focus:ring-brand-primary-1">
						<SelectValue placeholder="Search Customer by Name" />
					</SelectTrigger>
					<SelectContent className="z-[10001]">
						{clients.map((client) => (
							<SelectItem key={client.id} value={client.id}>
								<div className="flex items-center justify-between w-full">
									<span className="font-medium pr-2">{client.name}</span>
									<span className="text-sm text-[#737373]">{client.email}</span>
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
						// Add your plus button functionality here
					}}
				>
					<UserPlus className="size-5" />
				</Button>
			</div>

			{/* Separator */}
			<div className="relative flex items-center justify-center my-4">
				<div className="w-full h-px bg-[#e5e5e5]" />
				<span className="absolute bg-white px-3 text-[13px] text-[#737373] font-medium">
					or
				</span>
			</div>

			{/* Blocked Timing Button */}
			<div className="pt-2 flex justify-center">
				<button
					type="button"
					className="inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-white px-3.5 py-1.5 text-[13px] font-medium text-rose-500 transition hover:bg-rose-50"
					onClick={onBlockedTimingToggle}
				>
					<X className="size-3.5" />
					Blocked Timing
				</button>
			</div>
		</div>
	);
}
