import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { client as orpcClient } from "@/utils/orpc";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/billing/connect")({
	component: BillingConnectPage,
	validateSearch: (search: Record<string, unknown>) => ({
		return: search.return as string | undefined,
		refresh: search.refresh as string | undefined,
		oauth_error: search.oauth_error as string | undefined,
	}),
});

function BillingConnectPage() {
	const { isLoading, user } = useAuth();
	const { return: returnedFromOnboarding, refresh, oauth_error } = Route.useSearch();

	const currentOrganizationId =
		(user as { current_organization_id?: string | null; organizations?: Array<{ id: string }> } | null)
			?.current_organization_id ??
		(user as { organizations?: Array<{ id: string }> } | null)?.organizations?.[0]?.id ??
		null;

	const statusQuery = useQuery({
		queryKey: ["stripe-connect-status", currentOrganizationId],
		queryFn: async () =>
			orpcClient.stripeConnect.getAccountStatus({
				organizationId: currentOrganizationId as string,
			}) as Promise<{
				connected: boolean;
				accountId: string | null;
				chargesEnabled: boolean;
				payoutsEnabled: boolean;
				detailsSubmitted: boolean;
				status: string;
			}>,
		enabled: !!currentOrganizationId,
		refetchInterval: (query) =>
			returnedFromOnboarding && !query.state.data?.chargesEnabled ? 3000 : false,
	});

	useEffect(() => {
		if (returnedFromOnboarding) {
			toast.success("Returned from Stripe — checking account status…");
		}
		if (refresh) {
			toast.info("Onboarding link expired — generate a new one");
		}
		if (oauth_error) {
			toast.error(`Stripe Connect failed: ${oauth_error}`);
		}
	}, [returnedFromOnboarding, refresh, oauth_error]);

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- redirect-out flow; status re-fetched on return via refetchInterval
	const connectMutation = useMutation({
		mutationFn: async () => {
			if (!currentOrganizationId) {
				throw new Error("No organization context — sign in and pick an org first");
			}
			return (await orpcClient.stripeConnect.createOnboardingUrl({
				organizationId: currentOrganizationId,
			})) as { onboardingUrl: string };
		},
		onSuccess: (data) => {
			if (data?.onboardingUrl) {
				window.location.assign(data.onboardingUrl);
			} else {
				toast.error("Failed to start onboarding — no URL returned");
			}
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Failed to start onboarding");
		},
	});

	if (isLoading || statusQuery.isLoading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<Loader2 className="size-8 animate-spin" />
			</div>
		);
	}

	const status = statusQuery.data;
	const isActive = !!status?.chargesEnabled;
	const isPending = !!status?.connected && !isActive;
	const isDisconnected = !status?.connected;

	return (
		<div className="container mx-auto max-w-3xl py-12">
			<header className="mb-8">
				<h1 className="font-bold text-3xl tracking-tight">Payment processing</h1>
				<p className="mt-2 text-muted-foreground">
					Connect your Stripe account to accept payments from customers. Payouts go
					directly to your bank account; Avantej takes a per-transaction platform fee.
				</p>
			</header>

			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle>Stripe Connect</CardTitle>
							<CardDescription className="mt-1">
								{status?.accountId
									? `Account: ${status.accountId}`
									: "No Stripe account connected yet"}
							</CardDescription>
						</div>
						{isActive && (
							<Badge className="gap-1.5 bg-green-600 hover:bg-green-700">
								<CheckCircle2 className="size-3.5" /> Active
							</Badge>
						)}
						{isPending && (
							<Badge variant="secondary" className="gap-1.5">
								<AlertCircle className="size-3.5" /> Onboarding incomplete
							</Badge>
						)}
						{isDisconnected && (
							<Badge variant="outline" className="gap-1.5">
								Not connected
							</Badge>
						)}
					</div>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-3 gap-4 text-sm">
						<StatusRow label="Charges enabled" ok={!!status?.chargesEnabled} />
						<StatusRow label="Payouts enabled" ok={!!status?.payoutsEnabled} />
						<StatusRow label="Details submitted" ok={!!status?.detailsSubmitted} />
					</div>
					{isActive && (
						<p className="rounded-md bg-green-50 p-3 text-green-900 text-sm dark:bg-green-950 dark:text-green-100">
							Your account is fully active. You can accept payments from customers.
						</p>
					)}
					{isPending && (
						<p className="rounded-md bg-amber-50 p-3 text-amber-900 text-sm dark:bg-amber-950 dark:text-amber-100">
							Stripe still needs more information before you can accept payments.
							Continue onboarding to finish.
						</p>
					)}
				</CardContent>
				<CardFooter className="gap-2">
					<Button
						onClick={() => connectMutation.mutate()}
						disabled={connectMutation.isPending || isActive}
					>
						{connectMutation.isPending && (
							<Loader2 className="mr-2 size-4 animate-spin" />
						)}
						{isDisconnected
							? "Connect Stripe"
							: isPending
								? "Continue onboarding"
								: "Account active"}
						{!isActive && <ExternalLink className="ml-2 size-4" />}
					</Button>
					{status?.accountId && (
						<Button
							variant="outline"
							onClick={() => statusQuery.refetch()}
							disabled={statusQuery.isFetching}
						>
							{statusQuery.isFetching && (
								<Loader2 className="mr-2 size-4 animate-spin" />
							)}
							Refresh status
						</Button>
					)}
				</CardFooter>
			</Card>
		</div>
	);
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
	return (
		<div className="rounded-md border p-3">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-1 flex items-center gap-1.5 font-medium">
				{ok ? (
					<>
						<CheckCircle2 className="size-4 text-green-600" />
						<span>Yes</span>
					</>
				) : (
					<>
						<AlertCircle className="size-4 text-muted-foreground" />
						<span className="text-muted-foreground">No</span>
					</>
				)}
			</div>
		</div>
	);
}
