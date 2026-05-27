/**
 * Partner Stripe Connect card (S-partner-stripe-onboarding, PR #32).
 *
 * Sits on the payouts tab. Lets an admin:
 *   1. Pick a tenant member (the partner / coach receiving payouts).
 *   2. See their cached Stripe Connect status (`partner_stripe_accounts`).
 *   3. Start hosted OAuth onboarding (full-page redirect).
 *   4. Refresh capability state from Stripe.
 *
 * Compact by design — full management UI (per-partner detail, country picker,
 * requirements rendering) is a follow-up. This is the entrypoint that unblocks
 * `confirmViaStripe` on pending `stripe_connect` payouts.
 */
import { useMemo, useState } from "react";
import {
	CheckCircle2,
	AlertCircle,
	XCircle,
	Clock,
	ExternalLink,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { client } from "@/utils/orpc";
import { cn } from "@/lib/utils";
import {
	useCreatePartnerOnboardingUrl,
	usePartnerStripeStatus,
	useRefreshPartnerStripe,
} from "../api";

interface Props {
	organizationId: string;
}

type MemberRow = {
	id: string;
	userId: string;
	name: string;
	role: string;
	status: string;
};

function StatusPill({ status }: { status: string }) {
	const map: Record<string, { label: string; icon: typeof Clock; cls: string }> = {
		active: {
			label: "Active",
			icon: CheckCircle2,
			cls: "bg-green-50 text-green-700 border-green-200",
		},
		pending: {
			label: "Pending onboarding",
			icon: Clock,
			cls: "bg-amber-50 text-amber-700 border-amber-200",
		},
		restricted: {
			label: "Restricted",
			icon: AlertCircle,
			cls: "bg-orange-50 text-orange-700 border-orange-200",
		},
		rejected: {
			label: "Rejected",
			icon: XCircle,
			cls: "bg-red-50 text-red-700 border-red-200",
		},
	};
	const config = map[status] ?? map.pending!;
	const Icon = config.icon;
	return (
		<Badge variant="outline" className={cn("gap-1", config.cls)}>
			<Icon className="h-3 w-3" />
			{config.label}
		</Badge>
	);
}

export function PartnerStripeCard({ organizationId }: Props) {
	const [partnerId, setPartnerId] = useState<string | null>(null);

	const { data: members, isLoading: loadingMembers } = useQuery({
		queryKey: ["members-list-payable", organizationId],
		queryFn: () =>
			client.members.list({ organizationId }) as Promise<MemberRow[]>,
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const payable = useMemo(
		() =>
			(members ?? []).filter(
				(m) =>
					m.status === "active" &&
					(m.role === "trainer" || m.role === "staff" || m.role === "admin"),
			),
		[members],
	);

	const { data: status, isLoading: loadingStatus } = usePartnerStripeStatus(
		organizationId,
		partnerId,
	);

	const onboardingMutation = useCreatePartnerOnboardingUrl(organizationId);
	const refreshMutation = useRefreshPartnerStripe(organizationId);

	const selectedMember = payable.find((m) => m.userId === partnerId);
	const showRefresh = !!status?.detailsSubmitted;
	const showOnboard = !!partnerId && (!status?.detailsSubmitted || status.connectStatus !== "active");

	return (
		<div className="rounded-2xl border border-[#e5e5e5] bg-white p-4 space-y-3">
			<div>
				<h3 className="text-sm font-semibold text-[#0a0a0a]">Partner Stripe Connect</h3>
				<p className="text-xs text-[#737373] mt-0.5">
					Onboard a coach to receive payouts via Stripe transfer. Required before
					<code className="mx-1 text-[10px] font-mono rounded bg-[#f3f3f3] px-1 py-0.5">stripe_connect</code>
					batch confirmations can fire.
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
				<div className="space-y-1.5">
					<label htmlFor="partner-select" className="text-xs font-medium text-[#737373]">
						Partner
					</label>
					<Select
						value={partnerId ?? ""}
						onValueChange={(v) => setPartnerId(v || null)}
						disabled={loadingMembers}
					>
						<SelectTrigger id="partner-select" className="w-full">
							<SelectValue placeholder={loadingMembers ? "Loading…" : "Pick a coach / staff member…"} />
						</SelectTrigger>
						<SelectContent>
							{payable.map((m) => (
								<SelectItem key={m.userId} value={m.userId}>
									{m.name} <span className="text-[#737373]">· {m.role}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2 min-h-9">
					{partnerId && loadingStatus ? (
						<span className="text-xs text-[#737373]">Loading status…</span>
					) : partnerId && status ? (
						<StatusPill status={status.connectStatus} />
					) : null}
				</div>
			</div>

			{partnerId && status?.detailsSubmitted ? (
				<div className="rounded-md border border-[#e5e5e5] bg-[#fcfaf6] px-3 py-2 text-xs space-y-1">
					<div className="flex justify-between">
						<span className="text-[#737373]">Connect account</span>
						<span className="font-mono text-[11px]">{status.stripeAccountId}</span>
					</div>
					<div className="flex justify-between">
						<span className="text-[#737373]">Payouts enabled</span>
						<span className={status.payoutsEnabled ? "text-emerald-700" : "text-amber-700"}>
							{status.payoutsEnabled ? "Yes" : "No"}
						</span>
					</div>
					{status.countryCode ? (
						<div className="flex justify-between">
							<span className="text-[#737373]">Country</span>
							<span>{status.countryCode}</span>
						</div>
					) : null}
					{status.requirementsCurrentlyDue.length > 0 ? (
						<div className="pt-1 border-t border-[#e5e5e5]/60">
							<div className="text-[#737373] mb-0.5">Outstanding requirements</div>
							<ul className="list-disc pl-4 text-[11px]">
								{status.requirementsCurrentlyDue.slice(0, 5).map((r) => (
									<li key={r}>{r}</li>
								))}
								{status.requirementsCurrentlyDue.length > 5 ? (
									<li>+ {status.requirementsCurrentlyDue.length - 5} more</li>
								) : null}
							</ul>
						</div>
					) : null}
					{status.requirementsDisabledReason ? (
						<div className="flex justify-between border-t border-[#e5e5e5]/60 pt-1">
							<span className="text-[#737373]">Disabled reason</span>
							<span className="text-rose-700">{status.requirementsDisabledReason}</span>
						</div>
					) : null}
				</div>
			) : null}

			<div className="flex justify-end gap-2">
				{showRefresh ? (
					<Button
						variant="outline"
						size="sm"
						disabled={refreshMutation.isPending}
						onClick={() =>
							partnerId && refreshMutation.mutate({ organizationId, partnerId })
						}
					>
						<RefreshCw
							className={cn(
								"mr-2 h-3.5 w-3.5",
								refreshMutation.isPending && "animate-spin",
							)}
						/>
						Refresh from Stripe
					</Button>
				) : null}
				{showOnboard ? (
					<Button
						size="sm"
						disabled={onboardingMutation.isPending || !selectedMember}
						onClick={() =>
							partnerId && onboardingMutation.mutate({ organizationId, partnerId })
						}
					>
						<ExternalLink className="mr-2 h-3.5 w-3.5" />
						{status?.detailsSubmitted ? "Re-onboard via Stripe" : "Start Stripe onboarding"}
					</Button>
				) : null}
			</div>
		</div>
	);
}
