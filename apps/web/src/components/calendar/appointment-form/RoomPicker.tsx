import React from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@tanstack/react-router";

type Room = {
	id: string;
	name: string;
	capacity?: number | null;
	type: string;
};

type RoomPickerProps = {
	rooms: Room[];
	value: string;
	onChange: (roomId: string) => void;
	onNavigateAway: () => void;
};

export function RoomPicker({ rooms, value, onChange, onNavigateAway }: RoomPickerProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Label htmlFor="roomId" className="text-sm font-medium text-brand-primary-1">
					Area *
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
						<p className="text-black font-medium">Select the room where the appointment will take place.</p>
					</TooltipContent>
				</Tooltip>
			</div>

			{rooms.length === 0 ? (
				<div className="border border-dashed border-brand-secondary-3 rounded-md p-3 text-sm text-muted-foreground">
					No rooms available.{" "}
					<Link
						to="/dashboard/rooms/view"
						search={{ returnTo: "/dashboard/appointment/view" }}
						className="text-primary underline font-medium"
						onClick={onNavigateAway}
					>
						Create one →
					</Link>
				</div>
			) : (
				<Select value={value} onValueChange={onChange}>
					<SelectTrigger className="w-full border-brand-secondary-3 focus:border-brand-primary-1 focus:ring-brand-primary-1">
						<SelectValue placeholder="Please Choose..." />
					</SelectTrigger>
					<SelectContent className="z-[10001]">
						{rooms.map((room) => (
							<SelectItem key={room.id} value={room.id}>
								{room.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
}
