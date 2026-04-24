import { cn } from "@/lib/utils";

export type Role = "admin" | "staff" | "trainer" | "client" | "system" | string;

const ROLE_COLORS: Record<string, string> = {
	admin: "bg-red-100 text-red-800 border-red-200",
	staff: "bg-blue-100 text-blue-800 border-blue-200",
	trainer: "bg-green-100 text-green-800 border-green-200",
	client: "bg-muted text-muted-foreground border-border",
	system: "bg-muted text-muted-foreground border-border",
};

interface RoleBadgeProps {
	role: string | null | undefined;
	className?: string;
	size?: "xs" | "sm";
}

export function RoleBadge({ role, className, size = "xs" }: RoleBadgeProps) {
	if (!role) return null;
	const colorClass = ROLE_COLORS[role.toLowerCase()] ?? ROLE_COLORS.system;
	const sizeClass =
		size === "xs"
			? "px-1.5 py-0.5 text-[10px]"
			: "px-2 py-0.5 text-xs";
	return (
		<span
			className={cn(
				"inline-flex items-center rounded border font-medium uppercase tracking-wide",
				sizeClass,
				colorClass,
				className,
			)}
		>
			{role}
		</span>
	);
}
