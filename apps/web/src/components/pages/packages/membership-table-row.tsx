import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/money";

const TD = "px-5 py-4";

type Variant = "default" | "secondary" | "outline" | "destructive";

type Row = {
	packageInstanceId: string;
	memberId: string;
	clientName: string;
	serviceName: string;
	creditsTotal: number;
	creditsRemaining: number;
	expiresAt: Date | string | null;
	daysUntilExpiry: number | null;
	isLocked: boolean;
	lockedReason: string | null;
	outstandingBalanceCents: number;
};

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return "—";
	const d = value instanceof Date ? value : new Date(value as string);
	if (Number.isNaN(d.getTime())) return "—";
	return d.toISOString().slice(0, 10);
}

function expiryLabel(days: number | null): { text: string; className: string } {
	if (days === null)
		return { text: "No expiry", className: "text-muted-foreground" };
	if (days <= 0)
		return { text: "Expired", className: "text-red-600 font-medium" };
	if (days <= 7)
		return {
			text: `in ${days} day${days !== 1 ? "s" : ""}`,
			className: "text-red-600 font-medium",
		};
	if (days <= 30)
		return { text: `in ${days} days`, className: "text-amber-600 font-medium" };
	return { text: `in ${days} days`, className: "text-muted-foreground" };
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

type Props = {
	row: Row;
	variant: Variant;
	label: string;
	onCustomerClick: (memberId: string | null) => void;
};

export function MembershipTableRow({
	row,
	variant,
	label,
	onCustomerClick,
}: Props) {
	const name = row.clientName || "Unknown member";
	const initials = getInitials(name);
	const dateStr = formatDate(row.expiresAt);
	const expiry = expiryLabel(row.daysUntilExpiry);
	return (
		<TableRow className="hover:bg-muted/20">
			<TableCell className={TD}>
				<button
					type="button"
					className="flex items-center gap-3.5 text-left hover:underline focus:outline-none"
					onClick={() => onCustomerClick(row.memberId || null)}
				>
					<span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xs">
						{initials}
					</span>
					<span className="font-medium">{name}</span>
				</button>
			</TableCell>

			<TableCell className={TD}>
				<span className="font-medium">{row.serviceName}</span>
			</TableCell>

			<TableCell className={TD}>
				<div className="flex flex-col gap-1">
					<span className="tabular-nums text-sm">
						{row.creditsRemaining} / {row.creditsTotal}
					</span>
					<div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
						<div
							className="h-full rounded-full bg-primary transition-all"
							style={{
								width: `${Math.round(
									(row.creditsRemaining / Math.max(row.creditsTotal, 1)) *
										100,
								)}%`,
							}}
						/>
					</div>
				</div>
			</TableCell>

			<TableCell className={TD}>
				<div className="flex flex-col gap-0.5">
					<span className="text-sm">{dateStr}</span>
					<span className={`text-xs ${expiry.className}`}>{expiry.text}</span>
				</div>
			</TableCell>

			<TableCell className={TD}>
				<span
					className={`tabular-nums ${
						row.outstandingBalanceCents > 0
							? "font-medium text-red-600"
							: "text-muted-foreground"
					}`}
				>
					{formatPrice(row.outstandingBalanceCents, "MYR")}
				</span>
			</TableCell>

			<TableCell className={TD}>
				{row.isLocked && row.lockedReason ? (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span>
									<Badge variant={variant}>{label}</Badge>
								</span>
							</TooltipTrigger>
							<TooltipContent>
								<p>{row.lockedReason}</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				) : (
					<Badge variant={variant}>{label}</Badge>
				)}
			</TableCell>
		</TableRow>
	);
}
