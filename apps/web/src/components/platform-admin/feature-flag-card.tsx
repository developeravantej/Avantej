/**
 * Feature flag card (Plan F.4, Agent Ff).
 *
 * Single-feature display for the Feature flags tab on the tenant
 * drill-in. Read-only — visual cue (green ring + ON chip when enabled,
 * grey + OFF when not), name, description, optional icon.
 */

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function FeatureFlagCard({
	name,
	description,
	enabled,
	icon,
	testId,
}: {
	name: string;
	description: string;
	enabled: boolean;
	icon?: ReactNode;
	testId?: string;
}) {
	return (
		<Card
			className={
				enabled
					? "ring-1 ring-green-500/40 bg-green-500/[0.03]"
					: "opacity-80"
			}
			data-testid={testId}
			data-enabled={enabled ? "true" : "false"}
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
					<Badge
						variant={enabled ? "default" : "secondary"}
						className={
							enabled
								? "bg-green-600 hover:bg-green-600 text-white"
								: undefined
						}
						data-testid={
							testId ? `${testId}-chip` : undefined
						}
					>
						{enabled ? "ON" : "OFF"}
					</Badge>
				</div>
				<p className="text-xs text-muted-foreground leading-snug">
					{description}
				</p>
			</CardContent>
		</Card>
	);
}
