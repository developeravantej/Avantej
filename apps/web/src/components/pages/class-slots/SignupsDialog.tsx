import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ClassSlotRow } from "./types";

interface CustomerMember {
	id: string;
	userId: string;
	name: string;
}

interface Signup {
	appointmentId: string;
	name: string;
	email?: string | null;
	phone?: string | null;
	attended: boolean | null;
	clientType: string;
	appointmentStatus: string;
}

interface SignupsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	viewingSignupsSlot: ClassSlotRow | null;
	signups: Signup[];
	signupsLoading: boolean;
	customerMembers: CustomerMember[];
	enrollClientUserId: string;
	setEnrollClientUserId: (id: string) => void;
	enrollIsPending: boolean;
	removeEnrollmentIsPending: boolean;
	onEnroll: (clientUserId: string) => void;
	onRemoveEnrollment: (appointmentId: string) => void;
	serviceNameById: (id: string) => string;
}

export function SignupsDialog({
	open,
	onOpenChange,
	viewingSignupsSlot,
	signups,
	signupsLoading,
	customerMembers,
	enrollClientUserId,
	setEnrollClientUserId,
	enrollIsPending,
	removeEnrollmentIsPending,
	onEnroll,
	onRemoveEnrollment,
	serviceNameById,
}: SignupsDialogProps) {
	// AVANTEJ-10: Radix <Select> mounts every <SelectItem> synchronously, and
	// customerMembers can be thousands of clients — that froze the whole tab when
	// the enroll dropdown opened. Filter by a search box and render at most 50.
	const [enrollSearch, setEnrollSearch] = useState("");
	const filteredCustomers = useMemo(() => {
		const q = enrollSearch.trim().toLowerCase();
		const base = q
			? customerMembers.filter((m) => m.name.toLowerCase().includes(q))
			: customerMembers;
		return base.slice(0, 50);
	}, [enrollSearch, customerMembers]);

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => {
				onOpenChange(isOpen);
			}}
		>
			<DialogContent className="sm:max-w-lg overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Users className="h-5 w-5" />
						Signups
					</DialogTitle>
					{viewingSignupsSlot && (
						<DialogDescription>
							{serviceNameById(viewingSignupsSlot.serviceId)} —{" "}
							{new Date(viewingSignupsSlot.date).toLocaleDateString()} at{" "}
							{viewingSignupsSlot.startTime}
						</DialogDescription>
					)}
				</DialogHeader>

				<Separator className="my-4" />

				{viewingSignupsSlot &&
					!viewingSignupsSlot.isCancelled &&
					viewingSignupsSlot.spotsBooked < viewingSignupsSlot.capacity && (
						<div className="mb-4 flex items-end gap-2">
							<div className="flex-1">
								<Label htmlFor="enroll-client" className="text-xs">
									Enroll customer
								</Label>
								<Input
									placeholder="Search customer…"
									value={enrollSearch}
									onChange={(e) => setEnrollSearch(e.target.value)}
									className="mb-1 h-8 text-xs"
								/>
								<Select
									value={enrollClientUserId}
									onValueChange={setEnrollClientUserId}
								>
									<SelectTrigger id="enroll-client">
										<SelectValue placeholder="Select customer..." />
									</SelectTrigger>
									<SelectContent>
										{customerMembers.length === 0 ? (
											<div className="px-2 py-1.5 text-xs text-muted-foreground">
												No active customers — invite one first.
											</div>
										) : filteredCustomers.length === 0 ? (
											<div className="px-2 py-1.5 text-xs text-muted-foreground">
												No matches — refine your search.
											</div>
										) : (
											<>
												{filteredCustomers.map((m) => (
													<SelectItem key={m.id} value={m.userId}>
														{m.name}
													</SelectItem>
												))}
												{customerMembers.length > filteredCustomers.length && (
													<div className="px-2 py-1.5 text-[11px] text-muted-foreground">
														Showing {filteredCustomers.length} of{" "}
														{customerMembers.length} — type to narrow.
													</div>
												)}
											</>
										)}
									</SelectContent>
								</Select>
							</div>
							<Button
								size="sm"
								onClick={() => onEnroll(enrollClientUserId)}
								disabled={!enrollClientUserId || enrollIsPending}
							>
								{enrollIsPending ? "Enrolling..." : "Enroll"}
							</Button>
						</div>
					)}

				{signupsLoading ? (
					<div className="flex items-center justify-center py-12">
						<LoadingSpinner size="md" />
					</div>
				) : signups.length === 0 ? (
					<p className="py-12 text-center text-sm text-muted-foreground">
						No sign-ups yet.
					</p>
				) : (
					<div className="space-y-2">
						{signups.map((signup, i) => (
							<div
								key={`${signup.appointmentId}-${i}`}
								className="space-y-1 rounded-lg border border-[#e5e5e5] p-3"
							>
								<div className="flex items-center justify-between">
									<span className="text-sm font-medium">{signup.name}</span>
									<span
										className={cn(
											"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold",
											signup.attended === true
												? "bg-emerald-50 text-emerald-700 border border-emerald-200"
												: signup.attended === false
													? "bg-red-50 text-red-700 border border-red-200"
													: "bg-[#f3f3f3] text-[#737373] border border-[#e5e5e5]",
										)}
									>
										{signup.attended === true
											? "Attended"
											: signup.attended === false
												? "No-show"
												: "Pending"}
									</span>
								</div>
								{signup.email && (
									<p className="text-xs text-[#737373]">{signup.email}</p>
								)}
								{signup.phone && (
									<p className="text-xs text-[#737373]">{signup.phone}</p>
								)}
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-3 text-xs text-[#737373]">
										<span className="capitalize">
											{signup.clientType === "walk_in" ? "Walk-in" : "Member"}
										</span>
										<span>·</span>
										<span className="capitalize">
											{signup.appointmentStatus}
										</span>
									</div>
									{signup.appointmentStatus !== "cancelled" && (
										<Button
											variant="ghost"
											size="sm"
											onClick={() => onRemoveEnrollment(signup.appointmentId)}
											disabled={removeEnrollmentIsPending}
										>
											Remove
										</Button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
