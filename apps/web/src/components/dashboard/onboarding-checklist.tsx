import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { client } from "@/utils/orpc";

interface Props {
	organizationId: string | null;
}

interface ChecklistItem {
	label: string;
	done: boolean;
	href: string;
}

export function OnboardingChecklist({ organizationId }: Props) {
	const queryClient = useQueryClient();

	// Check if the user has already dismissed the onboarding checklist
	const { data: dismissedSetting, isLoading: isDismissedLoading } = useQuery({
		queryKey: ["organizationSettings", organizationId, "onboarding_dismissed"],
		queryFn: () =>
			client.organizationSettings.get({
				organizationId: organizationId!,
				key: "onboarding_dismissed",
			}),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const isDismissed = dismissedSetting !== null && dismissedSetting !== undefined;

	const { data: membersData } = useQuery({
		queryKey: ["members", "list", organizationId],
		queryFn: () => client.members.list({ organizationId: organizationId! }),
		enabled: !!organizationId && !isDismissed,
		staleTime: 60_000,
	});

	const { data: nodesData } = useQuery({
		queryKey: ["hierarchy", "listNodes", organizationId],
		queryFn: () => client.hierarchy.listNodes({ organizationId: organizationId! }),
		enabled: !!organizationId && !isDismissed,
		staleTime: 60_000,
	});

	const { data: servicesData } = useQuery({
		queryKey: ["services", "list", organizationId],
		queryFn: () => client.services.list({ organizationId: organizationId! }),
		enabled: !!organizationId && !isDismissed,
		staleTime: 60_000,
	});

	const { data: salesData } = useQuery({
		queryKey: ["salesOrders", "list", organizationId],
		queryFn: () => client.salesOrders.list({ organizationId: organizationId! }),
		enabled: !!organizationId && !isDismissed,
		staleTime: 60_000,
	});

	const dismissMutation = useMutation({
		mutationFn: () =>
			client.organizationSettings.upsert({
				organizationId: organizationId!,
				key: "onboarding_dismissed",
				value: "true",
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["organizationSettings", organizationId, "onboarding_dismissed"],
			});
		},
	});

	// Don't render while loading the dismissed state or if already dismissed
	if (isDismissedLoading || isDismissed || !organizationId) return null;

	const members = Array.isArray(membersData) ? membersData : [];
	const nodes = Array.isArray(nodesData) ? nodesData : [];
	const services = Array.isArray(servicesData) ? servicesData : [];
	const sales = Array.isArray(salesData) ? salesData : [];

	const items: ChecklistItem[] = [
		{
			label: "Invite first team member",
			done: members.length > 1,
			href: "/dashboard/access-control/invitations",
		},
		{
			label: "Create first branch",
			done: nodes.some((n: { type?: string }) => n.type === "branch"),
			href: "/dashboard/hierarchy/nodes/view",
		},
		{
			label: "Create first service",
			done: services.length > 0,
			href: "/dashboard/services/view",
		},
		{
			label: "Process first sale",
			done: sales.length > 0,
			href: "/dashboard/sales/view",
		},
	];

	const completedCount = items.filter((item) => item.done).length;
	const progressPct = (completedCount / items.length) * 100;

	// All done — offer to dismiss but still show until explicitly dismissed
	return (
		<Card className="border-brand-secondary-3">
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<CardTitle className="text-sm font-bold uppercase tracking-wide text-brand-secondary-1">
						Getting Started
					</CardTitle>
					<span className="text-xs text-brand-secondary-1">
						{completedCount}/{items.length} complete
					</span>
				</div>
				{/* Progress bar */}
				<div className="mt-2 h-2 w-full rounded-full bg-brand-secondary-3">
					<div
						className="h-2 rounded-full bg-brand-primary-1 transition-all duration-500"
						style={{ width: `${progressPct}%` }}
					/>
				</div>
			</CardHeader>
			<CardContent className="space-y-1 pb-4">
				{items.map((item) => (
					<Link
						key={item.label}
						to={item.href}
						className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-brand-secondary-3"
					>
						{item.done ? (
							<CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
						) : (
							<Link2 className="h-4 w-4 shrink-0 text-brand-secondary-1" />
						)}
						<span
							className={`text-sm ${
								item.done
									? "text-brand-secondary-1 line-through"
									: "text-brand-primary-1"
							}`}
						>
							{item.label}
						</span>
					</Link>
				))}

				<div className="pt-2">
					<Button
						variant="ghost"
						size="sm"
						className="text-xs text-brand-secondary-1 hover:text-brand-primary-1"
						onClick={() => dismissMutation.mutate()}
						disabled={dismissMutation.isPending}
					>
						Dismiss
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
