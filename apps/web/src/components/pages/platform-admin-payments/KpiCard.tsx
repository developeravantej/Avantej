import type { DollarSign } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
	icon: Icon,
	label,
	value,
	tone,
	mono,
}: {
	icon: typeof DollarSign;
	label: string;
	value: string;
	tone?: "red";
	mono?: boolean;
}) {
	return (
		<Card>
			<CardContent className="pt-6">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-muted-foreground text-sm">{label}</p>
						<p
							className={`mt-1 font-semibold text-2xl ${mono ? "font-mono tabular-nums" : ""} ${tone === "red" ? "text-red-700" : ""}`}
						>
							{value}
						</p>
					</div>
					<Icon
						className={`size-5 ${tone === "red" ? "text-red-700" : "text-muted-foreground"}`}
					/>
				</div>
			</CardContent>
		</Card>
	);
}
