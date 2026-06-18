/**
 * Platform Admin — Tier change confirm dialog (Plan F.3.5 — Agent T2).
 *
 * Confirms a tier swap on a tenant's Stripe subscription. Lets the operator
 * pick the proration behavior (default: create_prorations) and optionally
 * attach an internal note that lands in the audit row.
 *
 * Display only — pricing strings use TIER_PRICES_USD_CENTS, which is a
 * placeholder constant. Source of truth for billing is still Stripe.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { TIER_PRICES_USD_CENTS, type Tier } from "@avantej-core/types";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

export type ProrationBehavior = "create_prorations" | "none" | "always_invoice";

export type TierChangeInput = {
	toTier: Tier;
	prorationBehavior: ProrationBehavior;
	notes?: string;
};

function fmtTier(t: Tier) {
	return t.toUpperCase();
}

function fmtPrice(t: Tier) {
	const cents = TIER_PRICES_USD_CENTS[t];
	return `$${(cents / 100).toFixed(0)}/mo`;
}

export function TierChangeConfirmDialog({
	open,
	currentTier,
	toTier,
	onConfirm,
	onClose,
	isPending,
}: {
	open: boolean;
	currentTier: Tier;
	toTier: Tier;
	onConfirm: (input: TierChangeInput) => void;
	onClose: () => void;
	isPending: boolean;
}) {
	const [prorationBehavior, setProrationBehavior] =
		useState<ProrationBehavior>("create_prorations");
	const [notes, setNotes] = useState("");

	useEffect(() => {
		if (open) {
			setProrationBehavior("create_prorations");
			setNotes("");
		}
	}, [open, toTier]);

	const valid = currentTier !== toTier && notes.length <= 1000;

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent data-testid="tier-change-confirm-dialog">
				<DialogHeader>
					<DialogTitle>Change subscription tier</DialogTitle>
					<DialogDescription>
						Swap this tenant's Stripe subscription tier. Stripe will compute
						proration based on the option you select below.
					</DialogDescription>
				</DialogHeader>

				<div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex gap-2 items-start">
					<AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
					<div>
						<div className="font-medium text-amber-700">
							Stripe will create proration invoice items immediately.
						</div>
						<div className="text-xs text-muted-foreground">
							By default credits/debits are added to the next invoice. Audited
							under <code>tenant_tier_change</code>.
						</div>
					</div>
				</div>

				<div className="space-y-3">
					<div className="rounded-md border p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
							Swap
						</div>
						<div
							className="text-sm font-medium"
							data-testid="tier-change-summary"
						>
							{fmtTier(currentTier)} ({fmtPrice(currentTier)}) →{" "}
							{fmtTier(toTier)} ({fmtPrice(toTier)})
						</div>
					</div>

					<div>
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Proration behavior
						</Label>
						<RadioGroup
							value={prorationBehavior}
							onValueChange={(v) =>
								setProrationBehavior(v as ProrationBehavior)
							}
							className="mt-2"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem
									value="create_prorations"
									id="proration-default"
								/>
								<Label htmlFor="proration-default" className="font-normal">
									Prorate (default) — apply credits/debits to next invoice
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="none" id="proration-none" />
								<Label htmlFor="proration-none" className="font-normal">
									No proration
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="always_invoice" id="proration-always" />
								<Label htmlFor="proration-always" className="font-normal">
									Always invoice now
								</Label>
							</div>
						</RadioGroup>
					</div>

					<div>
						<Label htmlFor="tier-change-notes">Internal notes (optional)</Label>
						<Textarea
							id="tier-change-notes"
							placeholder="Audit-only context — e.g. ticket number, customer ask"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							disabled={isPending}
							maxLength={1000}
							data-testid="tier-change-notes-input"
						/>
						<div className="text-xs text-muted-foreground mt-1">
							{notes.length}/1000
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={onClose}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						disabled={!valid || isPending}
						onClick={() =>
							onConfirm({
								toTier,
								prorationBehavior,
								notes: notes.trim() || undefined,
							})
						}
						data-testid="tier-change-confirm-btn"
					>
						{isPending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								Changing tier…
							</>
						) : (
							"Change tier"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
