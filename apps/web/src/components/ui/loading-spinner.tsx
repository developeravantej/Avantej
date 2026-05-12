import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
	size?: "sm" | "md" | "lg";
	className?: string;
	label?: string;
}

const SIZE_CLASSES = {
	sm: "h-4 w-4 border-2",
	md: "h-6 w-6 border-2",
	lg: "h-8 w-8 border-2",
} as const;

export function LoadingSpinner({
	size = "md",
	className,
	label,
}: LoadingSpinnerProps) {
	return (
		<div
			role="status"
			aria-label={label ?? "Loading"}
			className={cn("inline-flex items-center gap-2", className)}
		>
			<span
				className={cn(
					"inline-block animate-spin rounded-full border-current border-r-transparent",
					SIZE_CLASSES[size],
				)}
			/>
			{label && <span className="text-sm text-muted-foreground">{label}</span>}
		</div>
	);
}

export function PageLoader({ label }: { label?: string }) {
	return (
		<div className="flex h-64 items-center justify-center">
			<LoadingSpinner size="lg" label={label} />
		</div>
	);
}
