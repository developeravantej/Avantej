import { cn } from "@/lib/utils";

export function TrainerAvatar({
	name,
	role,
	selected,
}: {
	name: string;
	role: string;
	selected: boolean;
}) {
	const initials = name
		.split(" ")
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase() ?? "")
		.join("");
	return (
		<div
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
				selected
					? "bg-white/15 text-white"
					: role === "admin"
						? "bg-[#d6cdb1]/50 text-[#6b5e3c]"
						: "bg-[#e8f0fe] text-[#3d6bce]",
			)}
		>
			{initials}
		</div>
	);
}
