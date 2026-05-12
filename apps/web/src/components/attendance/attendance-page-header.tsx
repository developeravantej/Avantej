import { ClipboardCheck } from "lucide-react";

export function AttendancePageHeader() {
	return (
		<div className="flex items-center gap-3">
			<div className="p-2 rounded-lg bg-primary/10">
				<ClipboardCheck className="size-6 text-primary" />
			</div>
			<div>
				<h1 className="text-xl font-semibold">Attendance</h1>
				<p className="mt-0.5 text-sm text-muted-foreground">
					Today's check-ins and drop-ins
				</p>
			</div>
		</div>
	);
}
