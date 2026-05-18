/**
 * Platform Admin — Tag Chip (Plan F.1).
 *
 * Small colored pill rendering a tenant tag label with optional remove
 * affordance. Color is a free-form string from the tag row (hex or
 * tailwind token). When absent we fall back to the muted shadcn pill.
 */

import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface TagChipProps {
	label: string;
	color?: string | null;
	onRemove?: () => void;
	className?: string;
	active?: boolean;
	"data-testid"?: string;
}

export function TagChip({
	label,
	color,
	onRemove,
	className,
	active,
	...rest
}: TagChipProps) {
	const style =
		color && color.startsWith("#")
			? { backgroundColor: `${color}22`, borderColor: color, color }
			: undefined;

	return (
		<Badge
			variant="outline"
			data-testid={rest["data-testid"] ?? `tag-chip-${label}`}
			className={cn(
				"gap-1 px-2 py-0.5 text-xs font-medium border",
				active && "ring-2 ring-primary/40",
				className,
			)}
			style={style}
		>
			<span>{label}</span>
			{onRemove && (
				<button
					type="button"
					aria-label={`Remove tag ${label}`}
					data-testid={`tag-chip-remove-${label}`}
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="ml-0.5 inline-flex h-3 w-3 items-center justify-center rounded-sm hover:bg-foreground/10"
				>
					<X className="h-3 w-3" />
				</button>
			)}
		</Badge>
	);
}
