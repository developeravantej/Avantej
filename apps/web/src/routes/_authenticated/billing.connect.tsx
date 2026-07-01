import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	Loader2,
	CheckCircle2,
	AlertCircle,
	ExternalLink,
	Globe,
	Plus,
} from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { client as orpcClient } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";

import { z } from "zod";

export const Route = createFileRoute("/_authenticated/billing/connect")({
	component: BillingConnectPage,
	validateSearch: z.object({
		// The Stripe OAuth callback redirects with `?return=1` (and flows may add
		// `?refresh=1`). TanStack Router's search parser coerces bare numerics to
		// numbers, so `z.string()` would reject `1` ("expected string, received
		// number"). Coerce these flag params so 1 / "1" both parse to "1".
		return: z.coerce.string().optional(),
		refresh: z.coerce.string().optional(),
		oauth_error: z.string().optional(),
		country: z.string().optional(),
	}),
});

type CountryAccount = {
	countryCode: string;
	currency: string;
	stripeAccountId: string | null;
	chargesEnabled: boolean;
	payoutsEnabled: boolean;
	detailsSubmitted: boolean;
	status: string;
	onboardingCompletedAt: Date | null;
};

// SEA + adjacent markets supported by Stripe Connect Standard.
const SUPPORTED_COUNTRIES: Array<{
	code: string;
	name: string;
	currency: string;
}> = [
	{ code: "MY", name: "Malaysia", currency: "MYR" },
	{ code: "SG", name: "Singapore", currency: "SGD" },
	{ code: "TH", name: "Thailand", currency: "THB" },
	{ code: "ID", name: "Indonesia", currency: "IDR" },
	{ code: "PH", name: "Philippines", currency: "PHP" },
	{ code: "HK", name: "Hong Kong", currency: "HKD" },
	{ code: "AU", name: "Australia", currency: "AUD" },
	{ code: "NZ", name: "New Zealand", currency: "NZD" },
	{ code: "US", name: "United States", currency: "USD" },
	{ code: "GB", name: "United Kingdom", currency: "GBP" },
	{ code: "JP", name: "Japan", currency: "JPY" },
];

function BillingConnectPage() {
	const { isLoading, data: userContext } = useUserContext();
	const {
		return: returnedFromOnboarding,
		refresh,
		oauth_error,
	} = Route.useSearch();
	const [addOpen, setAddOpen] = useState(false);

	const currentOrganizationId =
		userContext?.currentOrganizationId ??
		userContext?.organizations?.[0]?.id ??
		null;

	const listQuery = useQuery({
		queryKey: ["stripe-connect-countries", currentOrganizationId],
		queryFn: async () =>
			(await orpcClient.stripeConnect.listCountryAccounts({
				organizationId: currentOrganizationId as string,
			})) as { accounts: CountryAccount[] },
		enabled: !!currentOrganizationId,
		refetchInterval: (q) => {
			// While we're waiting on Stripe to push verification status post-onboarding,
			// keep polling so the UI flips to Active as soon as webhook lands.
			const accts = q.state.data?.accounts ?? [];
			const hasPending = accts.some(
				(a) => a.stripeAccountId && !a.chargesEnabled,
			);
			return returnedFromOnboarding && hasPending ? 3000 : false;
		},
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
		mutationFn: async (countryCode: string | undefined) => {
			if (!currentOrganizationId) {
				throw new Error(
					"No organization context — sign in and pick an org first",
				);
			}
			return (await orpcClient.stripeConnect.createOnboardingUrl({
				organizationId: currentOrganizationId,
				countryCode,
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
			toast.error(
				err instanceof Error ? err.message : "Failed to start onboarding",
			);
		},
	});

	const accounts = listQuery.data?.accounts ?? [];
	const linkedCountries = useMemo(
		() => new Set(accounts.map((a) => a.countryCode)),
		[accounts],
	);
	const availableCountries = useMemo(
		() => SUPPORTED_COUNTRIES.filter((c) => !linkedCountries.has(c.code)),
		[linkedCountries],
	);

	if (isLoading || listQuery.isLoading) {
		return (
			<div className="flex min-h-[50vh] items-center justify-center">
				<Loader2 className="size-8 animate-spin" />
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-3xl py-12">
			<header className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h1 className="font-bold text-3xl tracking-tight">
						Payment processing
					</h1>
					<p className="mt-2 text-muted-foreground">
						Connect a Stripe account per country your business operates in. Each
						account settles in its own currency; Avantej takes a per-transaction
						platform fee.
					</p>
				</div>
				<Button
					onClick={() => setAddOpen(true)}
					disabled={availableCountries.length === 0}
				>
					<Plus className="mr-1 size-4" />
					Add country
				</Button>
			</header>

			{accounts.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center gap-4 py-12 text-center">
						<Globe className="size-10 text-muted-foreground" />
						<div>
							<p className="font-medium">No Stripe accounts connected yet</p>
							<p className="mt-1 text-muted-foreground text-sm">
								Connect a Stripe account for each country to start accepting
								payments.
							</p>
						</div>
						<Button onClick={() => setAddOpen(true)}>
							<Plus className="mr-1 size-4" />
							Connect first country
						</Button>
					</CardContent>
				</Card>
			) : (
				<div className="space-y-3">
					{accounts.map((acct) => (
						<CountryAccountCard
							key={acct.countryCode}
							account={acct}
							onContinue={() => connectMutation.mutate(acct.countryCode)}
							continueLoading={
								connectMutation.isPending &&
								connectMutation.variables === acct.countryCode
							}
						/>
					))}
				</div>
			)}

			<AddCountryDialog
				open={addOpen}
				onClose={() => setAddOpen(false)}
				availableCountries={availableCountries}
				onConnect={(countryCode) => connectMutation.mutate(countryCode)}
				connectLoading={connectMutation.isPending}
			/>
		</div>
	);
}

function CountryAccountCard({
	account,
	onContinue,
	continueLoading,
}: {
	account: CountryAccount;
	onContinue: () => void;
	continueLoading: boolean;
}) {
	const isActive = account.chargesEnabled;
	const isPending = !!account.stripeAccountId && !isActive;
	const countryName =
		SUPPORTED_COUNTRIES.find((c) => c.code === account.countryCode)?.name ??
		account.countryCode;

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						<div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-100 font-bold text-sm uppercase">
							{account.countryCode}
						</div>
						<div>
							<CardTitle className="text-base">{countryName}</CardTitle>
							<CardDescription className="mt-0.5">
								{account.stripeAccountId
									? `${account.stripeAccountId} • ${account.currency}`
									: `No account yet • ${account.currency}`}
							</CardDescription>
						</div>
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
				</div>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="grid grid-cols-3 gap-2 text-sm">
					<StatusRow label="Charges" ok={account.chargesEnabled} />
					<StatusRow label="Payouts" ok={account.payoutsEnabled} />
					<StatusRow label="Details" ok={account.detailsSubmitted} />
				</div>
				{isPending && (
					<Button
						variant="outline"
						size="sm"
						onClick={onContinue}
						disabled={continueLoading}
						className="w-full"
					>
						{continueLoading && (
							<Loader2 className="mr-2 size-4 animate-spin" />
						)}
						Continue onboarding
						<ExternalLink className="ml-2 size-3.5" />
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

function AddCountryDialog({
	open,
	onClose,
	availableCountries,
	onConnect,
	connectLoading,
}: {
	open: boolean;
	onClose: () => void;
	availableCountries: Array<{ code: string; name: string; currency: string }>;
	onConnect: (countryCode: string) => void;
	connectLoading: boolean;
}) {
	const [selected, setSelected] = useState<string>("");

	const handleConnect = () => {
		if (!selected) return;
		onConnect(selected);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Connect Stripe for a new country</DialogTitle>
					<DialogDescription>
						Stripe Connect accounts are country-locked. Pick the country whose
						branches will charge customers in that country's native currency.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="country-select">Country</Label>
						<Select value={selected} onValueChange={setSelected}>
							<SelectTrigger id="country-select">
								<SelectValue placeholder="Select country" />
							</SelectTrigger>
							<SelectContent>
								{availableCountries.map((c) => (
									<SelectItem key={c.code} value={c.code}>
										{c.name} ({c.currency})
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={onClose} disabled={connectLoading}>
						Cancel
					</Button>
					<Button
						onClick={handleConnect}
						disabled={!selected || connectLoading}
					>
						{connectLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
						Connect Stripe
						<ExternalLink className="ml-2 size-4" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
	return (
		<div className="rounded-md border p-2.5">
			<div className="text-muted-foreground text-xs">{label}</div>
			<div className="mt-0.5 flex items-center gap-1.5 font-medium text-sm">
				{ok ? (
					<>
						<CheckCircle2 className="size-3.5 text-green-600" />
						<span>Yes</span>
					</>
				) : (
					<>
						<AlertCircle className="size-3.5 text-muted-foreground" />
						<span className="text-muted-foreground">No</span>
					</>
				)}
			</div>
		</div>
	);
}
