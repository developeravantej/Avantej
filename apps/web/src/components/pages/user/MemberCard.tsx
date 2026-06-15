import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import type { MemberRow } from "./types";
import { getDisplayName, getInitials, formatJoined } from "./helpers";
import {
	ImpersonateDialog,
	DeactivateDialog,
	ReactivateDialog,
	RemoveDialog,
} from "./dialogs";

// ─── Single employee card row ────────────────────────────────────────────────
export function MemberCard({
	member,
	callerIsAdmin,
	organizationId,
}: {
	member: MemberRow;
	callerIsAdmin: boolean;
	organizationId: string;
}) {
	const [impersonateOpen, setImpersonateOpen] = useState(false);
	const [deactivateOpen, setDeactivateOpen] = useState(false);
	const [reactivateOpen, setReactivateOpen] = useState(false);
	const [removeOpen, setRemoveOpen] = useState(false);

	const displayName = getDisplayName(member);
	const initials = getInitials(member.name, member.email);
	const joined = formatJoined(member.joinedAt);
	const isInactive = member.status === "suspended";

	return (
		<>
			<div
				className="flex items-center gap-4 rounded-xl border border-[#e5e5e5] bg-white p-4"
				style={isInactive ? { opacity: 0.6 } : undefined}
			>
				{/* Avatar */}
				<Avatar className="h-10 w-10 flex-shrink-0 bg-[#0a0a0a]">
					<AvatarFallback className="bg-[#0a0a0a] text-white text-xs font-semibold">
						{initials}
					</AvatarFallback>
				</Avatar>

				{/* Name + email */}
				<div className="flex-1 min-w-0">
					<div className="text-sm font-semibold text-[#0a0a0a] truncate">
						{displayName}
					</div>
					<div className="text-xs text-[#737373] truncate font-mono tabular-nums">
						{member.email ?? "No email"}
					</div>
				</div>

				{/* Status pill */}
				<span
					className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${member.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}
				>
					<span
						className={`h-1.5 w-1.5 rounded-full ${member.status === "active" ? "bg-emerald-500" : "bg-rose-500"}`}
					/>
					{member.status === "active" ? "Active" : "Suspended"}
				</span>

				{/* Joined date */}
				{joined && (
					<div className="text-xs text-[#737373] font-mono tabular-nums whitespace-nowrap">
						Joined {joined}
					</div>
				)}

				{/* Action buttons */}
				{callerIsAdmin && (
					<div className="flex items-center gap-1 ml-2">
						{member.role === "staff" && (
							<button
								type="button"
								onClick={() => setImpersonateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Login as
							</button>
						)}
						{member.status === "active" ? (
							<button
								type="button"
								onClick={() => setDeactivateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Deactivate
							</button>
						) : (
							<button
								type="button"
								onClick={() => setReactivateOpen(true)}
								className="rounded-lg px-2 py-1 text-xs font-medium text-[#0a0a0a] hover:bg-[#f3f3f3] transition-colors"
							>
								Reactivate
							</button>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="rounded-lg px-2 py-1 text-xs font-medium text-[#6b7170] hover:bg-[#f3f3f3] transition-colors"
								>
									···
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => setRemoveOpen(true)}
								>
									Remove from org
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</div>

			{impersonateOpen && (
				<ImpersonateDialog
					member={member}
					organizationId={organizationId}
					open={impersonateOpen}
					onClose={() => setImpersonateOpen(false)}
				/>
			)}
			{deactivateOpen && (
				<DeactivateDialog
					member={member}
					organizationId={organizationId}
					open={deactivateOpen}
					onClose={() => setDeactivateOpen(false)}
				/>
			)}
			{reactivateOpen && (
				<ReactivateDialog
					member={member}
					organizationId={organizationId}
					open={reactivateOpen}
					onClose={() => setReactivateOpen(false)}
				/>
			)}
			{removeOpen && (
				<RemoveDialog
					member={member}
					organizationId={organizationId}
					open={removeOpen}
					onClose={() => setRemoveOpen(false)}
				/>
			)}
		</>
	);
}
