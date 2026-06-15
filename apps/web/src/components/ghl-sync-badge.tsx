/**
 * Shared GHL sync status badge with optional retry button.
 *
 * Used by both the staff Members tab (links via `ghl_user_links`) and the
 * Customers page (links via `ghl_contact_links`). The badge only renders the
 * status + last error tooltip; the retry handler is supplied by the caller so
 * each page can wire it to the appropriate procedure
 * (`members.retryGhlSync` vs `customerProfiles.retryGhlSync`).
 */

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type GhlSyncStatus = "active" | "inactive" | "skipped" | "error";

export interface GhlSyncInfo {
	syncStatus: GhlSyncStatus;
	lastError: string | null;
	lastSyncedAt: Date | string | null;
	// Discriminator: staff rows have `ghlUserId`; customer rows have
	// `ghlContactId` + `customerProfileId`.
	kind?: "staff" | "customer";
	ghlUserId?: string;
	ghlContactId?: string;
	customerProfileId?: string;
}

interface GhlSyncBadgeProps {
	ghlSync: GhlSyncInfo | null | undefined;
	onRetry?: () => void;
	isRetrying?: boolean;
}

export function GhlSyncBadge({
	ghlSync,
	onRetry,
	isRetrying,
}: GhlSyncBadgeProps) {
	if (!ghlSync) {
		return <span className="text-xs text-muted-foreground">-</span>;
	}

	const status = ghlSync.syncStatus;
	const variantClass =
		status === "active"
			? "bg-emerald-100 text-emerald-800 border-emerald-300"
			: status === "error"
				? "bg-destructive/10 text-destructive border-destructive/30"
				: "bg-muted text-muted-foreground border-border";

	const label =
		status === "active"
			? "Synced"
			: status === "error"
				? "Error"
				: status === "inactive"
					? "Inactive"
					: status === "skipped"
						? "Skipped"
						: status;

	const badge = (
		<Badge variant="outline" className={cn("text-xs capitalize", variantClass)}>
			{label}
		</Badge>
	);

	return (
		<div className="flex items-center gap-2">
			{status === "error" && ghlSync.lastError ? (
				<TooltipProvider delayDuration={150}>
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="cursor-help">{badge}</span>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs break-words">
							{ghlSync.lastError}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			) : (
				badge
			)}
			{status === "error" && onRetry && (
				<Button
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-xs"
					onClick={onRetry}
					disabled={isRetrying}
					aria-label="Retry GHL sync"
				>
					<RefreshCw
						className={cn("size-3 mr-1", isRetrying && "animate-spin")}
					/>
					{isRetrying ? "Retrying" : "Retry"}
				</Button>
			)}
		</div>
	);
}
