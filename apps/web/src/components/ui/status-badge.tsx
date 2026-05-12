import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CanonicalStatus =
	| "pending"
	| "approved"
	| "active"
	| "confirmed"
	| "rejected"
	| "cancelled"
	| "inactive"
	| "discontinued"
	| "paid"
	| "completed"
	| "frozen"
	| "expired"
	| "draft"
	| "in_transit"
	| "fulfilled"
	| "received"
	| "void"
	| "checked_in"
	| "no-show"

export const KNOWN_STATUSES: CanonicalStatus[] = [
	"pending",
	"approved",
	"active",
	"confirmed",
	"rejected",
	"cancelled",
	"inactive",
	"discontinued",
	"paid",
	"completed",
	"frozen",
	"expired",
	"draft",
	"in_transit",
	"fulfilled",
	"received",
	"void",
	"checked_in",
	"no-show",
]

type StatusConfig = {
	variant: "outline" | "destructive" | "secondary" | "default"
	className?: string
}

const STATUS_CONFIG: Record<CanonicalStatus, StatusConfig> = {
	pending: { variant: "outline" },
	draft: { variant: "outline" },
	approved: {
		variant: "outline",
		className: "border-green-300 bg-green-50 text-green-700",
	},
	active: {
		variant: "outline",
		className: "border-green-300 bg-green-50 text-green-700",
	},
	confirmed: {
		variant: "outline",
		className: "border-green-300 bg-green-50 text-green-700",
	},
	checked_in: {
		variant: "outline",
		className: "border-green-300 bg-green-50 text-green-700",
	},
	rejected: { variant: "destructive" },
	cancelled: { variant: "destructive" },
	"no-show": { variant: "destructive" },
	inactive: { variant: "secondary" },
	discontinued: { variant: "secondary" },
	expired: { variant: "secondary" },
	void: { variant: "secondary" },
	paid: {
		variant: "outline",
		className: "border-blue-200 bg-blue-50 text-blue-700",
	},
	completed: {
		variant: "outline",
		className: "border-blue-200 bg-blue-50 text-blue-700",
	},
	in_transit: {
		variant: "outline",
		className: "border-blue-200 bg-blue-50 text-blue-700",
	},
	fulfilled: {
		variant: "outline",
		className: "border-blue-200 bg-blue-50 text-blue-700",
	},
	received: {
		variant: "outline",
		className: "border-blue-200 bg-blue-50 text-blue-700",
	},
	frozen: {
		variant: "outline",
		className: "border-yellow-300 bg-yellow-50 text-yellow-800",
	},
}

function formatStatusLabel(status: CanonicalStatus): string {
	return status
		.replace(/-/g, " ")
		.replace(/_/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase())
}

export interface StatusBadgeProps {
	status: CanonicalStatus
	label?: string
	className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
	const config = STATUS_CONFIG[status]
	const displayLabel = label ?? formatStatusLabel(status)

	return (
		<Badge
			variant={config.variant}
			className={cn(config.className, className)}
		>
			{displayLabel}
		</Badge>
	)
}
