import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface StatusCalloutProps {
	variant: "success" | "warning" | "error" | "info";
	title?: string;
	/** Pass children OR message (backwards compat with ErrorState) */
	children?: React.ReactNode;
	/** Backwards-compat with ErrorState: rendered as children when children is absent */
	message?: string;
	icon?: React.ReactNode; // overrides default per-variant icon
	onRetry?: () => void; // shown only on "error" variant
	onDismiss?: () => void; // optional dismiss button
	className?: string;
}

const VARIANT_STYLES = {
	success: "bg-green-50 border border-green-200 text-green-700",
	warning: "bg-yellow-50 border border-yellow-200 text-yellow-800",
	error: "bg-red-50 border border-red-200 text-red-700",
	info: "bg-blue-50 border border-blue-200 text-blue-700",
} as const;

const DEFAULT_ICONS = {
	success: <CheckCircle2 className="size-5 shrink-0 mt-0.5" />,
	warning: <AlertTriangle className="size-5 shrink-0 mt-0.5" />,
	error: <AlertCircle className="size-5 shrink-0 mt-0.5" />,
	info: <Info className="size-5 shrink-0 mt-0.5" />,
} as const;

export function StatusCallout({
	variant,
	title,
	children,
	message,
	icon,
	onRetry,
	onDismiss,
	className,
}: StatusCalloutProps) {
	const resolvedIcon =
		icon !== undefined ? (
			// Clone with size/shrink classes if it's a plain element override
			<span className="size-5 shrink-0 mt-0.5 flex items-center justify-center">
				{icon}
			</span>
		) : (
			DEFAULT_ICONS[variant]
		);

	const body = children ?? (message ? <p className="text-sm">{message}</p> : null);

	const role = variant === "error" ? "alert" : "status";

	return (
		<div
			role={role}
			className={cn(
				"rounded-xl p-4 flex items-start gap-3",
				VARIANT_STYLES[variant],
				className,
			)}
		>
			{resolvedIcon}

			<div className="flex-1 min-w-0">
				{title && <p className="font-medium text-sm mb-1">{title}</p>}
				{body}
				{variant === "error" && onRetry && (
					<div className="mt-2">
						<Button variant="outline" size="sm" onClick={onRetry}>
							Retry
						</Button>
					</div>
				)}
			</div>

			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss"
					className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
				>
					<X className="size-4" />
				</button>
			)}
		</div>
	);
}
