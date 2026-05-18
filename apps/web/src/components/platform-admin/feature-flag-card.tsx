/**
 * Feature flag card (Plan F.4 Agent Ff + F.6 Agent Fo).
 *
 * Single-feature display for the Feature flags tab on the tenant
 * drill-in. Visual cue:
 *   - enabled: green ring + ON chip
 *   - disabled: dimmed + OFF chip
 *   - overridden: amber ring + "overridden" badge (overrides enabled state)
 *
 * Optional super-admin controls:
 *   - onToggle(enabled): flip the flag (creates/updates override)
 *   - onClearOverride(): drop override → revert to tier default
 *   - overrideMetadata: small "by ... on ..." caption + optional notes
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type FeatureFlagOverrideMetadata = {
	setByEmail: string | null;
	notes: string | null;
	updatedAt: string | null;
};

export function FeatureFlagCard({
	name,
	description,
	enabled,
	icon,
	testId,
	isOverridden = false,
	onToggle,
	onClearOverride,
	overrideMetadata,
}: {
	name: string;
	description: string;
	enabled: boolean;
	icon?: ReactNode;
	testId?: string;
	isOverridden?: boolean;
	onToggle?: (enabled: boolean) => void;
	onClearOverride?: () => void;
	overrideMetadata?: FeatureFlagOverrideMetadata;
}) {
	const ringClass = isOverridden
		? "ring-1 ring-amber-500/50 bg-amber-500/[0.04]"
		: enabled
			? "ring-1 ring-green-500/40 bg-green-500/[0.03]"
			: "opacity-80";
	return (
		<Card
			className={ringClass}
			data-testid={testId}
			data-enabled={enabled ? "true" : "false"}
			data-overridden={isOverridden ? "true" : "false"}
		>
			<CardContent className="pt-4 pb-4 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex items-center gap-2">
						{icon ? (
							<span
								className={
									enabled
										? "text-green-600 shrink-0"
										: "text-muted-foreground shrink-0"
								}
							>
								{icon}
							</span>
						) : null}
						<div className="text-sm font-semibold leading-tight">{name}</div>
					</div>
					<div className="flex items-center gap-1.5">
						{isOverridden ? (
							<Badge
								variant="outline"
								className="border-amber-500/60 text-amber-700 dark:text-amber-400"
								data-testid={testId ? `${testId}-overridden-badge` : undefined}
							>
								overridden
							</Badge>
						) : null}
						<Badge
							variant={enabled ? "default" : "secondary"}
							className={
								enabled
									? "bg-green-600 hover:bg-green-600 text-white"
									: undefined
							}
							data-testid={testId ? `${testId}-chip` : undefined}
						>
							{enabled ? "ON" : "OFF"}
						</Badge>
					</div>
				</div>
				<p className="text-xs text-muted-foreground leading-snug">
					{description}
				</p>
				{isOverridden && overrideMetadata ? (
					<div
						className="text-[11px] text-muted-foreground leading-tight pt-1 border-t border-amber-500/20"
						data-testid={testId ? `${testId}-override-meta` : undefined}
					>
						<div>
							by{" "}
							<span className="font-medium">
								{overrideMetadata.setByEmail ?? "unknown"}
							</span>
							{overrideMetadata.updatedAt ? (
								<>
									{" "}
									·{" "}
									{new Date(overrideMetadata.updatedAt).toLocaleDateString()}
								</>
							) : null}
						</div>
						{overrideMetadata.notes ? (
							<div className="italic mt-0.5">"{overrideMetadata.notes}"</div>
						) : null}
					</div>
				) : null}
				{onToggle || (isOverridden && onClearOverride) ? (
					<div className="flex items-center justify-end gap-2 pt-1">
						{onToggle ? (
							<Button
								size="sm"
								variant="outline"
								onClick={() => onToggle(!enabled)}
								data-testid={testId ? `${testId}-toggle-btn` : undefined}
							>
								{enabled ? "Disable" : "Enable"}
							</Button>
						) : null}
						{isOverridden && onClearOverride ? (
							<Button
								size="sm"
								variant="ghost"
								onClick={onClearOverride}
								data-testid={testId ? `${testId}-clear-override-btn` : undefined}
								className="text-xs"
							>
								Reset to tier default
							</Button>
						) : null}
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
