/**
 * Platform Admin — Coupon create dialog (Plan F.3.5 — Agent C2).
 *
 * Form for super_admins to mint a new Stripe coupon. Live-previews the
 * resulting coupon string. Validation mirrors the server-side Zod refines.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type CouponCreateInput = {
	name: string;
	discountKind: "percent" | "amount";
	percentOff?: number;
	amountOffCents?: number;
	currency: string;
	duration: "once" | "repeating" | "forever";
	durationInMonths?: number;
	maxRedemptions?: number;
};

function previewLine(input: {
	discountKind: "percent" | "amount";
	percentOff?: number;
	amountOffCents?: number;
	currency: string;
	duration: "once" | "repeating" | "forever";
	durationInMonths?: number;
	maxRedemptions?: number;
}): string {
	const discount =
		input.discountKind === "percent"
			? input.percentOff
				? `${input.percentOff}% off`
				: "— off"
			: input.amountOffCents
				? `$${(input.amountOffCents / 100).toFixed(2)} ${input.currency.toUpperCase()} off`
				: "— off";
	const duration =
		input.duration === "once"
			? "for one invoice"
			: input.duration === "forever"
				? "forever"
				: `for ${input.durationInMonths ?? "—"} month${
						input.durationInMonths === 1 ? "" : "s"
					}`;
	const cap = input.maxRedemptions
		? `, max ${input.maxRedemptions} redemptions`
		: "";
	return `Coupon: ${discount} ${duration}${cap}`;
}

export function CouponCreateDialog({
	open,
	onClose,
	onSubmit,
	isPending,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (input: CouponCreateInput) => void;
	isPending: boolean;
}) {
	const [name, setName] = useState("");
	const [discountKind, setDiscountKind] = useState<"percent" | "amount">(
		"percent",
	);
	const [percentOffStr, setPercentOffStr] = useState("20");
	const [amountOffStr, setAmountOffStr] = useState("");
	const [currency, setCurrency] = useState("usd");
	const [duration, setDuration] = useState<"once" | "repeating" | "forever">(
		"once",
	);
	const [durationInMonthsStr, setDurationInMonthsStr] = useState("");
	const [maxRedemptionsStr, setMaxRedemptionsStr] = useState("");

	useEffect(() => {
		if (open) {
			setName("");
			setDiscountKind("percent");
			setPercentOffStr("20");
			setAmountOffStr("");
			setCurrency("usd");
			setDuration("once");
			setDurationInMonthsStr("");
			setMaxRedemptionsStr("");
		}
	}, [open]);

	const percentOff = percentOffStr === "" ? undefined : Number(percentOffStr);
	const amountOffCents =
		amountOffStr === "" ? undefined : Math.round(Number(amountOffStr) * 100);
	const durationInMonths =
		durationInMonthsStr === "" ? undefined : Number(durationInMonthsStr);
	const maxRedemptions =
		maxRedemptionsStr === "" ? undefined : Number(maxRedemptionsStr);

	const valid = useMemo(() => {
		if (name.trim().length === 0 || name.length > 100) return false;
		if (discountKind === "percent") {
			if (
				percentOff === undefined ||
				Number.isNaN(percentOff) ||
				percentOff < 1 ||
				percentOff > 100
			)
				return false;
		} else {
			if (
				amountOffCents === undefined ||
				Number.isNaN(amountOffCents) ||
				amountOffCents < 1
			)
				return false;
			if (currency.length !== 3) return false;
		}
		if (duration === "repeating") {
			if (
				durationInMonths === undefined ||
				Number.isNaN(durationInMonths) ||
				durationInMonths < 1 ||
				durationInMonths > 60
			)
				return false;
		}
		if (
			maxRedemptions !== undefined &&
			(Number.isNaN(maxRedemptions) || maxRedemptions < 1)
		)
			return false;
		return true;
	}, [
		name,
		discountKind,
		percentOff,
		amountOffCents,
		currency,
		duration,
		durationInMonths,
		maxRedemptions,
	]);

	const preview = previewLine({
		discountKind,
		percentOff,
		amountOffCents,
		currency,
		duration,
		durationInMonths,
		maxRedemptions,
	});

	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-lg" data-testid="coupon-create-dialog">
				<DialogHeader>
					<DialogTitle>New coupon</DialogTitle>
					<DialogDescription>
						Creates a coupon in Stripe. Coupons can later be applied to a tenant
						from the Billing tab.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div>
						<Label htmlFor="coupon-name">Name</Label>
						<Input
							id="coupon-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							maxLength={100}
							placeholder="e.g. Q2 launch discount"
							data-testid="coupon-name-input"
						/>
					</div>

					<div>
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Discount kind
						</Label>
						<RadioGroup
							value={discountKind}
							onValueChange={(v) => setDiscountKind(v as "percent" | "amount")}
							className="mt-2"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="percent" id="kind-percent" />
								<Label htmlFor="kind-percent" className="font-normal">
									Percent
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="amount" id="kind-amount" />
								<Label htmlFor="kind-amount" className="font-normal">
									Fixed amount
								</Label>
							</div>
						</RadioGroup>
					</div>

					{discountKind === "percent" ? (
						<div>
							<Label htmlFor="coupon-percent">Percent off (1–100)</Label>
							<Input
								id="coupon-percent"
								type="number"
								min={1}
								max={100}
								value={percentOffStr}
								onChange={(e) => setPercentOffStr(e.target.value)}
								data-testid="coupon-percent-input"
							/>
						</div>
					) : (
						<div className="grid grid-cols-2 gap-2">
							<div>
								<Label htmlFor="coupon-amount">Amount (in dollars)</Label>
								<Input
									id="coupon-amount"
									type="number"
									min={0.01}
									step={0.01}
									value={amountOffStr}
									onChange={(e) => setAmountOffStr(e.target.value)}
									data-testid="coupon-amount-input"
								/>
							</div>
							<div>
								<Label htmlFor="coupon-currency">Currency</Label>
								<Input
									id="coupon-currency"
									maxLength={3}
									value={currency}
									onChange={(e) => setCurrency(e.target.value.toLowerCase())}
									data-testid="coupon-currency-input"
								/>
							</div>
						</div>
					)}

					<div>
						<Label className="text-xs uppercase tracking-wide text-muted-foreground">
							Duration
						</Label>
						<RadioGroup
							value={duration}
							onValueChange={(v) =>
								setDuration(v as "once" | "repeating" | "forever")
							}
							className="mt-2"
						>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="once" id="dur-once" />
								<Label htmlFor="dur-once" className="font-normal">
									Once
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="repeating" id="dur-repeating" />
								<Label htmlFor="dur-repeating" className="font-normal">
									Repeating
								</Label>
							</div>
							<div className="flex items-center gap-2">
								<RadioGroupItem value="forever" id="dur-forever" />
								<Label htmlFor="dur-forever" className="font-normal">
									Forever
								</Label>
							</div>
						</RadioGroup>
					</div>

					{duration === "repeating" ? (
						<div>
							<Label htmlFor="coupon-duration-months">
								Duration in months (1–60)
							</Label>
							<Input
								id="coupon-duration-months"
								type="number"
								min={1}
								max={60}
								value={durationInMonthsStr}
								onChange={(e) => setDurationInMonthsStr(e.target.value)}
								data-testid="coupon-duration-months-input"
							/>
						</div>
					) : null}

					<div>
						<Label htmlFor="coupon-max-redemptions">
							Max redemptions (optional)
						</Label>
						<Input
							id="coupon-max-redemptions"
							type="number"
							min={1}
							value={maxRedemptionsStr}
							onChange={(e) => setMaxRedemptionsStr(e.target.value)}
							placeholder="Unlimited"
							data-testid="coupon-max-redemptions-input"
						/>
					</div>

					<div
						className="rounded-md border p-3 text-sm bg-muted/30"
						data-testid="coupon-preview"
					>
						{preview}
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
						data-testid="coupon-create-submit-btn"
						onClick={() =>
							onSubmit({
								name: name.trim(),
								discountKind,
								percentOff: discountKind === "percent" ? percentOff : undefined,
								amountOffCents:
									discountKind === "amount" ? amountOffCents : undefined,
								currency,
								duration,
								durationInMonths:
									duration === "repeating" ? durationInMonths : undefined,
								maxRedemptions,
							})
						}
					>
						{isPending ? (
							<>
								<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								Creating…
							</>
						) : (
							"Create coupon"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
