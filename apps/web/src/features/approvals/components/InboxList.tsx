import { getDateGroup } from "../approvals.helpers";
import type { DateGroup, PendingRow } from "../approvals.types";
import { GroupHeader, InboxRow } from "./InboxRow";

export function InboxList({
	filtered,
	expandedId,
	checkedIds,
	isAdmin,
	isTrainer,
	callerMemberId,
	organizationId,
	onToggle,
	onCheck,
	onAssigned,
	onReject,
}: {
	filtered: PendingRow[];
	expandedId: string | null;
	checkedIds: Set<string>;
	isAdmin: boolean;
	isTrainer: boolean;
	callerMemberId: string | null;
	organizationId: string;
	onToggle: (id: string) => void;
	onCheck: (id: string) => void;
	onAssigned: () => void;
	onReject: (row: PendingRow) => void;
}) {
	const groups: Array<{
		key: DateGroup;
		label: string;
		rows: PendingRow[];
	}> = [
		{
			key: "today",
			label: "Today",
			rows: filtered.filter((r) => getDateGroup(r) === "today"),
		},
		{
			key: "yesterday",
			label: "Yesterday",
			rows: filtered.filter((r) => getDateGroup(r) === "yesterday"),
		},
		{
			key: "earlier",
			label: "Earlier",
			rows: filtered.filter((r) => getDateGroup(r) === "earlier"),
		},
		{
			key: "older",
			label: "Older than 3 days · past SLA",
			rows: filtered.filter((r) => getDateGroup(r) === "older"),
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
								isChecked={checkedIds.has(row.id)}
								isAdmin={isAdmin}
								isTrainer={isTrainer}
								callerMemberId={callerMemberId}
								organizationId={organizationId}
								isFirstInList={filtered.indexOf(row) === 0}
								onToggle={() => onToggle(row.id)}
								onCheck={() => onCheck(row.id)}
								onAssigned={onAssigned}
								onReject={onReject}
							/>
						</div>
					)),
				)}
		</div>
	);
}
