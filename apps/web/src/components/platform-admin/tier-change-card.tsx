/**
 * Platform Admin — Tier change card (Plan F.3.5 — Agent T2).
 *
 * Surfaces a tier swap action on the tenant Billing tab. Reads the current
 * tier from props (so the parent can fetch from `getTenantDetail` and pass
 * it through). Renders a tier picker + confirm dialog. super_admin only —
 * support/billing admins see the card but with the control disabled.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft } from "lucide-react";
import { type Tier } from "@avantej-core/types";
import { client } from "@/utils/orpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	TierChangeConfirmDialog,
	type TierChangeInput,
} from "./tier-change-confirm-dialog";

const ALL_TIERS: Tier[] = ["basic", "professional", "enterprise"];

export function TierChangeCard({
	organizationId,
	currentTier,
	isSuperAdmin,
	onChanged,
}: {
	organizationId: string;
	currentTier: Tier;
	isSuperAdmin: boolean;
	onChanged?: () => void;
}) {
	const [pendingTier, setPendingTier] = useState<Tier | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);

	const mutation = useMutation({
		mutationFn: (input: TierChangeInput) =>
			client.platformAdminTenants.billing.changeTier({
				organizationId,
				toTier: input.toTier,
				prorationBehavior: input.prorationBehavior,
				notes: input.notes,
			}),
		onSuccess: (r) => {
			const amount =
				typeof r.prorationAmountCents === "number"
					? `$${(r.prorationAmountCents / 100).toFixed(2)}`
					: "—";
			toast.success(
				`Tier changed to ${r.toTier.toUpperCase()}. Proration: ${amount}.`,
			);
			setDialogOpen(false);
			setPendingTier(null);
			onChanged?.();
		},
		onError: (e: unknown) => {
			toast.error(
				`Tier change failed: ${(e as Error)?.message ?? "unknown"}`,
			);
		},
	});

	const otherTiers = ALL_TIERS.filter((t) => t !== currentTier);
	const canSubmit = isSuperAdmin && pendingTier && pendingTier !== currentTier;

	return (
		<Card data-testid="tier-change-card">
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<ArrowRightLeft className="h-4 w-4" />
					Subscription tier
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground">Current tier:</span>
					<Badge
						variant="outline"
						className="uppercase tracking-wide"
						data-testid="tier-change-current"
					>
						{currentTier}
					</Badge>
				</div>

				{isSuperAdmin ? (
					<div className="flex items-end gap-2">
						<div className="flex-1">
							<label className="text-xs uppercase tracking-wide text-muted-foreground">
								Change to
							</label>
							<Select
								value={pendingTier ?? ""}
								onValueChange={(v) => setPendingTier(v as Tier)}
							>
								<SelectTrigger
									className="mt-1"
									data-testid="tier-change-select"
								>
									<SelectValue placeholder="Select a new tier…" />
								</SelectTrigger>
								<SelectContent>
									{otherTiers.map((t) => (
										<SelectItem
											key={t}
											value={t}
											data-testid={`tier-change-option-${t}`}
										>
											{t.toUpperCase()}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							type="button"
							disabled={!canSubmit}
							onClick={() => setDialogOpen(true)}
							data-testid="tier-change-open-btn"
						>
							Change tier
						</Button>
					</div>
				) : (
					<div className="text-xs text-muted-foreground">
						Tier changes require super_admin role.
					</div>
				)}
			</CardContent>

			{pendingTier && (
				<TierChangeConfirmDialog
					open={dialogOpen}
					currentTier={currentTier}
					toTier={pendingTier}
					isPending={mutation.isPending}
					onClose={() => setDialogOpen(false)}
					onConfirm={(input) => mutation.mutate(input)}
				/>
			)}
		</Card>
	);
}
