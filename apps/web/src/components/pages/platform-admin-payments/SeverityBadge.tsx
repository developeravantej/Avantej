import { AlertCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function SeverityBadge({ severity }: { severity: string }) {
	if (severity === "critical")
		return (
			<Badge
				variant="outline"
				className="gap-1 border-red-200 bg-red-50 text-red-700"
			>
				<AlertCircle className="size-3" /> Critical
			</Badge>
		);
	if (severity === "warn")
		return (
			<Badge
				variant="outline"
				className="gap-1 border-yellow-300 bg-yellow-50 text-yellow-800"
			>
				<AlertTriangle className="size-3" /> Warn
			</Badge>
		);
	return <Badge variant="outline">Info</Badge>;
}
