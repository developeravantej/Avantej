import { getActionDate, getDateGroup } from "../approvals.helpers";
import type { ApprovalStatus, DateGroup, PendingRow } from "../approvals.types";
import { GroupHeader, InboxRow } from "./InboxRow";

export function InboxList({
	filtered,
	expandedId,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	approvalStatus,
	onToggle,
	onAssigned,
	onReject,
	onSchedule,
}: {
	filtered: PendingRow[];
	expandedId: string | null;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	approvalStatus: ApprovalStatus;
	onToggle: (id: string) => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
	onSchedule: (packageInstanceId: string) => void;
}) {
	const groupFor = (r: PendingRow) =>
		getDateGroup({ ...r, createdAt: getActionDate(r, approvalStatus) });

	const olderLabel =
		approvalStatus === "approved"
			? "Earlier approvals"
			: approvalStatus === "rejected"
				? "Earlier rejections"
				: "Older than 3 days · past SLA";

	const groups: Array<{
		key: DateGroup;
		label: string;
		rows: PendingRow[];
	}> = [
		{
			key: "today",
			label: "Today",
			rows: filtered.filter((r) => groupFor(r) === "today"),
		},
		{
			key: "yesterday",
			label: "Yesterday",
			rows: filtered.filter((r) => groupFor(r) === "yesterday"),
		},
		{
			key: "earlier",
			label: "Earlier",
			rows: filtered.filter((r) => groupFor(r) === "earlier"),
		},
		{
			key: "older",
			label: olderLabel,
			rows: filtered.filter((r) => groupFor(r) === "older"),
		},
	];

	return (
		<div className="mt-4 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			{groups
				.filter((g) => g.rows.length > 0)
				.map((group) =>
					group.rows.map((row, idx) => (
						<div key={row.id}>
							{/* Group header only on first row of that group */}
							{idx === 0 && <GroupHeader label={group.label} />}
							<InboxRow
								row={row}
								isExpanded={expandedId === row.id}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								approvalStatus={approvalStatus}
								isFirstInList={filtered.indexOf(row) === 0}
								onToggle={() => onToggle(row.id)}
								onAssigned={onAssigned}
								onReject={onReject}
								onSchedule={onSchedule}
							/>
						</div>
					)),
				)}
		</div>
	);
}
