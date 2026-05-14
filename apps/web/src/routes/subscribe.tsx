import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Check, Star, Zap, Shield } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TIER_LIMITS, type Tier } from "@avantej-core/types";
import { client as orpcClient } from "@/utils/orpc";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/subscribe")({
	component: SubscribePage,
	validateSearch: (search: Record<string, unknown>) => ({
		session_id: search.session_id as string | undefined,
		canceled: search.canceled as string | undefined,
	}),
});

type DisplayPlan = {
	tier: Tier;
	name: string;
	priceMonthly: number; // dollars (display)
	icon: typeof Star;
	highlight: boolean;
	features: string[];
};

const PLANS: DisplayPlan[] = [
	{
		tier: "basic",
		name: "Basic",
		priceMonthly: 49,
		icon: Shield,
		highlight: false,
		features: [
			"1 organization",
			"25 staff / 100 customers",
			"100 transactions / month",
			"3% application fee",
			"Email support",
		],
	},
	{
		tier: "professional",
		name: "Professional",
		priceMonthly: 149,
		icon: Star,
		highlight: true,
		features: [
			"Up to 5 organizations",
			"1,000 customers",
			"1,000 transactions / month",
			"2% application fee",
			"GHL + commission splits + memberships",
			"Email + chat support",
		],
	},
	{
		tier: "enterprise",
		name: "Enterprise",
		priceMonthly: 499,
		icon: Zap,
		highlight: false,
		features: [
			"Unlimited organizations",
			"Unlimited transactions",
			"1.5% application fee",
			"All features",
			"Dedicated CSM",
		],
	},
];

// Suppress unused-import warning — TIER_LIMITS is imported to source plan metadata
// but the static PLANS array above is the primary display structure (ADR-0004 v1 scope).
void TIER_LIMITS;

function SubscribePage() {
	const navigate = useNavigate();
	const { session_id, canceled } = Route.useSearch();
	const { isAuthenticated, isLoading } = useAuth();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			navigate({ to: "/login", search: {} });
		}
	}, [isLoading, isAuthenticated, navigate]);

	useEffect(() => {
		if (canceled) {
			toast.error("Checkout canceled — you can try again any time");
		}
	}, [canceled]);

	const statusQuery = useQuery({
		queryKey: ["subscription-status", session_id],
		queryFn: async () =>
			orpcClient.subscriptions.getStatus({}) as Promise<{
				status: string;
				tier: string | null;
			}>,
		enabled: !!session_id,
		refetchInterval: (query) =>
			query.state.data?.status === "active" ? false : 2000,
	});

	useEffect(() => {
		if (statusQuery.data?.status === "active") {
			toast.success("Subscription active — welcome!");
			navigate({ to: "/dashboard" });
		}
	}, [statusQuery.data, navigate]);

	// react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation -- terminal flow: redirects to Stripe checkout; queries re-fetched on return
	const checkoutMutation = useMutation({
		mutationFn: async ({ tier }: { tier: Tier }) => {
			const res = (await orpcClient.subscriptions.createCheckoutSession({
				tier,
			})) as { checkoutUrl: string; sessionId: string };
			return res;
		},
		onSuccess: (data) => {
			if (data?.checkoutUrl) {
				window.location.assign(data.checkoutUrl);
			} else {
				toast.error("Failed to start checkout — no URL returned");
			}
		},
		onError: (err: unknown) => {
			toast.error(err instanceof Error ? err.message : "Checkout failed");
		},
	});

	if (isLoading || !isAuthenticated) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="size-8 animate-spin" />
			</div>
		);
	}

	if (session_id && statusQuery.data?.status !== "active") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-4">
				<Loader2 className="size-8 animate-spin" />
				<p className="text-muted-foreground">Finalizing your subscription…</p>
				<p className="text-sm text-muted-foreground">
					This usually takes a few seconds.
				</p>
			</div>
		);
	}

	return (
		<div className="container mx-auto max-w-5xl py-12">
			<header className="mb-12 text-center">
				<h1 className="font-bold text-4xl tracking-tight">Choose your plan</h1>
				<p className="mt-2 text-muted-foreground">
					Subscribe to Avantej Core to keep running your business after the
					trial.
				</p>
			</header>

			<div className="grid gap-6 md:grid-cols-3">
				{PLANS.map((plan) => {
					const Icon = plan.icon;
					return (
						<Card
							key={plan.tier}
							className={
								plan.highlight ? "border-primary shadow-lg" : undefined
							}
						>
							<CardHeader>
								<div className="flex items-center gap-2">
									<Icon className="size-5" />
									<CardTitle>{plan.name}</CardTitle>
								</div>
								<CardDescription className="mt-2">
									<span className="font-bold text-3xl text-foreground">
										${plan.priceMonthly}
									</span>{" "}
									/ month
								</CardDescription>
							</CardHeader>
							<CardContent>
								<ul className="space-y-2 text-sm">
									{plan.features.map((feature) => (
										<li key={feature} className="flex items-start gap-2">
											<Check className="mt-0.5 size-4 shrink-0 text-primary" />
											<span>{feature}</span>
										</li>
									))}
								</ul>
							</CardContent>
							<CardFooter>
								<Button
									className="w-full"
									variant={plan.highlight ? "default" : "outline"}
									disabled={checkoutMutation.isPending}
									onClick={() => checkoutMutation.mutate({ tier: plan.tier })}
								>
									{checkoutMutation.isPending &&
									checkoutMutation.variables?.tier === plan.tier
										? "Redirecting…"
										: `Subscribe to ${plan.name}`}
								</Button>
							</CardFooter>
						</Card>
					);
				})}
			</div>

			<footer className="mt-12 text-center text-muted-foreground text-sm">
				<p>
					Already on a plan?{" "}
					<Link to="/dashboard" className="underline">
						Go to your dashboard
					</Link>
				</p>
			</footer>
		</div>
	);
}
