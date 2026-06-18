import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { client } from "@/utils/orpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantDeletionCard } from "@/components/platform-admin/tenant-deletion-card";

export function ActionsTab({
	organizationId,
	currentPaymentStatus,
}: {
	organizationId: string;
	currentPaymentStatus: string;
}) {
	const qc = useQueryClient();
	const invalidate = () =>
		qc.invalidateQueries({
			queryKey: ["platformAdminTenants", "getTenantDetail", organizationId],
		});

	const suspend = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.suspendTenant({ organizationId, reason }),
		onSuccess: () => {
			toast.success("Tenant suspended");
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Suspend failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const resume = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.resumeTenant({ organizationId, reason }),
		onSuccess: () => {
			toast.success("Tenant resumed");
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Resume failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const forceCancel = useMutation({
		mutationFn: (reason: string) =>
			client.platformAdminTenants.forceCancelTenant({
				organizationId,
				reason,
				cancelStripeSubscription: true,
			}),
		onSuccess: (r) => {
			toast.success(
				r.stripeSubCanceled
					? `Cancelled (Stripe sub ${r.stripeSubCanceled})`
					: "Cancelled (no Stripe sub)",
			);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Cancel failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const issueCredit = useMutation({
		mutationFn: (args: {
			amountMinor: number;
			currency: string;
			reason: string;
		}) =>
			client.platformAdminTenants.issueTenantCredit({
				organizationId,
				...args,
			}),
		onSuccess: (r) => {
			toast.success(`Credit issued (${r.stripeBalanceTxId})`);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Credit failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const reTrial = useMutation({
		mutationFn: (args: { extendDays: number; reason: string }) =>
			client.platformAdminTenants.reTrialTenant({ organizationId, ...args }),
		onSuccess: (r) => {
			toast.success(
				`Trial extended until ${r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString() : "—"}`,
			);
			invalidate();
		},
		onError: (e: unknown) =>
			toast.error(`Re-trial failed: ${(e as Error)?.message ?? "unknown"}`),
	});

	const suspended = currentPaymentStatus === "suspended";
	const cancelled = currentPaymentStatus === "cancelled";

	return (
		<div className="space-y-4">
			<div className="text-sm text-muted-foreground">
				Lifecycle ops are <strong>super_admin only</strong>. All actions audit
				to admin_session_actions. Reasons are required and stored.
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<ActionCard
					title="Suspend"
					description="Block charges + read-only app login (ADR-0024)."
					disabled={suspended || cancelled || suspend.isPending}
					confirmLabel="Suspend tenant"
					destructive
					onConfirm={(reason) => suspend.mutate(reason)}
				/>
				<ActionCard
					title="Resume"
					description="Restore to active state. Tenant can log in + transact again."
					disabled={!suspended || resume.isPending}
					confirmLabel="Resume tenant"
					onConfirm={(reason) => resume.mutate(reason)}
				/>
				<ActionCard
					title="Force cancel"
					description="Cancel Stripe subscription immediately + set tenant to cancelled."
					disabled={cancelled || forceCancel.isPending}
					confirmLabel="Force cancel"
					destructive
					onConfirm={(reason) => forceCancel.mutate(reason)}
				/>
				<CreditCard
					disabled={cancelled || issueCredit.isPending}
					onConfirm={(args) => issueCredit.mutate(args)}
				/>
				<ReTrialCard
					disabled={cancelled || reTrial.isPending}
					onConfirm={(args) => reTrial.mutate(args)}
				/>
				<TenantDeletionCard organizationId={organizationId} />
			</div>
		</div>
	);
}

function ActionCard({
	title,
	description,
	disabled,
	confirmLabel,
	destructive,
	onConfirm,
}: {
	title: string;
	description: string;
	disabled: boolean;
	confirmLabel: string;
	destructive?: boolean;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	const valid = reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">{description}</p>
				<Input
					placeholder="Reason (required, min 3 chars)"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					variant={destructive ? "destructive" : "default"}
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (!window.confirm(`${confirmLabel}?\n\nReason: ${reason}`))
							return;
						onConfirm(reason.trim());
						setReason("");
					}}
				>
					{confirmLabel}
				</Button>
			</CardContent>
		</Card>
	);
}

function CreditCard({
	disabled,
	onConfirm,
}: {
	disabled: boolean;
	onConfirm: (args: {
		amountMinor: number;
		currency: string;
		reason: string;
	}) => void;
}) {
	const [amount, setAmount] = useState("");
	const [currency, setCurrency] = useState("USD");
	const [reason, setReason] = useState("");
	const amountMinor = Math.round(parseFloat(amount || "0") * 100);
	const valid =
		amountMinor > 0 && currency.length === 3 && reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Issue credit</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">
					Adds a Stripe customer balance credit (deducts from next invoice).
				</p>
				<div className="flex gap-2">
					<Input
						type="number"
						step="0.01"
						placeholder="Amount"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						disabled={disabled}
					/>
					<Input
						className="w-24"
						placeholder="USD"
						value={currency}
						onChange={(e) => setCurrency(e.target.value.toUpperCase())}
						disabled={disabled}
						maxLength={3}
					/>
				</div>
				<Input
					placeholder="Reason"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (
							!window.confirm(
								`Issue ${amount} ${currency} credit?\n\nReason: ${reason}`,
							)
						)
							return;
						onConfirm({ amountMinor, currency, reason: reason.trim() });
						setAmount("");
						setReason("");
					}}
				>
					Issue credit
				</Button>
			</CardContent>
		</Card>
	);
}

function ReTrialCard({
	disabled,
	onConfirm,
}: {
	disabled: boolean;
	onConfirm: (args: { extendDays: number; reason: string }) => void;
}) {
	const [days, setDays] = useState("14");
	const [reason, setReason] = useState("");
	const extendDays = parseInt(days, 10);
	const valid =
		Number.isFinite(extendDays) &&
		extendDays > 0 &&
		extendDays <= 180 &&
		reason.trim().length >= 3;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Re-trial</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2">
				<p className="text-xs text-muted-foreground">
					Extends trial_ends_at by N days + clears suspension.
				</p>
				<div className="flex gap-2 items-center">
					<Input
						type="number"
						placeholder="Days"
						value={days}
						onChange={(e) => setDays(e.target.value)}
						disabled={disabled}
						className="w-24"
					/>
					<span className="text-sm text-muted-foreground">days (max 180)</span>
				</div>
				<Input
					placeholder="Reason"
					value={reason}
					onChange={(e) => setReason(e.target.value)}
					disabled={disabled}
				/>
				<Button
					size="sm"
					disabled={disabled || !valid}
					onClick={() => {
						if (!valid) return;
						if (
							!window.confirm(
								`Extend trial by ${extendDays} days?\n\nReason: ${reason}`,
							)
						)
							return;
						onConfirm({ extendDays, reason: reason.trim() });
						setReason("");
					}}
				>
					Extend trial
				</Button>
			</CardContent>
		</Card>
	);
}
