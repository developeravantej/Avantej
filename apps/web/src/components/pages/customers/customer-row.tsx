import { Link } from "@tanstack/react-router";
import { Eye, Pencil } from "lucide-react";
import { CopyableCell } from "@/components/tables/copyable-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatPrice } from "@/lib/money";

const TD = "px-5 py-4";

export type CustomerRowData = {
	memberId: string;
	name: string;
	email: string;
	phone: string | null;
	activePackageCount: number;
	lifetimeValueCents: number;
	outstandingBalanceCents: number;
};

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0].toUpperCase())
		.join("");
}

type Props = {
	row: CustomerRowData;
	onEdit: (memberId: string) => void;
};

export function CustomerRow({ row, onEdit }: Props) {
	const initials = getInitials(row.name);
	return (
		<TableRow className="transition-colors hover:bg-muted/30">
			<TableCell className={TD}>
				<div className="flex items-center gap-3.5">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-primary text-primary-foreground">
						{initials}
					</span>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm leading-snug">
							{row.name}
						</p>
						<p className="truncate text-xs text-muted-foreground">
							{row.email}
						</p>
					</div>
				</div>
			</TableCell>

			<TableCell className={`${TD} text-sm`}>
				{row.phone ? (
					<CopyableCell value={row.phone} />
				) : (
					<span className="text-muted-foreground">-</span>
				)}
			</TableCell>

			<TableCell className={TD}>
				{row.activePackageCount > 0 ? (
					<Badge variant="secondary" className="tabular-nums">
						{row.activePackageCount}
					</Badge>
				) : (
					<span className="text-muted-foreground text-sm">-</span>
				)}
			</TableCell>

			<TableCell className={TD}>
				<span className="tabular-nums text-sm">
					{formatPrice(row.lifetimeValueCents, "MYR")}
				</span>
			</TableCell>

			<TableCell className={TD}>
				<span
					className={`tabular-nums text-sm ${row.outstandingBalanceCents > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}
				>
					{row.outstandingBalanceCents > 0
						? formatPrice(row.outstandingBalanceCents, "MYR")
						: "—"}
				</span>
			</TableCell>

			<TableCell className={TD}>
				<div className="flex items-center gap-0.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-muted-foreground hover:text-foreground"
								onClick={() => onEdit(row.memberId)}
							>
								<Pencil className="size-3.5" />
								<span className="sr-only">Edit</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent>Edit profile</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-8 text-muted-foreground hover:text-foreground"
								asChild
							>
								<Link
									to="/dashboard/customers/$id"
									params={{ id: row.memberId }}
								>
									<Eye className="size-3.5" />
									<span className="sr-only">View 360°</span>
								</Link>
							</Button>
						</TooltipTrigger>
						<TooltipContent>View 360°</TooltipContent>
					</Tooltip>
				</div>
			</TableCell>
		</TableRow>
	);
}
