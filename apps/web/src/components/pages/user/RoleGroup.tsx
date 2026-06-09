import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { MemberRow } from "./types";
import { ROLE_GROUPS, ROLE_BADGE_STYLES } from "./constants";
import { MemberCard } from "./MemberCard";

// ─── Collapsible role group ──────────────────────────────────────────────────
export function RoleGroup({
	roleConfig,
	members,
	callerIsAdmin,
	organizationId,
	defaultOpen = true,
}: {
	roleConfig: (typeof ROLE_GROUPS)[number];
	members: MemberRow[];
	callerIsAdmin: boolean;
	organizationId: string;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const { role, label, pluralLabel } = roleConfig;

	return (
		<div className="border-b border-[#edede4] last:border-b-0">
			{/* Group header */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-3 px-6 py-3.5 hover:bg-[#fafaf8] transition-colors select-none"
			>
				<Badge
					className={`text-[11px] font-semibold border ${ROLE_BADGE_STYLES[role]} px-2 py-0.5 rounded-md`}
				>
					{label}
				</Badge>
				<span className="text-sm font-semibold text-[#0a0a0a]">
					{pluralLabel}
				</span>
				<span className="text-xs text-[#6b7170]">
					{members.length} {members.length === 1 ? "member" : "members"}
				</span>
				{open ? (
					<ChevronUp className="ml-auto h-3.5 w-3.5 text-[#6b7170]" />
				) : (
					<ChevronDown className="ml-auto h-3.5 w-3.5 text-[#6b7170]" />
				)}
			</button>

			{/* Member cards */}
			{open && (
				<div className="px-6 pb-4 grid gap-2">
					{members.map((m) => (
						<MemberCard
							key={m.id}
							member={m}
							callerIsAdmin={callerIsAdmin}
							organizationId={organizationId}
						/>
					))}
				</div>
			)}
		</div>
	);
}
