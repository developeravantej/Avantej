import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { loadStripe, type Stripe, type StripeElements } from "@stripe/stripe-js";
import {
	Elements,
	PaymentElement,
	useElements,
	useStripe,
} from "@stripe/react-stripe-js";
import { CreditCard, Loader2, Plus, CheckCircle2, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToRm, rmToCents } from "@/lib/money";
import { client as orpcClient } from "@/utils/orpc";

type SavedCard = {
	id: string;
	brand: string;
	last4: string;
	expMonth: number;
	expYear: number;
	isDefault: boolean;
};

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
	| string
	| undefined;

export function SavedCardsSection({
	organizationId,
	customerProfileId,
}: {
	organizationId: string;
	customerProfileId: string;
}) {
	const [saveOpen, setSaveOpen] = useState(false);
	const [chargeTarget, setChargeTarget] = useState<SavedCard | null>(null);

	const cardsQuery = useQuery({
		queryKey: ["saved-cards", organizationId, customerProfileId],
		queryFn: async () =>
			(await orpcClient.payments.listSavedCards({
				organizationId,
				customerProfileId,
			})) as { cards: SavedCard[] },
		enabled: !!organizationId && !!customerProfileId,
	});

	const cards = cardsQuery.data?.cards ?? [];

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
				<CardTitle className="flex items-center gap-2 text-base">
					<CreditCard className="size-4" />
					Saved cards
				</CardTitle>
				<Button
					size="sm"
					variant="outline"
					onClick={() => setSaveOpen(true)}
				>
					<Plus className="mr-1 size-3.5" />
					Save card
				</Button>
			</CardHeader>
			<CardContent>
				{cardsQuery.isLoading ? (
					<div className="flex items-center justify-center py-6">
						<Loader2 className="size-5 animate-spin" />
					</div>
				) : cards.length === 0 ? (
					<p className="py-4 text-center text-muted-foreground text-sm">
						No saved cards. Click "Save card" to collect one for off-session charges.
					</p>
				) : (
					<ul className="space-y-2">
						{cards.map((c) => (
							<li
								key={c.id}
								className="flex items-center justify-between rounded-md border p-3 text-sm"
							>
								<div className="flex items-center gap-3">
									<div className="font-medium uppercase tracking-wide">
										{c.brand}
									</div>
									<div className="text-muted-foreground">
										•••• {c.last4}
									</div>
									<div className="text-muted-foreground text-xs">
										exp {c.expMonth.toString().padStart(2, "0")}/{c.expYear}
									</div>
								</div>
								<div className="flex items-center gap-2">
									{c.isDefault && (
										<Badge className="gap-1 bg-green-600 hover:bg-green-700">
											<CheckCircle2 className="size-3" />
											Default
										</Badge>
									)}
									<Button
										size="sm"
										variant="outline"
										className="text-amber-600 hover:bg-amber-50 hover:text-amber-700 border-amber-200"
										onClick={() => setChargeTarget(c)}
									>
										<Zap className="mr-1 size-3.5" />
										Charge
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</CardContent>

			<ChargeSavedCardDialog
				card={chargeTarget}
				onClose={() => setChargeTarget(null)}
				onCharged={() => {
					// Successful charge — refresh card list (default may flip).
					cardsQuery.refetch();
				}}
				organizationId={organizationId}
				customerProfileId={customerProfileId}
			/>

			<SaveCardDialog
				open={saveOpen}
				onClose={() => setSaveOpen(false)}
				onSaved={() => cardsQuery.refetch()}
				organizationId={organizationId}
				customerProfileId={customerProfileId}
			/>
		</Card>
	);
}

function SaveCardDialog({
	open,
	onClose,
	onSaved,
	organizationId,
	customerProfileId,
}: {
	open: boolean;
	onClose: () => void;
	onSaved: () => void;
	organizationId: string;
	customerProfileId: string;
}) {
	const [setup, setSetup] = useState<{
		clientSecret: string;
		stripeAccountId: string;
	} | null>(null);

	const createSetup = useMutation({
		mutationFn: async () =>
			(await orpcClient.payments.createSetupIntent({
				organizationId,
				customerProfileId,
			})) as {
				clientSecret: string;
				setupIntentId: string;
				stripeAccountId: string;
				stripeCustomerId: string;
			},
		onSuccess: (data) =>
			setSetup({
				clientSecret: data.clientSecret,
				stripeAccountId: data.stripeAccountId,
			}),
		onError: (err: unknown) =>
			toast.error(err instanceof Error ? err.message : "Failed to start save-card"),
	});

	useEffect(() => {
		if (open && !setup && !createSetup.isPending) {
			createSetup.mutate();
		}
		if (!open) {
			setSetup(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
		if (!setup || !publishableKey) return null;
		return loadStripe(publishableKey, { stripeAccount: setup.stripeAccountId });
	}, [setup]);

	return (
		<Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Save card for off-session charges</DialogTitle>
					<DialogDescription>
						Customer's card is stored on the tenant's Stripe Connect account.
						Used later without prompting (memberships, no-shows, rebooking).
					</DialogDescription>
				</DialogHeader>

				{!publishableKey && (
					<p className="rounded-md bg-red-50 p-3 text-red-900 text-sm">
						Missing VITE_STRIPE_PUBLISHABLE_KEY — set it in apps/web/.env.
					</p>
				)}

				{createSetup.isPending && (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="size-6 animate-spin" />
					</div>
				)}

				{setup && stripePromise && (
					<Elements
						stripe={stripePromise}
						options={{ clientSecret: setup.clientSecret }}
					>
						<SaveCardForm onSaved={onSaved} onClose={onClose} />
					</Elements>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SaveCardForm({
	onSaved,
	onClose,
}: {
	onSaved: () => void;
	onClose: () => void;
}) {
	const stripe = useStripe();
	const elements = useElements();
	const [submitting, setSubmitting] = useState(false);

	const confirm = async () => {
		if (!stripe || !elements) return;
		setSubmitting(true);
		const { error } = await stripe.confirmSetup({
			elements: elements as StripeElements,
			confirmParams: { return_url: window.location.href },
			redirect: "if_required",
		});
		setSubmitting(false);
		if (error) {
			toast.error(error.message ?? "Save failed");
			return;
		}
		toast.success("Card saved — confirming via webhook…");
		onSaved();
		onClose();
	};

	return (
		<div className="space-y-4">
			<PaymentElement />
			<div className="flex gap-2">
				<Button variant="outline" onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button onClick={confirm} disabled={submitting} className="flex-1">
					{submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
					Save card
				</Button>
			</div>
		</div>
	);
}

function ChargeSavedCardDialog({
	card,
	onClose,
	onCharged,
	organizationId,
	customerProfileId,
}: {
	card: SavedCard | null;
	onClose: () => void;
	onCharged: () => void;
	organizationId: string;
	customerProfileId: string;
}) {
	const [amountRm, setAmountRm] = useState("");
	const [description, setDescription] = useState("");

	const charge = useMutation({
		mutationFn: async () => {
			if (!card) throw new Error("No card selected");
			const cents = rmToCents(Number.parseFloat(amountRm));
			return (await orpcClient.payments.chargeSavedCard({
				organizationId,
				customerProfileId,
				paymentMethodId: card.id,
				amount: cents,
				currency: "MYR",
				description: description.trim() || undefined,
			})) as {
				paymentIntentId: string;
				status: string;
				amount: number;
				currency: string;
				applicationFeeAmount: number;
			};
		},
		onSuccess: (data) => {
			if (data.status === "succeeded") {
				toast.success(
					`Charged RM${centsToRm(data.amount)} — ${data.paymentIntentId}`,
				);
			} else {
				toast.warning(
					`Charge needs follow-up: ${data.status}. PI=${data.paymentIntentId}`,
				);
			}
			onCharged();
			handleClose();
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Charge failed");
		},
	});

	function handleClose() {
		setAmountRm("");
		setDescription("");
		onClose();
	}

	const parsed = Number.parseFloat(amountRm);
	const validAmount = Number.isFinite(parsed) && parsed > 0;

	return (
		<Dialog open={card !== null} onOpenChange={(o) => { if (!o) handleClose(); }}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{card && `Charge ${card.brand.toUpperCase()} •••• ${card.last4}`}
					</DialogTitle>
					<DialogDescription>
						Off-session charge using the saved card. Application fee per tier
						(Phase 3d) is remitted to Avantej.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="charge-amount">Amount (RM)</Label>
						<Input
							id="charge-amount"
							type="number"
							inputMode="decimal"
							step="0.01"
							min="0.01"
							placeholder="0.00"
							value={amountRm}
							onChange={(e) => setAmountRm(e.target.value)}
							disabled={charge.isPending}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="charge-desc">Description (optional)</Label>
						<Input
							id="charge-desc"
							placeholder="No-show fee, deposit, ..."
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							disabled={charge.isPending}
						/>
					</div>
				</div>

				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={handleClose} disabled={charge.isPending}>
						Cancel
					</Button>
					<Button
						onClick={() => charge.mutate()}
						disabled={!validAmount || charge.isPending}
						className="bg-amber-600 hover:bg-amber-700"
					>
						{charge.isPending ? (
							<Loader2 className="mr-2 size-4 animate-spin" />
						) : (
							<Zap className="mr-2 size-4" />
						)}
						Charge RM{validAmount ? parsed.toFixed(2) : "—"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
