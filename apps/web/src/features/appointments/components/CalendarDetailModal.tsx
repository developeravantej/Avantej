import { User, Mail, Phone, MapPin, Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { UseMutationResult } from "@tanstack/react-query";
import type { Appointment } from "../types";
import { statusStyle } from "../utils";

interface CalendarDetailModalProps {
	appointment: Appointment;
	updateMutation: UseMutationResult<unknown, Error, { id: string; status: "confirmed" | "cancelled" }, unknown>;
	onClose: () => void;
	onEditStaff: (id: string) => void;
	onInvalidate: () => void;
}

function formatTime(date: Date) {
	return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDurationLocal(start: Date, end: Date) {
	const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`;
}

function formatDate(date: Date) {
	return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function CalendarDetailModal({ appointment, updateMutation, onClose, onEditStaff, onInvalidate }: CalendarDetailModalProps) {
	const s = statusStyle(appointment.status);

	return (
		<Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<CalendarIcon className="size-5 text-muted-foreground" />
						Appointment Details
					</DialogTitle>
					<DialogDescription>
						{appointment.service ?? appointment.title}
					</DialogDescription>
				</DialogHeader>
				<Card className="border-0 shadow-none flex-1 overflow-hidden">
				<CardContent className="overflow-y-auto max-h-[65vh] space-y-6 px-0 pt-0">
					<div className="flex justify-between items-start">
						<Badge variant="secondary" className={cn("text-sm px-3 py-1", s.badge)}>{s.label}</Badge>
						{appointment.status === "pending" && (
							<div className="flex gap-2">
								<Button size="sm" disabled={updateMutation.isPending}
									onClick={() => updateMutation.mutate({ id: appointment.id, status: "confirmed" }, {
										onSuccess: () => { toast.success("Marked as Came"); onInvalidate(); onClose(); },
										onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"),
									})}
									className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
								>
									Mark as Came
								</Button>
								<Button size="sm" variant="outline" disabled={updateMutation.isPending}
									onClick={() => updateMutation.mutate({ id: appointment.id, status: "cancelled" }, {
										onSuccess: () => { toast.success("Marked as No-show"); onInvalidate(); onClose(); },
										onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Failed"),
									})}
									className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
								>
									Mark as No-show
								</Button>
							</div>
						)}
					</div>

					<div>
						<h2 className="text-2xl mb-1">{appointment.title}</h2>
						<p className="text-muted-foreground">{appointment.service}</p>
					</div>

					<div className="space-y-2">
						<h3 className="text-sm font-semibold flex items-center gap-2"><CalendarIcon className="size-4" />Date & Time</h3>
						<div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1.5">
							<div className="flex justify-between"><span className="font-medium">Date</span><span>{formatDate(new Date(appointment.start))}</span></div>
							<div className="flex justify-between"><span className="font-medium">Start</span><span>{formatTime(new Date(appointment.start))}</span></div>
							<div className="flex justify-between"><span className="font-medium">End</span><span>{formatTime(new Date(appointment.end))}</span></div>
							<div className="flex justify-between"><span className="font-medium">Duration</span><span>{formatDurationLocal(new Date(appointment.start), new Date(appointment.end))}</span></div>
						</div>
					</div>

					<div className="space-y-2">
						<h3 className="text-sm font-semibold flex items-center gap-2"><User className="size-4" />Client</h3>
						<div className="bg-muted/30 rounded-lg p-4 text-sm space-y-1.5">
							<div className="flex justify-between"><span className="font-medium">Name</span><span>{appointment.clientName}</span></div>
							{appointment.clientEmail && (
								<div className="flex justify-between">
									<span className="font-medium flex items-center gap-1"><Mail className="size-3" />Email</span>
									<span>{appointment.clientEmail}</span>
								</div>
							)}
							{appointment.clientPhone && (
								<div className="flex justify-between">
									<span className="font-medium flex items-center gap-1"><Phone className="size-3" />Phone</span>
									<span>{appointment.clientPhone}</span>
								</div>
							)}
						</div>
					</div>

					{appointment.location && (
						<div className="space-y-2">
							<h3 className="text-sm font-semibold flex items-center gap-2"><MapPin className="size-4" />Location</h3>
							<div className="bg-muted/30 rounded-lg p-4 text-sm">{appointment.location}</div>
						</div>
					)}

					{appointment.notes && (
						<div className="space-y-2">
							<h3 className="text-sm font-semibold">Notes</h3>
							<div className="bg-muted/30 rounded-lg p-4 text-sm whitespace-pre-wrap">{appointment.notes}</div>
						</div>
					)}

					<div className="flex gap-3 pt-4 border-t">
						<Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
						<Button onClick={() => { onEditStaff(appointment.id); onClose(); }} className="flex-1">
							Edit Staff
						</Button>
					</div>
				</CardContent>
				</Card>
			</DialogContent>
		</Dialog>
	);
}
