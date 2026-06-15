import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { requirePermission } from "@/lib/route-guards";
import { ArrowLeft, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserContext } from "@/hooks/useUserContext";
import { client, orpc } from "@/utils/orpc";
import { QrCodeCard } from "@/features/branch-invites/components/qr-code-card";

// routeTree.gen.ts will be updated by TanStack Router devtools on next dev run.
export const Route = createFileRoute(
	"/_authenticated/dashboard/_layout/branch/$id",
)({
	beforeLoad: async () => {
		await requirePermission("hierarchy_management:read");
	},
	component: BranchDetailPage,
});

function BranchDetailPage() {
	const rawParams = Route.useParams();
	const branchId = (rawParams as { id?: string }).id ?? "";
	const { data: userContext, isLoading: isLoadingContext } = useUserContext();

	const organizationId = userContext?.currentOrganizationId ?? null;

	// Fetch branch details (re-use listNodes and filter by id)
	const { data: nodesData, isLoading: isLoadingNode } = useQuery({
		...orpc.hierarchy.listNodes.queryOptions({
			input: { organizationId: organizationId! },
		}),
		enabled: !!organizationId,
	});

	const branch = nodesData?.nodes?.find(
		(n: { id: string; type: string }) =>
			n.id === branchId && n.type === "branch",
	) as
		| {
				id: string;
				name: string;
				type: string;
				depth: number;
				parentId: string | null;
				address?: string | null;
				createdAt: Date | null;
				updatedAt: Date | null;
		  }
		| undefined;

	const isLoading = isLoadingContext || isLoadingNode;

	if (isLoading) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm p-6 space-y-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	if (!branch || !organizationId) {
		return (
			<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm p-6 items-center justify-center">
				<p className="text-muted-foreground text-sm">Branch not found.</p>
				<Link to="/dashboard/branch/view" className="mt-3">
					<Button variant="outline" size="sm">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Branches
					</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="flex h-[calc(100vh-48px)] flex-col rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
			{/* Header */}
			<div className="flex shrink-0 items-center justify-between px-6 pt-6 pb-4 border-b">
				<div className="flex items-center gap-3">
					<Link to="/dashboard/branch/view">
						<Button variant="ghost" size="icon" className="h-8 w-8 mr-1">
							<ArrowLeft className="h-4 w-4" />
						</Button>
					</Link>
					<div className="p-2 rounded-lg bg-primary/10">
						<Store className="h-5 w-5 text-primary" />
					</div>
					<div>
						<h1 className="text-xl font-semibold">{branch.name}</h1>
						{branch.address && (
							<p className="text-xs text-muted-foreground mt-0.5">
								{branch.address}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-auto p-6 space-y-5">
				{/* Branch info card */}
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-base">Branch Details</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
							<div>
								<dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
									Name
								</dt>
								<dd className="mt-0.5 font-medium">{branch.name}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
									Address
								</dt>
								<dd className="mt-0.5">{branch.address ?? "—"}</dd>
							</div>
							<div>
								<dt className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
									Node ID
								</dt>
								<dd className="mt-0.5 font-mono text-xs text-muted-foreground">
									{branch.id}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				{/* QR onboarding card */}
				<QrCodeCard
					organizationId={organizationId}
					branchId={branchId}
					branchName={branch.name}
				/>
			</div>
		</div>
	);
}
