import React from "react";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Client } from "@/types/appointments";

type ClientPickerProps = {
	clients: Client[];
	clientId: string;
	onClientChange: (clientId: string) => void;
	onBlockedTimingToggle: () => void;
};

export function ClientPicker({ clients, clientId, onClientChange, onBlockedTimingToggle }: ClientPickerProps) {
	return (
		<div className="space-y-2 w-full px-6">
			<div className="flex items-center gap-2">
				<Label htmlFor="clientId" className="text-sm font-medium text-brand-primary-1">
					Customer *
				</Label>
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
							Select the client for this appointment. Their credit balance will be checked against the service cost.
						</p>
					</TooltipContent>
				</Tooltip>
			</div>

			<div className="flex gap-2">
				<Select value={clientId} onValueChange={onClientChange}>
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
					onClick={() => {
						// Add your plus button functionality here
					}}
				>
					<UserPlus className="h-5 w-5" />
				</Button>
			</div>

			{/* Separator */}
			<div className="relative flex items-center justify-center my-4">
				<div className="w-full h-px bg-brand-secondary-3" />
				<span className="absolute bg-white px-3 text-sm text-brand-secondary-1 font-medium">or</span>
			</div>

			{/* Blocked Timing Button */}
			<div className="pt-2 flex justify-center">
				<Button
					type="button"
					variant="outline"
					className="border-red-300 text-red-600 hover:bg-red-50 justify-center py-2"
					onClick={onBlockedTimingToggle}
				>
					<X className="h-4 w-4 mr-2" />
					Blocked Timing
				</Button>
			</div>
		</div>
	);
}
