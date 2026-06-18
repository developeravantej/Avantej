import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
	label: string;
	value: string | number;
	valueClassName?: string;
}

export function KpiCard({ label, value, valueClassName }: KpiCardProps) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-muted-foreground text-xs">{label}</p>
				<p
					className={`mt-1 font-semibold text-xl tabular-nums ${valueClassName ?? ""}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}
