import { Badge } from "@/components/ui/badge";
import { getInstanceStatus } from "../utils";
import type { InstallmentOverviewItem } from "../types";

// ── Status badges ─────────────────────────────────────────────────────────────

export function StatusBadge({
	instance,
}: {
	instance: InstallmentOverviewItem;
}) {
	const status = getInstanceStatus(instance);
	if (status === "Locked") {
		return <Badge variant="destructive">Locked</Badge>;
	}
	if (status === "Overdue") {
		return (
			<Badge className="border-yellow-200 bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
				Overdue
			</Badge>
		);
	}
	return (
		<Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
			Active
		</Badge>
	);
}

export function InstallmentStatusBadge({ status }: { status: string }) {
	if (status === "paid") {
		return (
			<Badge className="border-green-200 bg-green-100 text-green-800 hover:bg-green-100">
				Paid
			</Badge>
		);
	}
	if (status === "waived") {
		return (
			<Badge className="border-purple-200 bg-purple-100 text-purple-800 hover:bg-purple-100">
				Waived
			</Badge>
		);
	}
	if (status === "cancelled") {
		return (
			<Badge className="border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-100">
				Cancelled
			</Badge>
		);
	}
	if (status === "overdue") {
		return <Badge variant="destructive">Overdue</Badge>;
	}
	return <Badge variant="outline">Pending</Badge>;
}
