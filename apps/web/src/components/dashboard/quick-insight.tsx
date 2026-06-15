import { Lightbulb } from "lucide-react";

interface QuickInsightProps {
	message: string;
}

export function QuickInsight({ message }: QuickInsightProps) {
	return (
		<div className="flex items-center gap-3 rounded-2xl border border-brand-secondary-3 bg-card px-5 py-4">
			<Lightbulb className="size-5 shrink-0 text-brand-secondary-1" />
			<p className="text-sm text-brand-secondary-1">{message}</p>
		</div>
	);
}
